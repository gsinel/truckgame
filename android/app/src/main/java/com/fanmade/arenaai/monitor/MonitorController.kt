package com.fanmade.arenaai.monitor

import android.app.Application
import com.fanmade.arenaai.data.Prefs
import com.fanmade.arenaai.notifications.Notifier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * JS izleyicisinden gelen olayları toplayan, bildirim ve arka plan servisini
 * yöneten merkez. Tüm çağrılar main thread'de yapılır (JsBridge öyle garanti eder).
 */
object MonitorController {

    /** Manuel izleme için "hiçbir şey yakalanamadı" uyarı süresi. */
    private const val MANUAL_TIMEOUT_MS = 120_000L
    /** Aynı yanıt için çift bildirimi engelleme penceresi (akış + DOM). */
    private const val DEDUPE_WINDOW_MS = 8_000L

    private lateinit var app: Application
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val jobs = LinkedHashMap<String, JobRecord>()
    private val _active = MutableStateFlow<List<JobRecord>>(emptyList())
    val active: StateFlow<List<JobRecord>> = _active.asStateFlow()

    private var stopJob: Job? = null
    private var lastDoneAt = 0L

    fun attach(application: Application) {
        app = application
        JobStore.init(application)
    }

    fun onStart(record: JobRecord) {
        if (jobs.containsKey(record.id)) return
        jobs[record.id] = record
        publish()
        MonitorService.start(app)
        Notifier.showProgress(app, jobs.size)

        if (record.source == "manual") {
            scope.launch {
                delay(MANUAL_TIMEOUT_MS)
                if (jobs.containsKey(record.id)) {
                    jobs.remove(record.id)
                    publish()
                    Notifier.notifyNoDetection(app)
                    scheduleStop()
                }
            }
        }
    }

    fun onProgress(id: String, chunks: Int) {
        val job = jobs[id] ?: return
        jobs[id] = job.copy(chunks = chunks)
        publish()
    }

    fun onDone(record: JobRecord) {
        jobs.remove(record.id)
        publish()

        // Akış izleyici zaten bildirdiyse, DOM izleyicinin aynı yanıt için
        // ikinci bir bildirim üretmesini engelle.
        if (record.source == "dom" && System.currentTimeMillis() - lastDoneAt < DEDUPE_WINDOW_MS) {
            scheduleStop()
            return
        }
        lastDoneAt = System.currentTimeMillis()

        JobStore.add(record)
        Notifier.notifyCompletion(app, record)
        Notifier.showProgress(app, jobs.size)
        scheduleStop()
    }

    fun onFail(id: String, reason: String = "") {
        if (id.isBlank()) return
        jobs.remove(id)
        publish()
        Notifier.showProgress(app, jobs.size)
        scheduleStop()
    }

    /** Kullanıcı "şimdi izle" düğmesine bastığında veya ikinci kez basıp iptal ettiğinde. */
    fun toggleManual(webViewProvider: () -> android.webkit.WebView?) {
        if (jobs.values.any { it.source == "manual" }) {
            stopAll()
            return
        }
        val view = webViewProvider()
        val stamp = System.currentTimeMillis()
        view?.evaluateJavascript("window.__arenaMonitor && window.__arenaMonitor.arm();", null)
        onStart(
            JobRecord(
                id = "manual-$stamp",
                source = "manual",
                url = view?.url ?: "",
                prompt = "",
                preview = "",
                status = "running",
                startedAt = stamp,
            )
        )
    }

    fun stopAll() {
        jobs.clear()
        publish()
        stopJob?.cancel()
        stopJob = null
        Notifier.cancelProgress(app)
        MonitorService.stop(app)
    }

    fun refresh() {
        publish()
        Notifier.showProgress(app, jobs.size)
    }

    private fun publish() {
        _active.value = jobs.values.sortedByDescending { it.startedAt }
    }

    private fun scheduleStop() {
        stopJob?.cancel()
        stopJob = scope.launch {
            delay(kotlin.math.max(5, Prefs.autoStopSeconds) * 1000L)
            if (jobs.isEmpty()) {
                Notifier.cancelProgress(app)
                MonitorService.stop(app)
            } else {
                Notifier.showProgress(app, jobs.size)
            }
        }
    }
}
