/* Slop Transcribe: the files to transcribe and what came out of each, read one after another. The engine is passed in
 * (app.js gives the Whisper engine of Slop AI Tools; the tests give a fake), so the queue itself has no page or worker.
 *   const q = createQueue({ engine, onChange })
 *     engine: { prepare(onStatus, model), samples(file) -> Float32Array (16 kHz mono), detect(samples) -> [{ code, p }],
 *               transcribe(samples, language, onProgress, model) -> { segments, language } }
 *   q.add(files) -> the new items; q.remove(id); q.clear(); q.get(id); q.items (a copy); q.busy
 *   q.run({ language, choose }) reads every waiting (or failed) item in turn; q.stop() stops after the current one.
 *     language 'auto': the quick model finds the language of the first 30 s (engine.detect, once per file, kept on the
 *     item); choose(language, item) -> model id (or a Promise of one) picks the model for that language (default: the
 *     engine's own choice, undefined).
 *   q.redo(id, { model, language }) puts a done item back in line to be read again with another model or language; its
 *     corrections are dropped (the caller asks first)
 *   q.edit(id, text) keeps the person's corrected text for an item (exports use it; times stay with the segments)
 * An item: { id, name, file, size, seconds, status: waiting | reading | done | error, progress (0..1), segments, language,
 * detected ([{ code, p }] or null), model (the model that read it), want ({ model, language } for a redo), text
 * (corrected text or null), error }. */
export const MAX_SECONDS = 2 * 3600;
export const RATE = 16000;
const AUDIO = /^(audio|video)\//, EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba|webm|mp4|m4v|mov|mkv|3gp|amr|wma)$/i;

/** Pure: can this file be transcribed (an audio or video file by its type, or by its name: some browsers give no type)? */
export const isMedia = (f) => !!f && (AUDIO.test(f.type || '') || EXT.test(f.name || ''));

export function createQueue({ engine, onChange = () => {} }) {
  let items = [], seq = 0, busy = false, stopping = false;
  const changed = () => onChange(api);
  const find = (id) => items.find((x) => x.id === id) || null;

  function add(files) {
    const added = [...files].filter(isMedia).map((file) => ({
      id: ++seq, name: file.name || `Recording ${seq}`, file, size: file.size || 0, seconds: null,
      status: 'waiting', progress: 0, segments: [], language: null, detected: null, model: null, want: null, text: null, error: null,
    }));
    items = items.concat(added);
    changed();
    return added;
  }
  function remove(id) { if (busy && find(id) && find(id).status === 'reading') return false; items = items.filter((x) => x.id !== id); changed(); return true; }
  function clear() { if (busy) return false; items = []; changed(); return true; }
  function edit(id, text) { const it = find(id); if (it) it.text = text; }
  function redo(id, want = {}) {
    const it = find(id);
    if (!it || busy && it.status === 'reading') return false;
    Object.assign(it, { status: 'waiting', progress: 0, error: null, text: null, want: { model: want.model || null, language: want.language || null } });
    changed();
    return true;
  }

  /** One item: decode, check the length, find the language (once), pick the model, transcribe with progress. Errors stay on
   *  the item; the queue goes on. */
  async function one(it, language, choose, onStatus) {
    it.status = 'reading'; it.progress = 0; it.error = null; changed();
    try {
      const samples = await engine.samples(it.file);
      it.seconds = samples.length / RATE;
      if (it.seconds > MAX_SECONDS) throw new Error('It is longer than 2 hours. Split it into shorter parts.');
      if (it.seconds < 0.5) throw new Error('It is too short to transcribe.');
      const want = it.want || {};
      let lang = want.language || language || 'auto';
      if (lang === 'auto' && engine.detect) {
        if (!it.detected) it.detected = await engine.detect(samples);
        if (it.detected && it.detected.length) lang = it.detected[0].code;
      }
      const model = want.model || (choose ? await choose(lang, it) : undefined);
      if (model) await engine.prepare(onStatus, model);
      const r = await engine.transcribe(samples, lang, (p) => { it.progress = p.total ? p.done / p.total : 0; changed(); }, model);
      Object.assign(it, { segments: r.segments || [], language: r.language || lang || null, model: model || null, want: null, status: 'done', progress: 1, text: null });
    } catch (e) {
      Object.assign(it, { status: 'error', error: (e && e.message) || String(e), progress: 0 });
    }
    changed();
  }

  async function run({ language = 'auto', onStatus, choose } = {}) {
    if (busy) return false;
    const todo = items.filter((x) => x.status === 'waiting' || x.status === 'error');
    if (!todo.length) return false;
    busy = true; stopping = false; changed();
    try {
      await engine.prepare(onStatus);
      for (const it of todo) {
        if (stopping) break;
        if (find(it.id)) await one(it, language, choose, onStatus);
      }
    } finally { busy = false; stopping = false; changed(); }
    return true;
  }

  const api = {
    add, remove, clear, edit, redo, run,
    stop() { if (busy) stopping = true; },
    get: (id) => find(id),
    get items() { return items.slice(); },
    get busy() { return busy; },
  };
  return api;
}
