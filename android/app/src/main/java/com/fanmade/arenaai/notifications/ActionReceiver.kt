package com.fanmade.arenaai.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import com.fanmade.arenaai.data.Prefs
import com.fanmade.arenaai.ui.UiEvents

/** Bildirim üzerindeki "Yanıtla" ve "Kopyala" düğmelerini işler. */
class ActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_COPY -> {
                val text = intent.getStringExtra(EXTRA_TEXT).orEmpty()
                Notifier.copyToClipboard(context, text)
            }

            ACTION_REPLY -> {
                val results = RemoteInput.getResultsFromIntent(intent)
                val text = results?.getCharSequence(KEY_QUICK_REPLY)?.toString()?.trim().orEmpty()
                if (text.isEmpty()) return

                // Uygulama açıksa WebView'a doğrudan gönderilir, değilse kuyruğa alınır.
                Prefs.init(context)
                Prefs.pendingPrompt = text
                UiEvents.prompts.tryEmit(text)
                Notifier.notifyInfo(
                    context,
                    context.getString(R.string.notification_queued),
                    text,
                    PENDING_ID,
                )
            }
        }
    }

    companion object {
        const val ACTION_REPLY = "com.fanmade.arenaai.action.REPLY"
        const val ACTION_COPY = "com.fanmade.arenaai.action.COPY"
        const val EXTRA_TEXT = "extra_text"
        const val EXTRA_URL = "extra_url"
        const val KEY_QUICK_REPLY = "key_quick_reply"
        const val PENDING_ID = 1800
    }
}
