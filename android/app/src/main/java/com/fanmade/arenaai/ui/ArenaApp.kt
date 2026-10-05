package com.fanmade.arenaai.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fanmade.arenaai.monitor.MonitorController

private const val TAB_WEB = 0
private const val TAB_HISTORY = 1
private const val TAB_SETTINGS = 2

@Composable
fun ArenaApp(initialUrl: String, openHistory: Boolean) {
    var tab by remember { mutableIntStateOf(if (openHistory) TAB_HISTORY else TAB_WEB) }

    LaunchedEffect(Unit) {
        UiEvents.openHistory.collect { tab = TAB_HISTORY }
    }

    val activeJobs by MonitorController.active.collectAsStateWithLifecycle()

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == TAB_WEB,
                    onClick = { tab = TAB_WEB },
                    icon = { Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = "Sohbet") },
                    label = { Text("Sohbet", fontSize = 11.sp) },
                )
                NavigationBarItem(
                    selected = tab == TAB_HISTORY,
                    onClick = { tab = TAB_HISTORY },
                    icon = {
                        Icon(Icons.Default.Notifications, contentDescription = "Bildirimler")
                    },
                    label = { Text("Bildirimler", fontSize = 11.sp) },
                )
                NavigationBarItem(
                    selected = tab == TAB_SETTINGS,
                    onClick = { tab = TAB_SETTINGS },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Ayarlar") },
                    label = { Text("Ayarlar", fontSize = 11.sp) },
                )
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        when (tab) {
            TAB_WEB -> WebScreen(
                startUrl = initialUrl,
                activeCount = activeJobs.size,
                modifier = Modifier.fillMaxSize().padding(padding),
            )
            TAB_HISTORY -> HistoryScreen(
                onOpenChat = { url ->
                    if (url.isNotBlank()) UiEvents.urls.tryEmit(url)
                    tab = TAB_WEB
                },
                modifier = Modifier.fillMaxSize().padding(padding),
            )
            else -> SettingsScreen(
                onOpenWeb = { tab = TAB_WEB },
                modifier = Modifier.fillMaxSize().padding(padding),
            )
        }
    }
}
