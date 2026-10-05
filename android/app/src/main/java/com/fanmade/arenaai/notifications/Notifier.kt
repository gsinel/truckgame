package com.fanmade.arenaai.notifications

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import com.fanmade.arenaai.MainActivity
import com.fanmade.arenaai.R
import com.fanmade.arenaai.data.Prefs
import com.fanmade.arenaai.monitor.JobRecord
import com.fanmade.arenaai.monitor.MonitorService
import kotlin.math.abs

object Notifier {

    const val CH_COMPLETIONS = "arena_completions"
    const val CH_PROGRESS = "arena_progress"
    const val ID_PROGRESS = 1001

    private const val KEY_QUICK_REPLY = "key_quick_reply"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val completions = android.app.NotificationChannel(
            CH_COMPLETIONS,
            context.getString(R.string.channel_completions_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.channel_completions_desc)
            enableVibration(true)
        }

        val progress = android.app.NotificationChannel(
            CH_PROGRESS,
            context.getString(R.string.channel_progress_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = context.getString(R.string.channel_progress_desc)
            setSound(null, null)
            enableVibration(false)
        }

        manager.createNotificationChannel(completions)
        manager.createNotificationChannel(progress)
    }

    private fun canPost(context: Context): Boolean {
        if (!Prefs.notifications) return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun idFor(recordId: String): Int = 2000 + (abs(recordId.hashCode()) % 50_000)

    private fun contentIntent(context: Context, url: String, requestCode: Int): PendingIntent {
        val target = if (url.isNotBlank()) {
            Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url), context, MainActivity::class.java)
        } else {
            Intent(context, MainActivity::class.java)
        }
        target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            context,
            requestCode,
            target,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun applyAlert(builder: NotificationCompat.Builder) {
        var defaults = 0
        if (Prefs.sound) defaults = defaults or NotificationCompat.DEFAULT_SOUND
        if (Prefs.vibrate) defaults = defaults or NotificationCompat.DEFAULT_VIBRATE
        builder.setDefaults(defaults)
        builder.setPriority(NotificationCompat.PRIORITY_HIGH)
        builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
    }

    /** Yanıt tamamlandı bildirimi — uygulamanın kalbi. */
    fun notifyCompletion(context: Context, record: JobRecord) {
        if (!canPost(context)) return

        val preview = if (Prefs.hideContent) "" else record.preview.trim()
        val title = context.getString(R.string.notification_reply_ready)
        val body = when {
            preview.isNotBlank() -> preview
            record.prompt.isNotBlank() && !Prefs.hideContent -> "\"${record.prompt}\" için yanıt hazır"
            else -> context.getString(R.string.notification_reply_ready_sub)
        }

        val builder = NotificationCompat.Builder(context, CH_COMPLETIONS)
            .setSmallIcon(R.drawable.ic_stat_arena)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSubText(record.sourceLabel())
            .setContentIntent(contentIntent(context, record.url, record.id.hashCode()))
            .setAutoCancel(true)
            .setVisibility(
                if (Prefs.hideContent) NotificationCompat.VISIBILITY_SECRET
                else NotificationCompat.VISIBILITY_PRIVATE,
            )
            .setPublicVersion(
                NotificationCompat.Builder(context, CH_COMPLETIONS)
                    .setSmallIcon(R.drawable.ic_stat_arena)
                    .setContentTitle(title)
                    .setContentText(context.getString(R.string.notification_reply_ready_sub))
                    .setContentIntent(contentIntent(context, record.url, record.id.hashCode() + 7))
                    .build(),
            )
            .addAction(replyAction(context, record))
            .addAction(copyAction(context, record))

        applyAlert(builder)
        runCatching { NotificationManagerCompat.from(context).notify(idFor(record.id), builder.build()) }
    }

    /** "Arena AI izleniyor" kalıcı bildirimi. */
    fun showProgress(context: Context, count: Int) {
        if (!Prefs.notifications || !Prefs.progressNotification) {
            cancelProgress(context)
            return
        }
        val notification = buildProgress(context, count)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) return
        runCatching { NotificationManagerCompat.from(context).notify(ID_PROGRESS, notification) }
    }

    fun buildProgress(context: Context, count: Int): android.app.Notification {
        val text = when {
            count <= 0 -> context.getString(R.string.notification_watching)
            count == 1 -> context.getString(R.string.notification_watching_one)
            else -> context.getString(R.string.notification_watching_many, count)
        }
        return NotificationCompat.Builder(context, CH_PROGRESS)
            .setSmallIcon(R.drawable.ic_stat_arena)
            .setContentTitle(context.getString(R.string.notification_watching))
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(contentIntent(context, "", 99))
            .addAction(
                NotificationCompat.Action.Builder(
                    R.drawable.ic_stat_arena,
                    context.getString(R.string.action_stop_watching),
                    stopPendingIntent(context),
                ).build(),
            )
            .build()
    }

    fun cancelProgress(context: Context) {
        runCatching { NotificationManagerCompat.from(context).cancel(ID_PROGRESS) }
    }

    fun notifyInfo(context: Context, title: String, text: String, id: Int = 1900) {
        if (!canPost(context)) return
        val builder = NotificationCompat.Builder(context, CH_COMPLETIONS)
            .setSmallIcon(R.drawable.ic_stat_arena)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
        runCatching { NotificationManagerCompat.from(context).notify(id, builder.build()) }
    }

    fun notifyNoDetection(context: Context) {
        notifyInfo(
            context,
            context.getString(R.string.notification_nothing_detected),
            context.getString(R.string.notification_nothing_detected_body),
            1901,
        )
    }

    fun cancel(context: Context, id: Int) {
        runCatching { NotificationManagerCompat.from(context).cancel(id) }
    }

    private fun stopPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, MonitorService::class.java).setAction(MonitorService.ACTION_STOP)
        return PendingIntent.getService(
            context,
            42,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun replyAction(context: Context, record: JobRecord): NotificationCompat.Action {
        val remoteInput = RemoteInput.Builder(KEY_QUICK_REPLY)
            .setLabel(context.getString(R.string.notification_reply_placeholder))
            .build()
        val intent = Intent(context, ActionReceiver::class.java)
            .setAction(ActionReceiver.ACTION_REPLY)
            .putExtra(ActionReceiver.EXTRA_URL, record.url)
        val pending = PendingIntent.getBroadcast(
            context,
            record.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        return NotificationCompat.Action.Builder(
            R.drawable.ic_stat_arena,
            context.getString(R.string.action_reply),
            pending,
        ).addRemoteInput(remoteInput).build()
    }

    private fun copyAction(context: Context, record: JobRecord): NotificationCompat.Action {
        val intent = Intent(context, ActionReceiver::class.java)
            .setAction(ActionReceiver.ACTION_COPY)
            .putExtra(ActionReceiver.EXTRA_TEXT, record.preview)
        val pending = PendingIntent.getBroadcast(
            context,
            record.id.hashCode() + 1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Action.Builder(
            R.drawable.ic_stat_arena,
            context.getString(R.string.action_copy),
            pending,
        ).build()
    }

    fun copyToClipboard(context: Context, text: String) {
        val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        manager?.setPrimaryClip(ClipData.newPlainText("arena-answer", text))
        Toast.makeText(context, context.getString(R.string.notification_copied), Toast.LENGTH_SHORT).show()
    }
}

private fun JobRecord.sourceLabel(): String = when (source) {
    "stream" -> "akış izleyici"
    "xhr" -> "istek izleyici"
    "sse" -> "SSE izleyici"
    "dom" -> "arayüz izleyici"
    "manual" -> "manuel"
    else -> source
}
