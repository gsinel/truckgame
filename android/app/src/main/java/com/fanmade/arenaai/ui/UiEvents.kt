package com.fanmade.arenaai.ui

import kotlinx.coroutines.flow.MutableSharedFlow

/**
 * Activity ↔ Composable arası tek yönlü olay akışı (derin bağlantılar,
 * bildirim hızlı yanıtları, sayfa yenileme istekleri).
 */
object UiEvents {
    /** Açılması istenen URL (derin bağlantı / bildirim). */
    val urls = MutableSharedFlow<String>(replay = 1, extraBufferCapacity = 4)

    /** Bildirimden yazılan hızlı yanıt. */
    val prompts = MutableSharedFlow<String>(replay = 1, extraBufferCapacity = 4)

    /** Bir sayfa yüklemesi tamamlandığında tetiklenir. */
    val pageLoaded = MutableSharedFlow<String>(replay = 1, extraBufferCapacity = 4)

    /** Ayar değişikliği sonrası sayfayı yenileme isteği. */
    val reload = MutableSharedFlow<Unit>(replay = 0, extraBufferCapacity = 2)

    /** Bildirimler ekranına geçiş isteği (kısayol). */
    val openHistory = MutableSharedFlow<Unit>(replay = 1, extraBufferCapacity = 2)
}
