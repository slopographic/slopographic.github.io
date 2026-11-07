/* Paste data, kept in Slop Drive. Each paste is one Drive file with meta.type 'paste': a text paste is a
 * text/plain blob, an image paste is the image itself. meta.pasteId is the private random link ID (?paste=<id>).
 * Expiry is a label only: nothing is deleted or hidden by time. Saves are debounced, like Slop Notes. */
const TYPE = 'paste';
const APP = 'paste';
const TEXT_MIME = 'text/plain';
const DELAY = 600;
/* 32 characters without the look-alikes l, o, 0 and 1, so 5 bits per character and no modulo bias for 256-byte draws. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

const SH = () => window.SlopHub;
/* The expiry labels: [id, words key] (paste/i18n); the words are read when shown, in the current language. */
const EXPIRY = Object.fromEntries(['never', '1h', '1d', '7d', '30d'].map((k) => [k, 'paste.expiry.' + k]));
const tr = (k) => (window.SlopI18n ? window.SlopI18n.t(k) : k);
export const expiryLabel = (k) => tr(EXPIRY[k] || EXPIRY.never);
export const EXPIRY_OPTIONS = Object.entries(EXPIRY);

/** A random link ID: 16 characters from ALPHABET, from the browser's secure random source. */
export function randomId(n = 16) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

const metaOf = (r) => (r && r.meta && r.meta.type === TYPE ? r.meta : null);
const metaFor = (p) => ({ type: TYPE, pasteId: p.pasteId, title: p.title, language: p.language, expiry: p.expiry, kind: p.kind });
const blobOf = (p) => (p.kind === 'image' ? p.blob : new Blob([p.body || ''], { type: TEXT_MIME }));

/** Every paste in Slop Drive (Trash left out), newest first. Text bodies are read in. */
export async function load() {
  const recs = await SH().list({ accept: [TEXT_MIME, 'image/*'] }); // intake-ok: the clipboard history store, not a picker
  const out = [];
  for (const r of recs) {
    const m = metaOf(r);
    if (!m || !m.pasteId) continue;
    const kind = m.kind === 'image' ? 'image' : 'text';
    let body = '';
    if (kind === 'text') { try { body = r.blob ? await r.blob.text() : ''; } catch (e) { body = ''; } }
    out.push({ id: r.id, pasteId: m.pasteId, title: m.title || '', language: m.language || 'plain', expiry: m.expiry || 'never',
      kind, body, blob: kind === 'image' ? r.blob : null, time: r.time, modified: r.modified || r.time, dirty: false });
  }
  return out;
}

/** A new paste, written to Drive now. kind 'text' takes body; kind 'image' takes blob. */
export async function create(p) {
  const it = { title: '', language: 'plain', expiry: 'never', kind: 'text', body: '', blob: null, ...p, pasteId: randomId() };
  const name = it.title || (it.kind === 'image' ? 'Image paste' : 'Paste');   // i18n-ignore: the Drive file's name
  it.id = await SH().put(blobOf(it), { name, from: APP, meta: metaFor(it) });
  it.time = it.modified = Date.now();
  it.dirty = false;
  listener('saved');
  return it;
}

/** Writes one paste's current state back to its Drive record. */
export async function saveNow(p) {
  const b = blobOf(p);
  const out = await SH().update(p.id, { name: p.title || (p.kind === 'image' ? 'Image paste' : 'Paste'), blob: b, type: b.type, meta: metaFor(p) });   // i18n-ignore: the Drive file's name
  if (!out) throw new Error('This paste is no longer in Slop Drive');
}

export const trash = (id) => SH().update(id, { trashedAt: Date.now() });

/* ---------- debounced saves ---------- */
const dirty = new Map();
let timer = 0, inFlight = 0, chain = Promise.resolve(), listener = () => {};
export function onSaveState(fn) { listener = fn; }
export const hasPending = () => dirty.size > 0 || timer !== 0 || inFlight > 0;
export function forget(id) { dirty.delete(id); }

/** Marks a paste as changed; it is written DELAY ms after the last change. */
export function touch(p) {
  p.dirty = true;
  dirty.set(p.id, p);
  listener('saving');
  clearTimeout(timer);
  timer = setTimeout(flush, DELAY);
}

/** Writes every changed paste now, one at a time. */
export function flush() {
  clearTimeout(timer);
  timer = 0;
  chain = chain.then(async () => {
    if (!dirty.size) return;
    const list = [...dirty.values()];
    dirty.clear();
    inFlight++;
    try {
      for (const p of list) { await saveNow(p); p.dirty = dirty.has(p.id); }
      inFlight--;
      listener('saved');
    } catch (e) {
      inFlight--;
      for (const p of list) if (!dirty.has(p.id)) dirty.set(p.id, p);
      listener('error', e);
      timer = setTimeout(flush, 3000);
    }
  });
  return chain;
}
