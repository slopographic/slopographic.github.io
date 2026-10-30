/* SlopFlowDoc: the Slop Workflows document (.slopflow files, ?flow= links) and the "Add to a workflow…" hook other apps
 * call. Classic script for app pages (window.SlopFlowDoc) that Slop Workflows also imports; Node tests read globalThis.
 *
 * A workflow:  { kind: 'slopflow', v: 1, name, steps: [step] }
 *   step:      { kind: 'op', id, options, keep?, uid }                     an operation of the registry (shared/ops/registry.js)
 *              { kind: 'macro', id, app, macroId, options, keep?, uid }    an app's recorded macro, run by its app host adapter
 *   keep: true adds that step's files to the results (the in-between files).
 *
 *   normalize(raw)            → { doc, errors }: a clean document; unknown fields dropped, a bad step skipped with a reason
 *   toText(doc) / fromText(s) the .slopflow file (JSON, pretty); fromText → { doc, errors } (errors when it is not one)
 *   encode(doc) → Promise<string>   for ?flow=: deflate-raw (CompressionStream) then base64url, prefixed 'z'; 'j' + base64url
 *                                    of the JSON where the browser cannot compress
 *   decode(s)  → Promise<{ doc, errors }>
 *   addToWorkflow(step, { name, settings, open })   from another app: hands one step to Slop Workflows, which adds it to
 *                                    the open workflow. settings: the app's own current settings, which the operation's
 *                                    fromApp(settings) turns into its options there (so the mapping lives with the
 *                                    operation, shared/ops/*.js). It goes through localStorage (a logo can be large) under
 *                                    'slopflow:add:<id>', and the page opens workflows/?add=<id>; with storage blocked the
 *                                    step alone rides in the URL (?add=z…). Returns the URL.
 *   takeAdd(param) → Promise<{ doc, errors, settings } | null>   Slop Workflows' side: reads (and forgets) what was left */
