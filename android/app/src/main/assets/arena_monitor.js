/*
 * Arena AI (fan-made) — yanıt tamamlanma izleyicisi
 * -------------------------------------------------
 * Sayfa yüklenmeden önce (document-start) enjekte edilir. Üç katmanlı çalışır:
 *   1) fetch / XMLHttpRequest akışlarını yakalar (asıl yöntem — arayüzden bağımsız)
 *   2) EventSource (SSE) akışlarını izler
 *   3) DOM'da "durdur" düğmesini yoklar (yedek yöntem)
 * Tamamlanma anında window.ArenaBridge üzerinden native tarafa JSON gönderir.
 *
 * __CONFIG__ yer tutucusu Kotlin tarafında gerçek JSON ile değiştirilir.
 */
(function () {
    "use strict";

    var CONFIG = __CONFIG__;
    if (window.__arenaMonitor) {
        // Zaten kurulu: sadece ayarları tazele.
        window.__arenaMonitor.configure(CONFIG);
        return;
    }

    var ASSET_RE = /\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf|zip)(\?|#|$)/i;
    var API_PATH_RE = /\/api\/|\/nextjs-api\/|\/trpc\/|\/v\d\//i;
    var TOPIC_RE = /(chat|complet|stream|generat|agent|message|conversation|thread|answer|respond|response)/i;
    var TEXT_KEYS = ["text", "content", "delta", "output", "answer", "response", "result", "value", "message", "chunk"];

    var seq = 0;
    var jobs = Object.create(null);

    var domActive = false;
    var domStartedAt = 0;
    var domNotifyAt = 0;
    var domArmed = false;
    var domPoll = null;

    function now() { return Date.now(); }

    /* ---------------------------------------------------------------- yardımcılar */

    function post(name, payload) {
        try {
            var bridge = window.ArenaBridge;
            if (bridge && typeof bridge[name] === "function") {
                bridge[name](JSON.stringify(payload));
            }
        } catch (e) { /* native hazır değil — yoksay */ }
    }

    function log(message) {
        if (CONFIG.debug) { post("log", { message: String(message) }); }
    }

    function clip(value, max) {
        var s = String(value == null ? "" : value);
        s = s.replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
        return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, "") + "…" : s;
    }

    function isCandidate(url) {
        if (!url) { return false; }
        var u = String(url);
        if (u.indexOf("data:") === 0 || u.indexOf("blob:") === 0) { return false; }
        if (ASSET_RE.test(u)) { return false; }
        return API_PATH_RE.test(u) || TOPIC_RE.test(u);
    }

    // Sadece "/api/..." yoluyla eşleşen (konu sözcüğü geçmeyen) isteklerde
    // gövdede gerçekten bir prompt benzeri alan var mı diye bakılır.
    function looksLikePromptCall(url, body) {
        if (TOPIC_RE.test(String(url))) { return true; }
        return extractPrompt(body).length > 0;
    }

    function newId(prefix) {
        seq += 1;
        return prefix + "-" + now() + "-" + seq;
    }

    function jobShell(id, source, url, prompt) {
        return {
            id: id,
            source: source,
            url: url || (window.location ? window.location.href : ""),
            prompt: clip(prompt, 200),
            pageTitle: (document && document.title) ? clip(document.title, 80) : "",
            startedAt: now()
        };
    }

    /* --------------------------------------------------- akış metninden yanıt çıkarma */

    function looksLikeProse(value) {
        var v = String(value);
        if (!v || v.length < 1) { return false; }
        if (/^https?:\/\/\S+$/i.test(v)) { return false; }
        if (/^[A-Za-z0-9+/=]{120,}$/.test(v)) { return false; } // muhtemelen base64
        return true;
    }

    // Genel taramada çöp (enum/rol adları) toplamamak için daha katı filtre.
    function isProseLoose(value) {
        var v = String(value);
        if (!looksLikeProse(v)) { return false; }
        return v.length >= 12 || /\s/.test(v) || /[.,!?;:"')]$/.test(v);
    }

    function findText(node, depth) {
        if (depth > 6 || node == null) { return ""; }
        if (typeof node === "string") { return looksLikeProse(node) ? node : ""; }
        if (typeof node !== "object") { return ""; }
        if (node instanceof Array) {
            var joined = "";
            for (var i = 0; i < node.length; i++) { joined += findText(node[i], depth + 1); }
            return joined;
        }

        // OpenAI biçimi: { choices: [ { delta|message|text } ] }
        if (node.choices && node.choices.length) {
            var openai = "";
            for (var c = 0; c < node.choices.length; c++) {
                var choice = node.choices[c] || {};
                openai += findText(choice.delta || choice.message || choice, depth + 1);
            }
            if (openai) { return openai; }
        }

        // Gemini biçimi: { candidates: [ { content: { parts: [ { text } ] } } ] }
        if (node.candidates && node.candidates.length) {
            var gemini = "";
            for (var g = 0; g < node.candidates.length; g++) {
                gemini += findText((node.candidates[g] || {}).content, depth + 1);
            }
            if (gemini) { return gemini; }
        }

        // Yaygın metin alanları
        var out = "";
        for (var k = 0; k < TEXT_KEYS.length; k++) {
            var key = TEXT_KEYS[k];
            if (Object.prototype.hasOwnProperty.call(node, key)) {
                var value = node[key];
                if (typeof value === "string") {
                    if (looksLikeProse(value)) { out += value; }
                } else {
                    out += findText(value, depth + 1);
                }
                if (out) { return out; }
            }
        }
        if (out) { return out; }

        // Bilinmeyen biçim: tüm alanları tara (katı filtreyle)
        var keys = Object.keys(node);
        var generic = "";
        for (var j = 0; j < keys.length && j < 15; j++) {
            var raw = node[keys[j]];
            if (typeof raw === "string") {
                if (isProseLoose(raw)) { generic += raw; }
            } else {
                generic += findText(raw, depth + 1);
            }
        }
        return generic;
    }

    // SSE / NDJSON akış gövdesinden okunabilir metni toplar.
    function collectText(raw) {
        var lines = String(raw).split(/\r?\n/);
        var out = "";
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) { continue; }
            if (line.indexOf("data:") === 0) { line = line.slice(5).trim(); }
            if (!line || line === "[DONE]") { continue; }
            if (line.charAt(0) !== "{" && line.charAt(0) !== "[") {
                if (looksLikeProse(line) && line.length < 4000) { out += line + "\n"; }
                continue;
            }
            var parsed = null;
            try { parsed = JSON.parse(line); } catch (e) { continue; }
            out += findText(parsed, 0);
        }
        return out;
    }

    // İstek gövdesinden kullanıcı prompt'unu çıkarmaya çalışır.
    function extractPrompt(body) {
        if (!body) { return ""; }
        if (typeof body === "string") {
            var parsed = null;
            try { parsed = JSON.parse(body); } catch (e) { return clip(body, 200); }
            return extractPrompt(parsed);
        }
        if (typeof body !== "object") { return ""; }
        if (body.messages && body.messages.length) {
            for (var i = body.messages.length - 1; i >= 0; i--) {
                var m = body.messages[i];
                if (!m) { continue; }
                var role = String(m.role || "").toLowerCase();
                if (role === "user" || role === "human") {
                    var c = m.content;
                    if (typeof c === "string") { return clip(c, 200); }
                    if (c && c.length) { return clip(c[0] && c[0].text ? c[0].text : "", 200); }
                }
            }
        }
        var keys = ["prompt", "input", "query", "question", "text", "message", "content"];
        for (var k = 0; k < keys.length; k++) {
            if (typeof body[keys[k]] === "string" && body[keys[k]].length) { return clip(body[keys[k]], 200); }
        }
        return "";
    }

    /* ------------------------------------------------------------------ iş yaşam döngüsü */

    function start(id, source, url, prompt) {
        jobs[id] = { id: id, source: source, url: url, prompt: prompt, chunks: 0, text: "", startedAt: now() };
        post("onJobStart", jobShell(id, source, url, prompt));
        log("start " + id + " " + source);
    }

    function progress(id, chunks, text) {
        var job = jobs[id];
        if (!job) { return; }
        job.chunks = chunks;
        if (text && text.length > job.text.length) { job.text = text.slice(-20000); }
        if (chunks % 20 === 0) {
            post("onJobProgress", { id: id, chunks: chunks, preview: clip(collectText(job.text), 300) });
        }
    }

    function finish(id, ok) {
        var job = jobs[id];
        if (!job) { return; }
        delete jobs[id];
        var preview = clip(collectText(job.text), 1500);
        if (!preview) { preview = clip(lastAssistantText(), 1500); }
        if (!ok) { post("onJobFail", { id: id, reason: "stream_error" }); return; }
        if (job.chunks < CONFIG.minStreamChunks && job.source !== "dom") {
            log("skip " + id + " chunks=" + job.chunks);
            post("onJobFail", { id: id, reason: "not_streamed" });
            return;
        }
        post("onJobDone", {
            id: id,
            source: job.source,
            url: job.url || (window.location ? window.location.href : ""),
            prompt: job.prompt || lastUserText(),
            preview: preview,
            chunks: job.chunks,
            durationMs: now() - job.startedAt,
            pageTitle: (document && document.title) ? clip(document.title, 80) : ""
        });
        log("done " + id);
    }

    /* ------------------------------------------------------------------ fetch kancası */

    function hookFetch() {
        var original = window.fetch;
        if (!original) { return; }
        window.fetch = function (input, init) {
            var url = "";
            var method = "GET";
            var body = null;

            try {
                if (typeof input === "string") { url = input; }
                else if (input && input.url) { url = input.url; }
                if (init && init.method) { method = String(init.method).toUpperCase(); }
                else if (input && input.method) { method = String(input.method).toUpperCase(); }
                if (init && init.body !== undefined && init.body !== null) { body = init.body; }
                else if (input && typeof input.clone === "function") { body = null; }
            } catch (e) { /* görmezden gel */ }

            var promise;
            try {
                promise = original.apply(this, arguments);
            } catch (e) {
                throw e;
            }

            if ((method === "POST" || method === "PUT" || method === "PATCH") &&
                isCandidate(url) && looksLikePromptCall(url, body)) {
                var id = newId("stream");
                start(id, "stream", url, extractPrompt(body));
                promise.then(function (response) {
                    trackStream(id, response);
                    return response;
                })["catch"](function () {
                    post("onJobFail", { id: id, reason: "request_failed" });
                    delete jobs[id];
                });
            }
            return promise;
        };
    }

    function trackStream(id, response) {
        var clone = null;
        try { clone = response && typeof response.clone === "function" ? response.clone() : null; } catch (e) { clone = null; }
        if (!clone || !clone.body || typeof clone.body.getReader !== "function") {
            // Akış yok: kararı DOM izleyicisine bırak.
            post("onJobFail", { id: id, reason: "no_stream" });
            delete jobs[id];
            return;
        }
        var reader = clone.body.getReader();
        var decoder = null;
        try { decoder = new TextDecoder("utf-8"); } catch (e) { decoder = null; }
        var chunks = 0;

        function pump() {
            return reader.read().then(function (result) {
                if (result.done) {
                    finish(id, true);
                    return;
                }
                chunks += 1;
                var job = jobs[id];
                if (job) {
                    if (decoder && result.value) {
                        try { job.text += decoder.decode(result.value, { stream: true }); } catch (e) { /* */ }
                    }
                    progress(id, chunks, job.text);
                }
                return pump();
            })["catch"](function () {
                finish(id, false);
            });
        }
        pump();
    }

    /* -------------------------------------------------------------------- XHR kancası */

    function hookXhr() {
        var OriginalXhr = window.XMLHttpRequest;
        if (!OriginalXhr) { return; }

        function WrappedXhr() {
            var xhr = new OriginalXhr();
            var method = "GET";
            var url = "";
            var id = null;
            var chunks = 0;
            var text = "";

            var open = xhr.open;
            xhr.open = function (m, u) {
                method = String(m || "GET").toUpperCase();
                url = String(u || "");
                return open.apply(xhr, arguments);
            };

            xhr.addEventListener("load", function () {
                if (!id) { return; }
                if (chunks === 0) {
                    // Akış görünmedi (muhtemelen tek seferde gelen JSON).
                    post("onJobFail", { id: id, reason: "not_streamed" });
                    delete jobs[id];
                    return;
                }
                var job = jobs[id];
                if (job) { job.text = text; job.chunks = chunks; }
                finish(id, true);
            });

            xhr.addEventListener("error", function () {
                if (id) { post("onJobFail", { id: id, reason: "xhr_error" }); delete jobs[id]; }
            });

            xhr.addEventListener("abort", function () {
                if (id) { post("onJobFail", { id: id, reason: "xhr_abort" }); delete jobs[id]; }
            });

            // progress olayları pratikte yalnızca akışlı yanıtlarda tekrar tekrar tetiklenir.
            function watchProgress() {
                if (!id) { return; }
                chunks += 1;
                try { text = String(xhr.responseText || "").slice(-20000); } catch (e) { text = ""; }
                if (chunks % 20 === 0 && jobs[id]) { progress(id, chunks, text); }
            }

            var send = xhr.send;
            xhr.send = function (body) {
                if ((method === "POST" || method === "PUT" || method === "PATCH") &&
                    isCandidate(url) && looksLikePromptCall(url, body)) {
                    id = newId("xhr");
                    start(id, "xhr", url, extractPrompt(body));
                    try { xhr.addEventListener("progress", watchProgress); } catch (e) { /* */ }
                }
                return send.apply(xhr, arguments);
            };

            return xhr;
        }

        WrappedXhr.prototype = OriginalXhr.prototype;
        Object.defineProperty(WrappedXhr, "UNSENT", { value: OriginalXhr.UNSENT });
        Object.defineProperty(WrappedXhr, "OPENED", { value: OriginalXhr.OPENED });
        Object.defineProperty(WrappedXhr, "HEADERS_RECEIVED", { value: OriginalXhr.HEADERS_RECEIVED });
        Object.defineProperty(WrappedXhr, "LOADING", { value: OriginalXhr.LOADING });
        Object.defineProperty(WrappedXhr, "DONE", { value: OriginalXhr.DONE });

        window.XMLHttpRequest = WrappedXhr;
    }

    /* -------------------------------------------------------------- EventSource kancası */

    function hookEventSource() {
        var OriginalEs = window.EventSource;
        if (!OriginalEs) { return; }

        function WrappedEventSource(url, config) {
            var es = new OriginalEs(url, config);
            if (!isCandidate(url)) { return es; }

            var id = newId("sse");
            var text = "";
            start(id, "sse", url, "");

            es.addEventListener("message", function (event) {
                text += String((event && event.data) || "") + "\n";
                var job = jobs[id];
                if (job) { job.text = text.slice(-20000); job.chunks += 1; progress(id, job.chunks, job.text); }
            });

            var closed = false;
            function close() {
                if (closed) { return; }
                closed = true;
                clearInterval(timer);
                if (jobs[id]) { finish(id, true); }
            }
            es.addEventListener("error", function () { if (es.readyState === 2) { close(); } });
            var timer = setInterval(function () { if (es.readyState === 2) { close(); } }, 750);
            setTimeout(function () { if (!closed && es.readyState === 2) { close(); } }, 60000);

            return es;
        }

        WrappedEventSource.prototype = OriginalEs.prototype;
        WrappedEventSource.CONNECTING = OriginalEs.CONNECTING;
        WrappedEventSource.OPEN = OriginalEs.OPEN;
        WrappedEventSource.CLOSED = OriginalEs.CLOSED;
        window.EventSource = WrappedEventSource;
    }

    /* ------------------------------------------------------------------- DOM izleyicisi */

    function isGenerating() {
        var elements = document.querySelectorAll('[data-testid], [data-state], [data-status], button, [role="button"]');
        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            if (!element || !element.getAttribute) { continue; }
            var testId = element.getAttribute("data-testid") || "";
            var state = (element.getAttribute("data-state") || "") + " " + (element.getAttribute("data-status") || "");
            var label = element.getAttribute("aria-label") || "";
            var text = (element.innerText || element.textContent || "").trim();
            var haystack = (testId + " " + state + " " + label + " " + text).toLowerCase();
            if (!haystack.trim()) { continue; }
            if (/stop|durdur/.test(String(testId).toLowerCase())) { return true; }
            if (/^(stop|stop generating|stop response|durdur|üretimi durdur|yanıtı durdur|cevabı durdur|cevaplamayı durdur)\b/i.test((label || text).trim())) { return true; }
            if (/(streaming|generating|in_progress|in-progress|inprogress)/i.test(state)) { return true; }
        }
        return false;
    }

    function lastMessageText(role) {
        var selectors = role === "user"
            ? ['[data-message-author-role="user"]', '[data-role="user"]', '[data-author="user"]', '[data-testid*="user-message"]']
            : ['[data-message-author-role="assistant"]', '[data-role="assistant"]', '[data-author="assistant"]',
               '[data-testid*="assistant"]', '[class*="assistant"]', 'article'];
        for (var i = 0; i < selectors.length; i++) {
            var elements = document.querySelectorAll(selectors[i]);
            if (elements && elements.length) {
                var element = elements[elements.length - 1];
                var text = (element.innerText || element.textContent || "").trim();
                if (text && text.length > 1) { return text.slice(-3000); }
            }
        }
        return "";
    }

    function lastAssistantText() { return lastMessageText("assistant"); }
    function lastUserText() { return clip(lastMessageText("user"), 200); }

    function domTick() {
        var active = isGenerating();
        var t = now();

        if (active && !domActive) {
            domActive = true;
            domStartedAt = t;
            post("onJobStart", jobShell("dom-" + t, "dom", window.location.href, lastUserText()));
            return;
        }

        if (!active && domActive) {
            domActive = false;
            var elapsed = t - domStartedAt;
            if (elapsed >= CONFIG.domMinMs && t - domNotifyAt > 5000) {
                domNotifyAt = t;
                domArmed = false;
                post("onJobDone", {
                    id: "dom-" + domStartedAt,
                    source: "dom",
                    url: window.location.href,
                    prompt: lastUserText(),
                    preview: clip(lastAssistantText(), 1500),
                    chunks: 0,
                    durationMs: elapsed,
                    pageTitle: clip(document.title || "", 80)
                });
            } else {
                post("onJobFail", { id: "dom-" + domStartedAt, reason: "too_short" });
            }
        }
    }

    function armDom() {
        domArmed = true;
        domStartedAt = now();
        domNotifyAt = 0;
        if (!domActive) {
            post("onJobStart", jobShell("manual-" + domStartedAt, "manual", window.location.href, lastUserText()));
        }
    }

    /* ------------------------------------------------------------ prompt gönderme (hızlı yanıt) */

    function findComposer() {
        var selectors = ['textarea', '[contenteditable="true"]', '[role="textbox"]',
                         '[data-testid*="composer"]', '[data-testid*="prompt"]', 'input[type="text"]'];
        for (var i = 0; i < selectors.length; i++) {
            var elements = document.querySelectorAll(selectors[i]);
            for (var j = 0; j < elements.length; j++) {
                var element = elements[j];
                if (element && !element.disabled && element.offsetParent !== null) { return element; }
            }
        }
        for (var k = 0; k < selectors.length; k++) {
            var fallback = document.querySelector(selectors[k]);
            if (fallback) { return fallback; }
        }
        return null;
    }

    function setValue(element, value) {
        var isEditable = element.getAttribute && (element.getAttribute("contenteditable") === "true" ||
            (element.getAttribute("role") === "textbox" && element.tagName !== "TEXTAREA" && element.tagName !== "INPUT"));
        if (isEditable) {
            element.textContent = value;
            element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
            return true;
        }
        var proto = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
            : element.tagName === "INPUT" ? HTMLInputElement.prototype : null;
        if (!proto) { return false; }
        var descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        if (!descriptor || !descriptor.set) { element.value = value; }
        else { descriptor.set.call(element, value); }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function findSendButton() {
        var candidates = document.querySelectorAll('button, [role="button"], [data-testid]');
        var best = null;
        for (var i = 0; i < candidates.length; i++) {
            var element = candidates[i];
            if (element.disabled) { continue; }
            var testId = (element.getAttribute && element.getAttribute("data-testid")) || "";
            var label = (element.getAttribute && element.getAttribute("aria-label")) || "";
            var type = (element.getAttribute && element.getAttribute("type")) || "";
            var text = ((element.innerText || element.textContent) || "").trim().toLowerCase();
            var hay = (testId + " " + label + " " + text).toLowerCase();
            if (!hay.trim()) { continue; }
            if (type === "submit" || /send|gönder|submit|submit prompt/.test(hay)) {
                if (/stop|durdur|cancel/.test(hay)) { continue; }
                best = element;
            }
        }
        return best;
    }

    // Native tarafından çağrılır: metni yazıp gönder düğmesine basar.
    function sendPrompt(raw) {
        var text = String(raw == null ? "" : raw);
        var element = findComposer();
        if (!element) { return "no_composer"; }
        if (!setValue(element, text)) { return "no_composer"; }
        var button = findSendButton();
        if (button) {
            button.click();
            return "sent_click";
        }
        element.focus();
        try {
            element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
            return "sent_enter";
        } catch (e) {
            return "no_send_button";
        }
    }

    /* ------------------------------------------------------------------------- kurulum */

    function install() {
        if (CONFIG.streamWatch) {
            try { hookFetch(); } catch (e) { log("fetch hook failed: " + e); }
            try { hookXhr(); } catch (e) { log("xhr hook failed: " + e); }
            try { hookEventSource(); } catch (e) { log("sse hook failed: " + e); }
        }
        if (CONFIG.domWatch) {
            if (domPoll) { clearInterval(domPoll); }
            domPoll = setInterval(domTick, CONFIG.domPollMs || 700);
        }
    }

    window.__arenaMonitor = {
        version: 2,
        installed: true,
        jobs: jobs,
        arm: armDom,
        send: sendPrompt,
        isGenerating: isGenerating,
        configure: function (next) {
            CONFIG = next;
            install();
        }
    };
    window.ArenaComposer = { send: sendPrompt, setValue: setValue };

    install();
    log("monitor hazır");
})();
