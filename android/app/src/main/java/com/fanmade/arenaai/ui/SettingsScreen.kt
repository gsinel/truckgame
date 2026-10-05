package com.fanmade.arenaai.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatterySaver
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.getSystemService
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fanmade.arenaai.BuildConfig
import com.fanmade.arenaai.data.Prefs
import com.fanmade.arenaai.monitor.MonitorController

@Composable
fun SettingsScreen(
    onOpenWeb: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scroll = rememberScrollState()
    var refresh by remember { mutableIntStateOf(0) } // Prefs yeniden okunsun
    val activeJobs by MonitorController.active.collectAsStateWithLifecycle()

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { refresh++ }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Section("Bildirimler") {
            Toggle("Bildirimler", "Yanıt tamamlanınca haber ver", Prefs.notifications, refresh) {
                Prefs.notifications = it
                if (it && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED
                ) {
                    permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
            Toggle(
                "Uygulama açıkken de bildir",
                "Kapalıyken: zaten bakarken ses/titreşim çalmaz, geçmişe yine kaydedilir",
                Prefs.notifyInForeground,
                refresh,
            ) { Prefs.notifyInForeground = it }
            Toggle("Ses", null, Prefs.sound, refresh) { Prefs.sound = it }
            Toggle("Titreşim", null, Prefs.vibrate, refresh) { Prefs.vibrate = it }
            Toggle(
                "Kilit ekranında içeriği gizle",
                "Bildirimde yalnızca \"Yanıtın hazır\" görünür",
                Prefs.hideContent,
                refresh,
            ) { Prefs.hideContent = it }
            Toggle(
                "İzleme bildirimi",
                "Yanıt beklenirken kalıcı bildirim göster",
                Prefs.progressNotification,
                refresh,
            ) {
                Prefs.progressNotification = it
                MonitorController.refresh()
            }
            Action("Sistem bildirim ayarlarını aç", Icons.Default.Notifications) {
                openNotificationSettings(context)
            }
        }

        Section("İzleme") {
            Toggle(
                "Akış izleyici (fetch / SSE)",
                "Arayüzden bağımsız, birincil yöntem",
                Prefs.streamWatch,
                refresh,
            ) {
                Prefs.streamWatch = it
                UiEvents.reload.tryEmit(Unit)
            }
            Toggle(
                "Arayüz (DOM) izleyici",
                "\"Durdur\" düğmesini yoklar — yedek yöntem",
                Prefs.domWatch,
                refresh,
            ) {
                Prefs.domWatch = it
                UiEvents.reload.tryEmit(Unit)
            }
            Toggle(
                "Arka planda izlemeyi sürdür",
                "Ekran kapalıyken de akışı canlı tutar (pil harcar)",
                Prefs.backgroundWatch,
                refresh,
            ) {
                Prefs.backgroundWatch = it
                if (!it) MonitorController.stopAll()
            }
            AutoStopRow(refresh = refresh)
            Action("Pil optimizasyonunu kapat", Icons.Default.BatterySaver) {
                disableBatteryOptimization(context)
            }
            if (activeJobs.isNotEmpty()) {
                Action("İzlemeyi şimdi durdur (${activeJobs.size})", Icons.Default.StopCircle) {
                    MonitorController.stopAll()
                }
            }
        }

        Section("Görünüm") {
            Toggle("Karanlık tema", null, Prefs.darkApp, refresh) { Prefs.darkApp = it }
            Toggle(
                "Web'i karanlık göster",
                "Sayfayı otomatik karartır (deneme)",
                Prefs.darkWeb,
                refresh,
            ) {
                Prefs.darkWeb = it
                UiEvents.reload.tryEmit(Unit)
            }
        }

        Section("Gezinti") {
            var url by remember(refresh) { mutableStateOf(Prefs.startUrl) }
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("Açılış sayfası") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            TextButton(
                onClick = {
                    val clean = url.trim().ifBlank { "https://arena.ai/chat" }
                    Prefs.startUrl = if (clean.startsWith("http")) clean else "https://$clean"
                    url = Prefs.startUrl
                    refresh++
                    Toast.makeText(context, "Kaydedildi", Toast.LENGTH_SHORT).show()
                },
            ) { Text("Açılış sayfasını kaydet") }

            Toggle(
                "Harici bağlantıları uygulamada aç",
                "Kapalıyken dış bağlantılar tarayıcıya gider",
                Prefs.externalInApp,
                refresh,
            ) { Prefs.externalInApp = it }
        }

        Section("Bakım") {
            Toggle(
                "İzleyici hata ayıklama",
                "Logcat'te 'ArenaMonitor' etiketi",
                Prefs.debugJs,
                refresh,
            ) {
                Prefs.debugJs = it
                UiEvents.reload.tryEmit(Unit)
            }
            Action("Sayfayı yenile", Icons.Default.Refresh) {
                UiEvents.reload.tryEmit(Unit)
                onOpenWeb()
            }
            Action("WebView verilerini temizle", Icons.Default.CleaningServices) {
                clearWebViewData(context)
                Toast.makeText(context, "Çerezler temizlendi (çıkış yapmış olabilirsin)", Toast.LENGTH_LONG).show()
                onOpenWeb()
            }
            Action("Bildirim geçmişini temizle", Icons.Default.CleaningServices) {
                com.fanmade.arenaai.monitor.JobStore.clear()
            }
        }

        Section("Hakkında") {
            Text(
                text = "Arena AI — fan-made sürüm ${BuildConfig.VERSION_NAME}\n" +
                    "Resmî uygulama değildir. arena.ai sitesini kendi oturumunla WebView içinde açar; " +
                    "gizli bir API kullanmaz, verilerini sunucuya göndermez.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            content()
        }
    }
}

@Composable
private fun Toggle(
    title: String,
    subtitle: String?,
    initial: Boolean,
    refresh: Int,
    onChange: (Boolean) -> Unit,
) {
    var checked by remember(refresh) { mutableStateOf(initial) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp)
            if (!subtitle.isNullOrBlank()) {
                Text(subtitle, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Switch(checked = checked, onCheckedChange = {
            checked = it
            onChange(it)
        })
    }
}

@Composable
private fun Action(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    TextButton(
        onClick = onClick,
        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.primary),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
        Text(title, fontSize = 13.sp)
    }
}

@Composable
private fun AutoStopRow(refresh: Int) {
    var seconds by remember(refresh) { mutableIntStateOf(Prefs.autoStopSeconds) }
    Column {
        Text("Son yanıttan sonra izlemeyi bırak", fontSize = 14.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(15, 45, 120).forEach { value ->
                TextButton(onClick = {
                    seconds = value
                    Prefs.autoStopSeconds = value
                }) {
                    Text(
                        "$value sn",
                        fontSize = 12.sp,
                        fontWeight = if (value == seconds) FontWeight.Bold else FontWeight.Normal,
                        color = if (value == seconds) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

private fun openNotificationSettings(context: Context) {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.fromParts("package", context.packageName, null))
    }
    runCatching { context.startActivity(intent) }
}

private fun disableBatteryOptimization(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val manager: PowerManager? = context.getSystemService()
    if (manager != null && manager.isIgnoringBatteryOptimizations(context.packageName)) {
        Toast.makeText(context, "Zaten kapalı", Toast.LENGTH_SHORT).show()
        return
    }
    runCatching {
        context.startActivity(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:" + context.packageName)),
        )
    }.onFailure {
        Toast.makeText(context, "Bu cihazda açılamadı", Toast.LENGTH_SHORT).show()
    }
}

private fun clearWebViewData(context: Context) {
    runCatching {
        WebView(context).clearCache(true)
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        WebStorage.getInstance().deleteAllData()
    }
    MonitorController.stopAll()
    UiEvents.reload.tryEmit(Unit)
}
