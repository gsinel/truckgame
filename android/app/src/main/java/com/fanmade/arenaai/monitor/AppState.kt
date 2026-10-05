package com.fanmade.arenaai.monitor

/** Uygulamanın ön planda olup olmadığını tutar (ProcessLifecycleOwner'dan beslenir). */
object AppState {
    @Volatile
    var isForeground: Boolean = false
        internal set
}
