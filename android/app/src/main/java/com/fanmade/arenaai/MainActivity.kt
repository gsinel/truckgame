package com.fanmade.arenaai

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.fanmade.arenaai.ui.ArenaApp
import com.fanmade.arenaai.ui.UiEvents
import com.fanmade.arenaai.ui.theme.ArenaTheme

class MainActivity : ComponentActivity() {

    companion object {
        const val ACTION_SHOW_HISTORY = "com.fanmade.arenaai.SHOW_HISTORY"
    }

    private val requestPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* sonuç önemsiz */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        var startUrl = ""
        var openHistory = false
        handleIntent(intent)?.let { (url, history) ->
            startUrl = url
            openHistory = history
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        setContent {
            ArenaTheme {
                ArenaApp(initialUrl = startUrl, openHistory = openHistory)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val (url, history) = handleIntent(intent) ?: return
        if (url.isNotBlank()) UiEvents.urls.tryEmit(url)
        if (history) UiEvents.openHistory.tryEmit(Unit)
    }

    private fun handleIntent(intent: Intent?): Pair<String, Boolean>? {
        if (intent == null) return null
        val history = intent.action == ACTION_SHOW_HISTORY
        val data = intent.dataString.orEmpty()
        val url = if (data.startsWith("https://arena.ai") || data.startsWith("https://www.arena.ai")) data else ""
        return url to history
    }
}
