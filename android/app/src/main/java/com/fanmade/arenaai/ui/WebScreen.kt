package com.fanmade.arenaai.ui

import android.app.Activity
import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.fanmade.arenaai.data.Prefs
import com.fanmade.arenaai.monitor.MonitorController
import com.fanmade.arenaai.notifications.ActionReceiver
import com.fanmade.arenaai.notifications.Notifier
import com.fanmade.arenaai.web.ArenaWeb
import com.fanmade.arenaai.web.MonitorJs
import com.fanmade.arenaai.web.WebViewModel
import kotlinx.coroutines.delay

@Composable
fun WebScreen(
    startUrl: String,
    activeCount: Int,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val vm: WebViewModel = viewModel()
    val activeJobs by MonitorController.active.collectAsStateWithLifecycle()

    val fileLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val callback = vm.filePathCallback ?: return@rememberLauncherForActivityResult
        val uris = runCatching {
            android.webkit.WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        }.getOrNull()
        callback.onReceiveValue(uris)
        vm.clearFileCallback()
    }

    val webView = remember {
        vm.attach(context) { params, callback ->
            runCatching { fileLauncher.launch(params.createIntent()) }
                .onFailure { callback.onReceiveValue(null) }
        }
    }

    var canGoBack by remember { mutableStateOf(false) }
    var canGoForward by remember { mutableStateOf(false) }

    // İlk açılış
    LaunchedEffect(startUrl) {
        val target = startUrl.ifBlank { Prefs.startUrl }
        if (webView.url == null) webView.loadUrl(target)
    }

    // Derin bağlantı / bildirim → URL aç
    LaunchedEffect(Unit) {
        UiEvents.urls.collect { url ->
            if (url.isNotBlank()) webView.loadUrl(url)
        }
    }

    // Bildirimden yazılan hızlı yanıt
    LaunchedEffect(Unit) {
        UiEvents.prompts.collect { text ->
            clearPending(context, text)
            delay(400)
            ArenaWeb.sendPrompt(webView, text)
        }
    }

    // Sayfa yüklendikten sonra kuyruktaki hızlı yanıtı gönder
    LaunchedEffect(Unit) {
        UiEvents.pageLoaded.collect {
            val queued = Prefs.pendingPrompt
            if (queued.isNotBlank()) {
                clearPending(context, queued)
                delay(1200)
                ArenaWeb.sendPrompt(webView, queued)
            }
        }
    }

    // Ayar değişikliği → izleyiciyi yeni ayarlarla yeniden kur
    LaunchedEffect(Unit) {
        UiEvents.reload.collect {
            webView.evaluateJavascript(MonitorJs.script(context), null)
            webView.reload()
        }
    }

    BackHandler {
        if (webView.canGoBack()) webView.goBack() else activity?.finish()
    }

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainer),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { if (webView.canGoBack()) webView.goBack() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Geri")
            }
            IconButton(onClick = { if (webView.canGoForward()) webView.goForward() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "İleri")
            }
            IconButton(onClick = { webView.reload() }) {
                Icon(Icons.Default.Refresh, contentDescription = "Yenile")
            }
            IconButton(onClick = { webView.loadUrl(Prefs.startUrl) }) {
                Icon(Icons.Default.Home, contentDescription = "Ana sayfa")
            }

            Text(
                text = shortHost(webView.url ?: vm.currentUrl),
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.MiddleEllipsis,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            val manual = activeJobs.any { it.source == "manual" }
            val watching = activeJobs.isNotEmpty()
            IconButton(onClick = {
                MonitorController.toggleManual { vm.webView() }
            }) {
                Icon(
                    if (manual) Icons.Default.Stop else Icons.Default.NotificationsActive,
                    contentDescription = "Bitince bildir",
                    tint = if (watching) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (watching) {
                Box(
                    modifier = Modifier
                        .padding(end = 6.dp)
                        .size(22.dp)
                        .background(MaterialTheme.colorScheme.primary, MaterialTheme.shapes.extraSmall),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "$activeCount",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }
            } else {
                Spacer(Modifier.size(6.dp))
            }
        }

        Box(Modifier.fillMaxSize()) {
            AndroidView(
                factory = { webView },
                modifier = Modifier.fillMaxSize(),
            )
            if (vm.progress in 1..99) {
                LinearProgressIndicator(
                    progress = { vm.progress / 100f },
                    modifier = Modifier.fillMaxWidth().align(Alignment.TopCenter),
                )
            }
        }
    }
}

private fun clearPending(context: Context, text: String) {
    if (Prefs.pendingPrompt == text) Prefs.pendingPrompt = ""
    Notifier.cancel(context, ActionReceiver.PENDING_ID)
}

private fun shortHost(url: String?): String {
    if (url.isNullOrBlank()) return ""
    return runCatching {
        val uri = android.net.Uri.parse(url)
        val path = uri.path.orEmpty()
        (uri.host ?: url).removePrefix("www.") + if (path.length > 24) path.take(24) + "…" else path
    }.getOrDefault(url)
}
