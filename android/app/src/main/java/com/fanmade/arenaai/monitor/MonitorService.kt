package com.fanmade.arenaai.monitor

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.fanmade.arenaai.data.Prefs
import com.fanmade.arenaai.notifications.Notifier

/**
 * Arka planda (ekran kapalıyken bile) WebView oturumunu ve ağ akışını canlı tutan
 * ön plan servisi. Yanıt bitene kadar süreç öldürülmesin diye partial wake lock tutar.
 */
class MonitorService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            MonitorController.stopAll()
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = Notifier.buildProgress(this, MonitorController.active.value.size)
        runCatching {
            ServiceCompat.startForeground(
                this,
                Notifier.ID_PROGRESS,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        }.onFailure {
            startForeground(Notifier.ID_PROGRESS, notification)
        }

        acquireWakeLock()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
    }

    private fun acquireWakeLock() {
        if (wakeLock != null) return
        val manager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "arenaai:monitor").apply {
            setReferenceCounted(false)
            runCatching { acquire(30 * 60 * 1000L) }
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let { runCatching { if (it.isHeld) it.release() } }
        wakeLock = null
    }

    companion object {
        const val ACTION_STOP = "com.fanmade.arenaai.action.STOP_WATCHING"

        fun start(context: Context) {
            if (!Prefs.backgroundWatch) return
            val intent = Intent(context, MonitorService::class.java)
            runCatching { ContextCompat.startForegroundService(context, intent) }
        }

        fun stop(context: Context) {
            runCatching { context.stopService(Intent(context, MonitorService::class.java)) }
        }
    }
}
