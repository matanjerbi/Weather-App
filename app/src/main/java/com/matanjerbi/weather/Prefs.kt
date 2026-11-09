package com.matanjerbi.weather

import android.content.Context
import org.json.JSONObject

object Prefs {
    private const val FILE = "weather_prefs"

    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun saveConfig(ctx: Context, json: String) {
        sp(ctx).edit().putString("config", json).apply()
    }

    fun config(ctx: Context): JSONObject? {
        val raw = sp(ctx).getString("config", null) ?: return null
        return try { JSONObject(raw) } catch (e: Exception) { null }
    }

    fun lastSent(ctx: Context, key: String): Long = sp(ctx).getLong("sent_$key", 0L)

    fun markSent(ctx: Context, key: String) {
        sp(ctx).edit().putLong("sent_$key", System.currentTimeMillis()).apply()
    }

    fun putString(ctx: Context, key: String, value: String) {
        sp(ctx).edit().putString(key, value).apply()
    }

    fun getString(ctx: Context, key: String, def: String): String = sp(ctx).getString(key, def) ?: def
}
