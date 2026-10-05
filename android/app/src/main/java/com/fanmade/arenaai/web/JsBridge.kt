package com.fanmade.arenaai.web

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import com.fanmade.arenaai.monitor.JobRecord
import com.fanmade.arenaai.monitor.MonitorController
import org.json.JSONObject

/**
 * Sayfa içindeki izleyici JS'i ile native taraf arasındaki köprü.
 * Metotlar "JavaBridge" thread'inde çağrılır; main thread'e geçilir.
 */
class JsBridge {

    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun onJobStart(payload: String) {
        post { MonitorController.onStart(JobRecord.start(payload)) }
    }

    @JavascriptInterface
    fun onJobProgress(payload: String) {
        post {
            val obj = runCatching { JSONObject(payload) }.getOrNull() ?: return@post
            MonitorController.onProgress(obj.optString("id", ""), obj.optInt("chunks", 0))
        }
    }

    @JavascriptInterface
    fun onJobDone(payload: String) {
        post { MonitorController.onDone(JobRecord.done(payload)) }
    }

    @JavascriptInterface
    fun onJobFail(payload: String) {
        post {
            val obj = runCatching { JSONObject(payload) }.getOrNull() ?: return@post
            MonitorController.onFail(obj.optString("id", ""), obj.optString("reason", ""))
        }
    }

    @JavascriptInterface
    fun log(payload: String) {
        val obj = runCatching { JSONObject(payload) }.getOrNull()
        android.util.Log.d("ArenaMonitor", obj?.optString("message") ?: payload)
    }

    private fun post(block: () -> Unit) {
        main.post { runCatching(block) }
    }
}
