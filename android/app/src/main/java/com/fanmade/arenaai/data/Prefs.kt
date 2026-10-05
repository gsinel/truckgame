package com.fanmade.arenaai.data

import android.content.Context
import android.content.SharedPreferences

/**
 * Uygulama ayarları. Fan-made uygulama, tek süreçli: basit SharedPreferences yeterli.
 */
object Prefs {

    private const val FILE = "arena_ai_prefs"

    private const val K_NOTIFICATIONS = "notifications"
    private const val K_SOUND = "sound"
    private const val K_VIBRATE = "vibrate"
    private const val K_HIDE_CONTENT = "hide_content"
    private const val K_STREAM_WATCH = "stream_watch"
    private const val K_DOM_WATCH = "dom_watch"
    private const val K_BACKGROUND_WATCH = "background_watch"
    private const val K_PROGRESS_NOTIFICATION = "progress_notification"
    private const val K_START_URL = "start_url"
    private const val K_DARK_APP = "dark_app"
    private const val K_DARK_WEB = "dark_web"
    private const val K_EXTERNAL_IN_APP = "external_in_app"
    private const val K_DEBUG_JS = "debug_js"
    private const val K_AUTO_STOP_SECONDS = "auto_stop_seconds"
    private const val K_HISTORY = "history"
    private const val K_PENDING_PROMPT = "pending_prompt"

    private lateinit var sp: SharedPreferences

    fun init(context: Context) {
        if (!::sp.isInitialized) {
            sp = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        }
    }

    private fun bool(key: String, default: Boolean): Boolean =
        if (::sp.isInitialized) sp.getBoolean(key, default) else default

    private fun putBool(key: String, value: Boolean) {
        if (::sp.isInitialized) sp.edit().putBoolean(key, value).apply()
    }

    private fun string(key: String, default: String): String =
        (if (::sp.isInitialized) sp.getString(key, null) else null) ?: default

    private fun putString(key: String, value: String) {
        if (::sp.isInitialized) sp.edit().putString(key, value).apply()
    }

    private fun int(key: String, default: Int): Int =
        if (::sp.isInitialized) sp.getInt(key, default) else default

    private fun putInt(key: String, value: Int) {
        if (::sp.isInitialized) sp.edit().putInt(key, value).apply()
    }

    /** Bildirimler tamamen kapalıysa hiçbir şey gösterilmez. */
    var notifications: Boolean
        get() = bool(K_NOTIFICATIONS, true)
        set(value) = putBool(K_NOTIFICATIONS, value)

    var sound: Boolean
        get() = bool(K_SOUND, true)
        set(value) = putBool(K_SOUND, value)

    var vibrate: Boolean
        get() = bool(K_VIBRATE, true)
        set(value) = putBool(K_VIBRATE, value)

    /** Kilit ekranında yanıt içeriğini gizle. */
    var hideContent: Boolean
        get() = bool(K_HIDE_CONTENT, false)
        set(value) = putBool(K_HIDE_CONTENT, value)

    /** fetch / XHR / SSE akış izleyici (birincil yöntem). */
    var streamWatch: Boolean
        get() = bool(K_STREAM_WATCH, true)
        set(value) = putBool(K_STREAM_WATCH, value)

    /** DOM "durdur" düğmesi izleyici (yedek yöntem). */
    var domWatch: Boolean
        get() = bool(K_DOM_WATCH, true)
        set(value) = putBool(K_DOM_WATCH, value)

    /** Arka planda / ekran kapalıyken izlemeyi sürdür (foreground service + wake lock). */
    var backgroundWatch: Boolean
        get() = bool(K_BACKGROUND_WATCH, true)
        set(value) = putBool(K_BACKGROUND_WATCH, value)

    /** "Arena AI izleniyor" kalıcı bildirimi. */
    var progressNotification: Boolean
        get() = bool(K_PROGRESS_NOTIFICATION, true)
        set(value) = putBool(K_PROGRESS_NOTIFICATION, value)

    var startUrl: String
        get() = string(K_START_URL, "https://arena.ai/chat")
        set(value) = putString(K_START_URL, value)

    var darkApp: Boolean
        get() = bool(K_DARK_APP, true)
        set(value) = putBool(K_DARK_APP, value)

    var darkWeb: Boolean
        get() = bool(K_DARK_WEB, false)
        set(value) = putBool(K_DARK_WEB, value)

    /** Harici bağlantılar WebView içinde kalsın mı (varsayılan: tarayıcıda aç). */
    var externalInApp: Boolean
        get() = bool(K_EXTERNAL_IN_APP, false)
        set(value) = putBool(K_EXTERNAL_IN_APP, value)

    var debugJs: Boolean
        get() = bool(K_DEBUG_JS, false)
        set(value) = putBool(K_DEBUG_JS, value)

    /** Son iş bittikten kaç saniye sonra izleme servisi kapatılsın. */
    var autoStopSeconds: Int
        get() = int(K_AUTO_STOP_SECONDS, 45)
        set(value) = putInt(K_AUTO_STOP_SECONDS, value)

    var history: String
        get() = string(K_HISTORY, "[]")
        set(value) = putString(K_HISTORY, value)

    /** Bildirimden yazılan hızlı yanıt; uygulama açıldığında gönderilir. */
    var pendingPrompt: String
        get() = string(K_PENDING_PROMPT, "")
        set(value) = putString(K_PENDING_PROMPT, value)
}
