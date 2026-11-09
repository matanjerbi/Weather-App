package com.matanjerbi.weather

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

object AlertScheduler {
    private const val NAME = "weather_alert_check"

    fun ensure(ctx: Context) {
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val req = PeriodicWorkRequestBuilder<AlertWorker>(30, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    fun runOnce(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<AlertWorker>().build()
        WorkManager.getInstance(ctx).enqueue(req)
    }
}

class AlertWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        val cfg = Prefs.config(ctx) ?: return@withContext Result.success()
        val lat = cfg.optDouble("lat", Double.NaN)
        val lon = cfg.optDouble("lon", Double.NaN)
        if (lat.isNaN() || lon.isNaN()) return@withContext Result.success()
        val place = cfg.optString("place", "")
        val alerts = cfg.optJSONObject("alerts") ?: JSONObject()

        val url = String.format(
            Locale.US,
            "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f" +
                "&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,precipitation" +
                "&minutely_15=precipitation" +
                "&hourly=wind_gusts_10m,relative_humidity_2m,temperature_2m" +
                "&daily=temperature_2m_max,temperature_2m_min" +
                "&forecast_days=2&timezone=auto&timeformat=unixtime",
            lat, lon
        )
        val data = try { fetch(url) } catch (e: Exception) { return@withContext Result.retry() }

        updateWidget(ctx, place, data)

        if (!alerts.optBoolean("enabled", false)) return@withContext Result.success()

        val nowSec = System.currentTimeMillis() / 1000
        val today = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)
        val hourNow = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)

        // 1) Rain arriving within the next hour
        if (alerts.optBoolean("rain", true)) {
            val m = data.optJSONObject("minutely_15")
            if (m != null) {
                val times = m.getJSONArray("time")
                val p = m.getJSONArray("precipitation")
                var nowRain = 0.0
                var next = 0.0
                var firstMinutes = -1
                for (i in 0 until times.length()) {
                    val t = times.getLong(i)
                    val v = p.optDouble(i, 0.0).let { if (it.isNaN()) 0.0 else it }
                    if (t <= nowSec && t > nowSec - 900) nowRain = v
                    if (t > nowSec && t <= nowSec + 3600) {
                        next += v
                        if (v >= 0.1 && firstMinutes < 0) firstMinutes = ((t - nowSec) / 60).toInt()
                    }
                }
                val current = data.optJSONObject("current")?.optDouble("precipitation", 0.0) ?: 0.0
                if (nowRain < 0.05 && current < 0.05 && next >= 0.3 &&
                    System.currentTimeMillis() - Prefs.lastSent(ctx, "rain") > 3 * 3600_000L
                ) {
                    val mins = if (firstMinutes < 0) 60 else maxOf(firstMinutes, 15)
                    Notifier.show(
                        ctx, 1, "🌧️ גשם מתקרב",
                        "צפוי גשם בעוד כ-$mins דקות${if (place.isNotEmpty()) " ב$place" else ""} (כ-${"%.1f".format(next)} מ\"מ בשעה הקרובה). פתח את שכבת המכ\"ם כדי לראות מאיפה הוא מגיע."
                    )
                    Prefs.markSent(ctx, "rain")
                }
            }
        }

        val hourly = data.optJSONObject("hourly")
        val daily = data.optJSONObject("daily")

        // 2) Strong gusts in the next 6 hours
        if (alerts.optBoolean("wind", true) && hourly != null) {
            val limit = alerts.optDouble("windKmh", 50.0)
            val times = hourly.getJSONArray("time")
            val g = hourly.getJSONArray("wind_gusts_10m")
            var max = 0.0
            var at = 0L
            for (i in 0 until times.length()) {
                val t = times.getLong(i)
                if (t in nowSec..(nowSec + 6 * 3600)) {
                    val v = g.optDouble(i, 0.0)
                    if (!v.isNaN() && v > max) { max = v; at = t }
                }
            }
            if (max >= limit && Prefs.getString(ctx, "wind_day", "") != today.toString()) {
                val c = Calendar.getInstance().apply { timeInMillis = at * 1000 }
                val hh = "%02d:00".format(c.get(Calendar.HOUR_OF_DAY))
                Notifier.show(
                    ctx, 2, "💨 משבי רוח חזקים",
                    "משבים של עד ${max.roundToInt()} קמ\"ש בסביבות $hh. אם אתה על האופנוע — זה מורגש מאוד בצד. תסתכל על הקווים הצפופים בשכבת הלחץ."
                )
                Prefs.putString(ctx, "wind_day", today.toString())
            }
        }

        // 3) Heat / sharav for today (only during the day)
        if (daily != null && hourly != null && hourNow in 6..20) {
            val tmax = daily.getJSONArray("temperature_2m_max").optDouble(0, 0.0)
            val heatLimit = alerts.optDouble("heatC", 35.0)
            var minRh = 100.0
            val times = hourly.getJSONArray("time")
            val rh = hourly.getJSONArray("relative_humidity_2m")
            for (i in 0 until times.length()) {
                val c = Calendar.getInstance().apply { timeInMillis = times.getLong(i) * 1000 }
                if (c.get(Calendar.DAY_OF_YEAR) == today && c.get(Calendar.HOUR_OF_DAY) in 10..17) {
                    val v = rh.optDouble(i, 100.0)
                    if (!v.isNaN() && v < minRh) minRh = v
                }
            }
            val sharav = tmax >= 30 && minRh <= 25
            if (alerts.optBoolean("sharav", true) && sharav && Prefs.getString(ctx, "sharav_day", "") != today.toString()) {
                Notifier.show(
                    ctx, 3, "🔥 שרב היום",
                    "עד ${tmax.roundToInt()}° ולחות של ${minRh.roundToInt()}% בלבד — אוויר חם ויבש מהמדבר. שתה הרבה. רוצה להבין למה? יש שיעור על שרב באפליקציה."
                )
                Prefs.putString(ctx, "sharav_day", today.toString())
                Prefs.putString(ctx, "heat_day", today.toString())
            } else if (alerts.optBoolean("heat", true) && tmax >= heatLimit && Prefs.getString(ctx, "heat_day", "") != today.toString()) {
                Notifier.show(ctx, 4, "🌡️ חם מאוד היום", "צפויות עד ${tmax.roundToInt()}° היום. שתה הרבה מים והימנע מהשמש בצהריים.")
                Prefs.putString(ctx, "heat_day", today.toString())
            }
        }

        Result.success()
    }

    private fun fetch(url: String): JSONObject {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000
        conn.readTimeout = 20000
        try {
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            return JSONObject(body)
        } finally {
            conn.disconnect()
        }
    }

    private fun updateWidget(ctx: Context, place: String, data: JSONObject) {
        val cur = data.optJSONObject("current") ?: return
        val t = cur.optDouble("temperature_2m", Double.NaN)
        if (t.isNaN()) return
        val code = cur.optInt("weather_code", 0)
        val wind = cur.optDouble("wind_speed_10m", 0.0)
        val rh = cur.optDouble("relative_humidity_2m", 0.0)
        val daily = data.optJSONObject("daily")
        val hi = daily?.getJSONArray("temperature_2m_max")?.optDouble(0, Double.NaN) ?: Double.NaN
        val lo = daily?.getJSONArray("temperature_2m_min")?.optDouble(0, Double.NaN) ?: Double.NaN
        val extra = buildString {
            if (!hi.isNaN() && !lo.isNaN()) append("${hi.roundToInt()}° / ${lo.roundToInt()}°  ·  ")
            append("רוח ${wind.roundToInt()} קמ\"ש  ·  לחות ${rh.roundToInt()}%")
        }
        WeatherWidget.save(ctx, place.ifEmpty { "המיקום שלי" }, "${t.roundToInt()}°", WeatherCodes.icon(code), WeatherCodes.text(code), extra)
        WeatherWidget.refreshAll(ctx)
    }
}

object WeatherCodes {
    fun text(code: Int): String = when (code) {
        0 -> "שמיים בהירים"
        1 -> "בהיר ברובו"
        2 -> "מעונן חלקית"
        3 -> "מעונן"
        45, 48 -> "ערפל"
        51, 53, 55 -> "טפטוף"
        56, 57 -> "טפטוף קופא"
        61 -> "גשם קל"
        63 -> "גשם"
        65 -> "גשם חזק"
        66, 67 -> "גשם קופא"
        71, 73, 75, 77 -> "שלג"
        80, 81 -> "ממטרים"
        82 -> "ממטרים עזים"
        85, 86 -> "ממטרי שלג"
        95 -> "סופת רעמים"
        96, 99 -> "סופת רעמים עם ברד"
        else -> ""
    }

    fun icon(code: Int): String = when (code) {
        0 -> "☀️"
        1 -> "🌤️"
        2 -> "⛅"
        3 -> "☁️"
        45, 48 -> "🌫️"
        in 51..67, 80, 81, 82 -> "🌧️"
        in 71..77, 85, 86 -> "❄️"
        in 95..99 -> "⛈️"
        else -> "🌡️"
    }
}
