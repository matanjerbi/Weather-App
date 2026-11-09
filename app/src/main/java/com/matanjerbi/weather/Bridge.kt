package com.matanjerbi.weather

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat

/** Exposed to the web app as window.Native */
class Bridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun isNative(): Boolean = true

    /** Alert settings + location, as JSON written by the web app. */
    @JavascriptInterface
    fun saveConfig(json: String) {
        Prefs.saveConfig(activity, json)
        AlertScheduler.ensure(activity)
    }

    @JavascriptInterface
    fun hasNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < 33) return true
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    @JavascriptInterface
    fun requestNotificationPermission() {
        activity.runOnUiThread { activity.requestNotifications() }
    }

    /** Push a summary to the home-screen widget. */
    @JavascriptInterface
    fun updateWidget(place: String, temp: String, icon: String, desc: String, extra: String) {
        WeatherWidget.save(activity, place, temp, icon, desc, extra)
        WeatherWidget.refreshAll(activity)
    }

    @JavascriptInterface
    fun testAlert() {
        Notifier.show(activity, 999, "בדיקת התראה", "ככה תיראה התראת מזג אוויר מהאפליקציה")
    }

    @JavascriptInterface
    fun runCheckNow() {
        AlertScheduler.runOnce(activity)
    }
}
