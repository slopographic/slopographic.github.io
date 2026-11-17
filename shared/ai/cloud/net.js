/* SlopAIKit cloud, the network part: one way to call an AI provider from the browser with the person's own key.
 * Classic script; adds SlopAIKit.cloud = { sse, call, CloudError, plain, redact, seal, formats: {} }.
 *   sse(body) → async iterator of { event, data } from a fetch Response body (Server-Sent Events, any provider)
 *   call(url, init, { secret, provider, model }) → Response; every failure becomes a CloudError with a plain message:
 *        kind 'key' (401/403, a bad key) · 'rate' (429; at a free tier, cloud/free.js adds its limits, when to retry and where else to go) · 'money' (402, no credit) · 'cors' (the browser blocked the
 *        request: a local server without the allowed origin, or a provider that refuses browsers) · 'network' ·
 *        'model' (404, unknown model) · 'request' (400) · 'server' (5xx) · 'abort'
 *   redact(text, secret) → the text with the key (and anything that looks like a key) replaced by "…"; every message and
 *        error that leaves this file goes through it, so a key is never in the chat, the console or an error report.
 *   seal(messages) → the loop's history with an answer for every tool call that never ran (Stop, the spending cap), which
 *        every provider requires before the next turn.
 * Provider formats (anthropic.js, openai.js, compat.js, gemini.js) add themselves to formats[id]. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  C.formats = C.formats || {};

  /** Anything that looks like an API key: sk-…, sk-ant-…, sk-or-…, AIza… (Google), long random tokens after "Bearer". */
  const KEYISH = /\b(sk-[A-Za-z0-9_-]{4,}|AIza[0-9A-Za-z_-]{10,}|key-[A-Za-z0-9]{16,})|(Bearer\s+)[A-Za-z0-9._-]{12,}/g;
  function redact(text, secret) {
    let s = String(text == null ? '' : text);
    if (secret && String(secret).length >= 4) s = s.split(String(secret)).join('…');
    return s.replace(KEYISH, (m, a, b) => (b ? b + '…' : m.slice(0, 3) + '…'));
  }

  class CloudError extends Error {
    constructor(kind, message, { status = 0, detail = '', retryAfter = 0 } = {}) {
      super(message); this.name = 'CloudError'; this.kind = kind; this.status = status; this.detail = detail; this.retryAfter = retryAfter;
    }
  }

  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  /** The plain sentence for an error, by kind (ui.ai.cloud.err_<kind>). who = the provider's name, as people know it. */
  function plain(kind, who, extra = {}) {
    who = who || T('ui.ai.cloud.err_who');
    const v = { who, detail: extra.detail || '', secs: extra.retryAfter || 0 };
    switch (kind) {
      case 'rate': return T('ui.ai.cloud.err_rate', v) + ' ' + (extra.retryAfter ? T('ui.ai.cloud.err_rate_in', { n: extra.retryAfter }) : T('ui.ai.cloud.err_rate_wait'));
      case 'cors': return T(extra.local ? 'ui.ai.cloud.err_cors_local' : 'ui.ai.cloud.err_cors', v);
      case 'request': case 'other': return T(extra.detail ? `ui.ai.cloud.err_${kind}_detail` : `ui.ai.cloud.err_${kind}`, v);
      case 'key': case 'money': case 'network': case 'model': case 'server': case 'refusal': case 'abort': return T('ui.ai.cloud.err_' + kind, v);
      default: return T(extra.detail ? 'ui.ai.cloud.err_other_detail' : 'ui.ai.cloud.err_other', v);
    }
  }

  /** The provider's own error text from a JSON or plain body (every provider nests it differently). */
  function errorText(body) {
    try {
      const j = JSON.parse(body), e = Array.isArray(j) ? j[0] && j[0].error : j.error;
      if (e && typeof e === 'object') return String(e.message || e.status || e.type || '');
      if (typeof e === 'string') return e;
      return String(j.message || j.detail || '');
    } catch (err) { return String(body || '').slice(0, 300); }
  }
  function kindOf(status, text) {
    if (status === 401 || status === 403) return 'key';
    if (status === 400 && /api[ _]?key|API_KEY_INVALID|authentication/i.test(text)) return 'key';
    if (status === 429) return /quota|billing|credit|insufficient/i.test(text) && !/rate/i.test(text) ? 'money' : 'rate';
    if (status === 402) return 'money';
    if (status === 404) return 'model';
    if (status >= 500) return 'server';
    return 'request';
  }

  async function call(url, init = {}, { secret = '', provider = null, model = '' } = {}) {
    const who = provider ? provider.who || provider.name : '';
    let res;
    try { res = await fetch(url, init); } catch (e) {
      if (e && e.name === 'AbortError') throw new CloudError('abort', plain('abort'));
      // A fetch that never got an answer is a TypeError: offline, or the browser blocked it (CORS, Local Network Access).
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const local = !!(provider && provider.local) || /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/i.test(url);
      const kind = offline ? 'network' : 'cors';
      throw new CloudError(kind, plain(kind, who, { local }), { detail: redact(e && e.message, secret) });
    }
    if (res.ok) return res;
    const body = await res.text().catch(() => '');
    const detail = redact(errorText(body), secret).slice(0, 300);
    let kind = kindOf(res.status, detail);
    // Gemini's free tier says "You exceeded your current quota … billing" for a per-minute or per-day limit: a wait, not money
    if (kind === 'money' && res.status === 429 && C.free && C.free.tier(provider) && /free_tier|retryDelay|per (minute|day)/i.test(body)) kind = 'rate';
    const retryAfter = kind === 'rate' ? retryIn(res, body) : 0;
    const free = kind === 'rate' && C.free ? C.free.rate(provider, model, retryAfter) : '';   // a free tier's limits and where else to go
    throw new CloudError(kind, free ? `${T('ui.ai.cloud.err_rate', { who: who || T('ui.ai.cloud.err_who') })} ${free}` : plain(kind, who, { detail, retryAfter }), { status: res.status, detail, retryAfter });
  }

  /** Seconds until a rate-limited request may be sent again, from wherever the provider says it: Retry-After (seconds or
   * a date), Gemini's RetryInfo retryDelay ("37s") in the body, Groq's x-ratelimit-reset-requests/-tokens ("2m59.56s"),
   * OpenRouter's X-RateLimit-Reset (a time in ms) in the error's metadata. 0 when nobody says. */
  function retryIn(res, body) {
    const hd = (n) => (res.headers && res.headers.get ? res.headers.get(n) : null);
    const dur = (t) => { const m = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?$/.exec(String(t || '').trim()); return m && m[0] ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };
    const at = (v) => { const n = Number(v); if (!n) return 0; return Math.max(0, (n > 1e12 ? n : n * 1000) - Date.now()) / 1000; };
    const ra = hd('retry-after');
    let s = ra ? (Number.isNaN(Number(ra)) ? Math.max(0, (Date.parse(ra) - Date.now()) / 1000) : Number(ra)) : 0;
    if (!s) { const m = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(body || ''); if (m) s = Number(m[1]); }
    if (!s) s = Math.max(dur(hd('x-ratelimit-reset-requests')), dur(hd('x-ratelimit-reset-tokens')));
    if (!s) { const m = /"x-ratelimit-reset"\s*:\s*"?(\d+)/i.exec(body || ''); s = m ? at(m[1]) : at(hd('x-ratelimit-reset')); }
    return Math.ceil(s || 0);
  }

  /** Server-Sent Events: blank-line separated blocks of "event:" / "data:" lines; ":" lines are comments (OpenRouter's
   * keep-alives). Several data lines join with newlines. */
  async function* sse(body) {
    const reader = body.getReader(), dec = new TextDecoder();
    let buf = '';
    const block = (raw) => {
      let event = 'message'; const data = [];
      for (const line of raw.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue;
        const i = line.indexOf(':'), f = i < 0 ? line : line.slice(0, i), v = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
        if (f === 'event') event = v; else if (f === 'data') data.push(v);
      }
      return data.length ? { event, data: data.join('\n') } : null;
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let m;
        while ((m = /\r?\n\r?\n/.exec(buf))) { const b = block(buf.slice(0, m.index)); buf = buf.slice(m.index + m[0].length); if (b) yield b; }
      }
      buf += dec.decode();
      const last = buf.trim() && block(buf);
      if (last) yield last;
    } finally { try { reader.releaseLock(); } catch (e) { /* already released */ } }
  }
  const json = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

  /** Every tool call answered before the next model turn: calls the loop did not run get "Not run" (all providers 400 on
   * a call without its result). Also numbers calls that came without an id. */
  function seal(messages) {
    const out = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      out.push(m);
      if (m.role !== 'assistant' || !m.toolCalls || !m.toolCalls.length) continue;
      const answered = new Set();
      let j = i + 1;
      for (; j < messages.length && messages[j].role === 'tool'; j++) { out.push(messages[j]); answered.add(messages[j].callId || messages[j].name); }
      m.toolCalls.forEach((c) => { if (!answered.has(c.id || c.name)) out.push({ role: 'tool', name: c.name, callId: c.id, content: 'Not run: the request was stopped before this action.', ok: false }); });
      i = j - 1;
    }
    return out;
  }

  Object.assign(C, { sse, call, CloudError, plain, redact, seal, json, errorText, kindOf, retryIn });
})();