(function (root, factory) {
  const api = factory(root);
  root.SlopFlowDoc = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const VERSION = 1, KIND = 'slopflow', EXT = '.slopflow', MIME = 'application/json';
  const MAX_STEPS = 40;
  // words: shared/i18n/ui/<code>/ops.js (keys ui.ops.flow.*), read when a message is made
  const tr = (k, v) => (root.SlopI18n && root.SlopI18n.t ? root.SlopI18n.t(k, v) : k);
  const SCRIPT = typeof document !== 'undefined' && document.currentScript && document.currentScript.src;
  const SITE = SCRIPT ? new URL('../../', SCRIPT).href : null;

  let seq = 0;
  const uid = () => 's' + Date.now().toString(36) + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
  const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const cleanOptions = (o) => {
    const out = {};
    if (!plain(o)) return out;
    for (const [k, v] of Object.entries(o)) if (/^[A-Za-z][\w-]{0,40}$/.test(k) && ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
    return out;
  };

  function normalize(raw) {
    const errors = [];
    if (!plain(raw)) return { doc: null, errors: [tr('ui.ops.flow.not_workflow')] };
    if (raw.kind !== undefined && raw.kind !== KIND) return { doc: null, errors: [tr('ui.ops.flow.not_file')] };
    if (Number(raw.v) > VERSION) errors.push(tr('ui.ops.flow.newer', { v: String(raw.v) }));
    const steps = [];
    (Array.isArray(raw.steps) ? raw.steps : []).slice(0, MAX_STEPS).forEach((s, i) => {
      if (!plain(s) || typeof s.id !== 'string' || !s.id) { errors.push(tr('ui.ops.flow.no_op', { n: String(i + 1) })); return; }
      const kind = s.kind === 'macro' ? 'macro' : 'op';
      const step = { kind, id: s.id.slice(0, 120), options: cleanOptions(s.options), uid: typeof s.uid === 'string' && s.uid ? s.uid.slice(0, 40) : uid() };
      if (s.keep) step.keep = true;
      if (kind === 'macro') {
        if (typeof s.app !== 'string' || typeof s.macroId !== 'string') { errors.push(tr('ui.ops.flow.no_app', { n: String(i + 1) })); return; }
        step.app = s.app.slice(0, 40); step.macroId = s.macroId.slice(0, 120);
      }
      steps.push(step);
    });
    if (Array.isArray(raw.steps) && raw.steps.length > MAX_STEPS) errors.push(tr('ui.ops.flow.max_steps', { n: MAX_STEPS }));
    const name = String(raw.name == null ? '' : raw.name).replace(/\s+/g, ' ').trim().slice(0, 120) || tr('ui.ops.flow.untitled');
    return { doc: { kind: KIND, v: VERSION, name, steps }, errors };
  }

  /** The stored shape: no uids (they are made again on load), keep only when on. */
  function bare(doc) {
    return { kind: KIND, v: VERSION, name: doc.name, steps: doc.steps.map((s) => {
      const o = { kind: s.kind, id: s.id };
      if (s.kind === 'macro') { o.app = s.app; o.macroId = s.macroId; }
      o.options = cleanOptions(s.options);
      if (s.keep) o.keep = true;
      return o;
    }) };
  }
  const toText = (doc) => JSON.stringify(bare(doc), null, 2) + '\n';
  function fromText(text) {
    let raw;
    try { raw = JSON.parse(String(text)); } catch (e) { return { doc: null, errors: [tr('ui.ops.flow.not_json')] }; }
    return normalize(raw);
  }

  /* ---------- links ---------- */
  const B64 = { enc: (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    dec: (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; } };
  const canZip = () => typeof root.CompressionStream === 'function' && typeof root.Response === 'function';
  async function pipe(bytes, Stream) { return new Uint8Array(await new root.Response(new root.Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'))).arrayBuffer()); }

  async function encode(doc) {
    const json = new TextEncoder().encode(JSON.stringify(bare(doc)));
    if (canZip()) return 'z' + B64.enc(await pipe(json, root.CompressionStream));
    return 'j' + B64.enc(json);
  }
  async function decode(s) {
    try {
      s = String(s || '');
      const bytes = B64.dec(s.slice(1));
      const json = s[0] === 'z' ? await pipe(bytes, root.DecompressionStream) : s[0] === 'j' ? bytes : null;
      if (!json) throw new Error('bad');
      return fromText(new TextDecoder().decode(json));
    } catch (e) { return { doc: null, errors: [tr('ui.ops.flow.bad_link')] }; }
  }

  /* ---------- the hook: "Add to a workflow…" from another app ---------- */
  const ADD = 'slopflow:add:';
  async function addToWorkflow(step, { name = '', settings = null, open = true } = {}) {
    const doc = { kind: KIND, v: VERSION, name: name || tr('ui.ops.flow.untitled'), steps: [Object.assign({ kind: 'op', options: {} }, step)] };
    const id = uid();
    let param = id;
    try { root.localStorage.setItem(ADD + id, JSON.stringify({ time: Date.now(), doc: bare(normalize(doc).doc), settings })); } catch (e) { param = await encode(normalize(doc).doc); }
    const url = new URL('workflows/?add=' + encodeURIComponent(param), SITE || root.location.href).href;
    if (open) { const w = root.open(url, '_blank'); if (!w) root.location.href = url; }
    return url;
  }
  async function takeAdd(param) {
    if (!param) return null;
    if (/^[zj]/.test(param) && param.length > 30) return decode(param);
    let rec = null;
    try { rec = JSON.parse(root.localStorage.getItem(ADD + param) || 'null'); root.localStorage.removeItem(ADD + param); } catch (e) { rec = null; }
    return rec ? Object.assign(normalize(rec.doc), { settings: rec.settings || null }) : { doc: null, errors: [tr('ui.ops.flow.add_gone')] };
  }

  return { VERSION, KIND, EXT, MIME, MAX_STEPS, uid, normalize, toText, fromText, encode, decode, addToWorkflow, takeAdd };
});
