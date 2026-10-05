package com.fanmade.arenaai

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.fanmade.arenaai.data.Prefs
import com.fanmade.arenaai.monitor.AppState
import com.fanmade.arenaai.monitor.MonitorController
import com.fanmade.arenaai.notifications.Notifier

class ArenaApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        Prefs.init(this)
        Notifier.ensureChannels(this)
        MonitorController.attach(this)

        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                AppState.isForeground = true
            }

            override fun onStop(owner: LifecycleOwner) {
                AppState.isForeground = false
            }
        })
    }
}
