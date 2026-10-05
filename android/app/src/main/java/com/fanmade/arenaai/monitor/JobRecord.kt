package com.fanmade.arenaai.monitor

import org.json.JSONObject

/** İzlenen bir "yanıt üretimi" işi. */
data class JobRecord(
    val id: String,
    val source: String,          // stream | xhr | sse | dom | manual
    val url: String,
    val prompt: String,
    val preview: String,
    val status: String,          // running | done | failed
    val startedAt: Long,
    val finishedAt: Long = 0L,
    val chunks: Int = 0,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("source", source)
        put("url", url)
        put("prompt", prompt)
        put("preview", preview)
        put("status", status)
        put("startedAt", startedAt)
        put("finishedAt", finishedAt)
        put("chunks", chunks)
    }

    companion object {
        fun fromJson(obj: JSONObject): JobRecord = JobRecord(
            id = obj.optString("id", System.currentTimeMillis().toString()),
            source = obj.optString("source", "?"),
            url = obj.optString("url", ""),
            prompt = obj.optString("prompt", ""),
            preview = obj.optString("preview", ""),
            status = obj.optString("status", "done"),
            startedAt = obj.optLong("startedAt", System.currentTimeMillis()),
            finishedAt = obj.optLong("finishedAt", 0L),
            chunks = obj.optInt("chunks", 0),
        )

        /** JS'ten gelen "iş başladı" yükü. */
        fun start(json: String?): JobRecord {
            val obj = runCatching { JSONObject(json ?: "{}") }.getOrElse { JSONObject() }
            return JobRecord(
                id = obj.optString("id", "job-${System.currentTimeMillis()}"),
                source = obj.optString("source", "stream"),
                url = obj.optString("url", ""),
                prompt = obj.optString("prompt", ""),
                preview = "",
                status = "running",
                startedAt = System.currentTimeMillis(),
            )
        }

        /** JS'ten gelen "iş bitti" yükü. */
        fun done(json: String?): JobRecord {
            val obj = runCatching { JSONObject(json ?: "{}") }.getOrElse { JSONObject() }
            return JobRecord(
                id = obj.optString("id", "job-${System.currentTimeMillis()}"),
                source = obj.optString("source", "stream"),
                url = obj.optString("url", ""),
                prompt = obj.optString("prompt", ""),
                preview = obj.optString("preview", ""),
                status = "done",
                startedAt = System.currentTimeMillis() - obj.optLong("durationMs", 0L),
                finishedAt = System.currentTimeMillis(),
                chunks = obj.optInt("chunks", 0),
            )
        }

        fun idOf(json: String?): String {
            val obj = runCatching { JSONObject(json ?: "{}") }.getOrElse { JSONObject() }
            return obj.optString("id", "")
        }
    }
}
