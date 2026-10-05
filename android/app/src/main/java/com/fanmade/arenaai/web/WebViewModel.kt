package com.fanmade.arenaai.web

import android.content.Context
import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import com.fanmade.arenaai.ui.UiEvents

/**
 * WebView'ı ekran döndürme / sekme değişimi boyunca canlı tutar.
 */
class WebViewModel : ViewModel() {

    private var instance: WebView? = null

    var filePathCallback: ValueCallback<Array<Uri>>? = null
        private set

    var progress by mutableIntStateOf(0)
        private set

    var currentUrl by mutableStateOf("")
        private set

    fun attach(
        context: Context,
        filePicker: (WebChromeClient.FileChooserParams, ValueCallback<Array<Uri>>) -> Unit,
    ): WebView {
        instance?.let { return it }

        val chrome = ArenaChromeClient(
            onProgress = { progress = it },
            onFilePick = { params, callback ->
                filePathCallback = callback
                filePicker(params, callback)
            },
        )
        val client = ArenaViewClient(
            scriptProvider = { MonitorJs.script(context) },
            onUrlChanged = { currentUrl = it },
            onPageLoaded = { UiEvents.pageLoaded.tryEmit(it) },
        )
        val webView = ArenaWeb.build(context, client, chrome, MonitorJs.script(context))
        instance = webView
        return webView
    }

    fun webView(): WebView? = instance

    fun load(url: String) {
        val view = instance ?: return
        if (view.url == url) view.reload() else view.loadUrl(url)
    }

    fun reload() {
        instance?.reload()
    }

    fun clearFileCallback() {
        filePathCallback = null
    }

    override fun onCleared() {
        instance?.let {
            it.stopLoading()
            it.destroy()
        }
        instance = null
        super.onCleared()
    }
}
