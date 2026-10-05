package com.fanmade.arenaai.web

import android.content.Context
import com.fanmade.arenaai.data.Prefs
import org.json.JSONObject

/** assets/arena_monitor.js içeriğini güncel ayarlarla birleştirir. */
object MonitorJs {

    fun script(context: Context): String {
        val raw = context.assets.open("arena_monitor.js").bufferedReader().use { it.readText() }
        val config = JSONObject().apply {
            put("debug", Prefs.debugJs)
            put("streamWatch", Prefs.streamWatch)
            put("domWatch", Prefs.domWatch)
            put("domPollMs", 700)
            put("domMinMs", 2500)
            put("minStreamChunks", 1)
        }
        return raw.replace("__CONFIG__", config.toString())
    }
}
