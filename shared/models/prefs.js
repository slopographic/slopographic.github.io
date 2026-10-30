/* Slopographic on-device models: what the person asked to keep, per model family (speech, ocr ...). Nothing is remembered
 * unless they said so:
 *   the pinned language ("Always use Swedish"): otherwise each new file is detected afresh;
 *   a preferred model per language ("Use it from now on for Swedish"): later files in that language go straight to it.
 * createPrefs(family = 'speech', storage = localStorage) -> { pinned(), pin(code | null), preferred(code), prefer(code, id | null), all() }
 * Keys: slop.<family>.language and slop.<family>.prefer. Storage that throws (private mode, blocked) reads as empty and
 * writes nowhere. Used by the model chooser's callers (Slop Transcribe, AI Tools). */
export function createPrefs(family = 'speech', storage = globalThis.localStorage) {
  const PIN = `slop.${family}.language`, PREFER = `slop.${family}.prefer`;
  const get = (k) => { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } };
  const set = (k, v) => { try { if (!storage) return; if (v == null) storage.removeItem(k); else storage.setItem(k, v); } catch (e) { /* not kept */ } };
  const map = () => { try { const m = JSON.parse(get(PREFER) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; } };
  return {
    pinned: () => { const v = get(PIN); return v && v !== 'auto' ? v : null; },
    pin: (code) => set(PIN, code && code !== 'auto' ? code : null),
    preferred: (code) => (code ? map()[code] || null : null),
    prefer: (code, id) => { if (!code || code === 'auto') return; const m = map(); if (id) m[code] = id; else delete m[code]; set(PREFER, JSON.stringify(m)); },
    all: () => map(),
  };
}
