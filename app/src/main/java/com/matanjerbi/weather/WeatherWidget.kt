package com.matanjerbi.weather

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class WeatherWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) manager.updateAppWidget(id, views(context))
        AlertScheduler.runOnce(context)
    }

    companion object {
        fun save(ctx: Context, place: String, temp: String, icon: String, desc: String, extra: String) {
            Prefs.putString(ctx, "w_place", place)
            Prefs.putString(ctx, "w_temp", temp)
            Prefs.putString(ctx, "w_icon", icon)
            Prefs.putString(ctx, "w_desc", desc)
            Prefs.putString(ctx, "w_extra", extra)
        }

        private fun views(ctx: Context): RemoteViews {
            val v = RemoteViews(ctx.packageName, R.layout.widget_weather)
            v.setTextViewText(R.id.w_place, Prefs.getString(ctx, "w_place", "אטמוספרה"))
            v.setTextViewText(R.id.w_temp, Prefs.getString(ctx, "w_temp", "--°"))
            v.setTextViewText(R.id.w_icon, Prefs.getString(ctx, "w_icon", ""))
            v.setTextViewText(R.id.w_desc, Prefs.getString(ctx, "w_desc", "פתח את האפליקציה לעדכון"))
            v.setTextViewText(R.id.w_extra, Prefs.getString(ctx, "w_extra", ""))
            val intent = Intent(ctx, MainActivity::class.java)
            val pi = PendingIntent.getActivity(ctx, 1, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            v.setOnClickPendingIntent(R.id.widget_root, pi)
            return v
        }

        fun refreshAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, WeatherWidget::class.java))
            for (id in ids) mgr.updateAppWidget(id, views(ctx))
        }
    }
}
