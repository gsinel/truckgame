package com.fanmade.arenaai.web

import android.Manifest
import android.app.DownloadManager
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.fanmade.arenaai.data.Prefs
import java.io.File

/** arena.ai ve kimlik doğrulama sağlayıcıları WebView içinde kalır. */
private val INTERNAL_HOST_SUFFIXES = listOf("arena.ai")
private val AUTH_HOSTS = setOf(
    "accounts.google.com", "accounts.youtube.com", "appleid.apple.com", "auth0.com",
    "github.com", "discord.com", "clerk.accounts.dev", "clerk.dev", "recaptcha.net",
    "hcaptcha.com", "challenges.cloudflare.com", "gstatic.com", "googleusercontent.com",
)

fun isInternalHost(host: String?): Boolean {
    if (host.isNullOrBlank()) return false
    val h = host.lowercase()
    if (INTERNAL_HOST_SUFFIXES.any { h == it || h.endsWith(".$it") }) return true
    return AUTH_HOSTS.any { h == it || h.endsWith(".$it") }
}

object ArenaWeb {

    /** Mobil Chrome kullanıcı ajanı ("; wv)" işareti çıkarılmış hâli). */
    private fun userAgent(context: Context): String =
        WebSettings.getDefaultUserAgent(context).replace("; wv)", ")")

    fun build(
        context: Context,
        client: ArenaViewClient,
        chrome: ArenaChromeClient,
        configJson: String,
    ): WebView {
        val webView = WebView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.mediaPlaybackRequiresUserGesture = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.userAgentString = userAgent(context)
        settings.allowContentAccess = true
        settings.allowFileAccess = true

        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = client
        webView.webChromeClient = chrome
        webView.addJavascriptInterface(JsBridge(), "ArenaBridge")
        webView.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            handleDownload(context, url, contentDisposition, mimeType, settings.userAgentString)
        }

        applyDarkMode(webView)

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            runCatching {
                WebViewCompat.addDocumentStartJavaScript(
                    webView,
                    configJson,
                    setOf("https://arena.ai/*", "https://*.arena.ai/*"),
                )
            }.onFailure { Log.w("ArenaWeb", "document-start script eklenemedi", it) }
        }

        return webView
    }

    fun applyDarkMode(webView: WebView) {
        if (!Prefs.darkWeb) return
        if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            @Suppress("DEPRECATION")
            WebSettingsCompat.setForceDark(webView.settings, WebSettingsCompat.FORCE_DARK_ON)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            webView.settings.isAlgorithmicDarkeningAllowed = true
        }
    }

    /**
     * Sayfa yüklenirken / yüklendikten sonra izleyiciyi tekrar enjekte eder.
     * Yalnızca arena.ai üzerinde çalışır (giriş sayfalarına dokunmayız).
     */
    fun inject(webView: WebView, url: String?, script: String) {
        val host = runCatching { Uri.parse(url).host }.getOrNull()?.lowercase() ?: return
        if (host != "arena.ai" && !host.endsWith(".arena.ai")) return
        webView.evaluateJavascript(script, null)
    }

    /** Hızlı yanıt: metni besteciye yazıp gönder düğmesine basar. */
    fun sendPrompt(webView: WebView, text: String, onResult: (String?) -> Unit = {}) {
        val json = org.json.JSONObject().put("text", text).toString()
        val js = "(function(){" +
            "if(!window.ArenaComposer){return 'no_bridge';}" +
            "return window.ArenaComposer.send($json);" +
            "})()"
        webView.evaluateJavascript(js, onResult)
    }

    private fun handleDownload(
        context: Context,
        url: String?,
        contentDisposition: String?,
        mimeType: String?,
        userAgent: String?,
    ) {
        val target = url ?: return
        if (target.startsWith("blob:") || target.startsWith("data:")) {
            Toast.makeText(context, "Bu dosya türü indirilemiyor", Toast.LENGTH_SHORT).show()
            return
        }
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Toast.makeText(context, "İndirmek için depolama izni gerekli", Toast.LENGTH_SHORT).show()
            return
        }
        val fileName = URLUtil.guessFileName(target, contentDisposition, mimeType)
        val request = DownloadManager.Request(Uri.parse(target))
            .setMimeType(mimeType)
            .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(target) ?: "")
            .addRequestHeader("User-Agent", userAgent ?: "")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
        runCatching {
            val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.enqueue(request)
            Toast.makeText(context, "İndiriliyor: $fileName", Toast.LENGTH_SHORT).show()
        }.onFailure {
            Toast.makeText(context, "İndirme başlatılamadı", Toast.LENGTH_SHORT).show()
        }
    }
}

class ArenaViewClient(
    private val scriptProvider: () -> String,
    private val onUrlChanged: (String) -> Unit,
    private val onPageLoaded: (String) -> Unit,
) : WebViewClient() {

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val uri = request.url
        val host = uri.host
        if (isInternalHost(host)) return false
        if (uri.scheme != "https" && uri.scheme != "http") {
            // mailto:, tel:, intent: gibi şemalar sistemde açılsın
            runCatching { view.context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            return true
        }
        if (Prefs.externalInApp && uri.scheme == "https") return false
        runCatching { view.context.startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)) }
        return true
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
        onUrlChanged(url)
        ArenaWeb.inject(view, url, scriptProvider())
    }

    override fun onPageFinished(view: WebView, url: String) {
        onUrlChanged(url)
        ArenaWeb.inject(view, url, scriptProvider())
        onPageLoaded(url)
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
        onUrlChanged(url)
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail?): Boolean {
        // WebView çöktüyse sayfayı sessizce yeniden yükle.
        runCatching { view.loadUrl(view.url ?: Prefs.startUrl) }
        return true
    }
}

class ArenaChromeClient(
    private val onProgress: (Int) -> Unit,
    private val onFilePick: (FileChooserParams, ValueCallback<Array<Uri>>) -> Unit,
) : WebChromeClient() {

    override fun onProgressChanged(view: WebView, newProgress: Int) {
        onProgress(newProgress)
    }

    override fun onShowFileChooser(
        webView: WebView,
        filePathCallback: ValueCallback<Array<Uri>>,
        fileChooserParams: FileChooserParams,
    ): Boolean {
        onFilePick(fileChooserParams, filePathCallback)
        return true
    }

    override fun onPermissionRequest(request: PermissionRequest?) {
        // Yalnızca arena.ai kaynaklı kamera/mikrofon isteklerine izin ver.
        val origin = request?.origin?.let { Uri.parse(it.toString()).host }
        if (request != null && isInternalHost(origin)) {
            request.grant(request.resources)
        } else {
            request?.deny()
        }
    }

    override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
        val host = origin?.let { Uri.parse(it).host }
        callback.invoke(origin, isInternalHost(host), false)
    }
}

/** Seçilen dosyaların kopyalanacağı geçici klasör (isteğe bağlı). */
fun cacheDir(context: Context): File = File(context.cacheDir, "uploads").apply { mkdirs() }

fun clipText(context: Context, text: String) {
    val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
    manager?.setPrimaryClip(ClipData.newPlainText("arena", text))
}
