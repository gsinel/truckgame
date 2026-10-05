package com.fanmade.arenaai

import android.app.Application
import com.fanmade.arenaai.data.Prefs
import com.fanmade.arenaai.monitor.MonitorController
import com.fanmade.arenaai.notifications.Notifier

class ArenaApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        Prefs.init(this)
        Notifier.ensureChannels(this)
        MonitorController.attach(this)
    }
}
