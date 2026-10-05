package com.fanmade.arenaai.monitor

import android.content.Context
import com.fanmade.arenaai.data.Prefs
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

/** Tamamlanan işlerin geçmişi (bildirim geçmişi ekranı). */
object JobStore {

    private const val MAX_RECORDS = 100

    private val _history = MutableStateFlow<List<JobRecord>>(emptyList())
    val history: StateFlow<List<JobRecord>> = _history.asStateFlow()

    fun init(context: Context) {
        Prefs.init(context)
        _history.value = load()
    }

    fun add(record: JobRecord) {
        _history.value = (listOf(record) + _history.value).take(MAX_RECORDS)
        save()
    }

    fun clear() {
        _history.value = emptyList()
        save()
    }

    private fun load(): List<JobRecord> {
        val raw = Prefs.history
        val array = runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
        val out = ArrayList<JobRecord>(array.length())
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            out.add(JobRecord.fromJson(obj))
        }
        return out.sortedByDescending { it.finishedAt }
    }

    private fun save() {
        val array = JSONArray()
        _history.value.forEach { array.put(it.toJson()) }
        Prefs.history = array.toString()
    }
}
