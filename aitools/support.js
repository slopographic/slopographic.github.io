/* Slop AI Tools: can this device run a tool? Returns { ok, reason } with a plain reason when it cannot, so the hub
 * can say why instead of hiding the tool. Checks are local and synchronous (no network, no model load).
 * Classic script; exposes window.SlopAISupport. */
(function (root) {
  'use strict';
  const nav = root.navigator || {};
  /** The text of an aitools.* key (aitools/i18n), or the English given: other apps' pages may not load these tables. */
  const tr = (k, en, v) => { const I = root.SlopI18n; return I && I.has(k) ? I.t(k, v) : (v ? String(en).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m)) : en); };
  const has = {
    wasm: typeof root.WebAssembly === 'object' && typeof root.WebAssembly.instantiate === 'function',
    worker: typeof root.Worker === 'function',
    idb: !!root.indexedDB,
    subtle: !!(root.crypto && root.crypto.subtle),
    canvas: typeof root.OffscreenCanvas === 'function' || !!(typeof document !== 'undefined' && document.createElement('canvas').getContext),
    audio: typeof root.AudioContext === 'function' || typeof root.webkitAudioContext === 'function',
  };
  /** The memory the browser reports, in GB (undefined when the browser does not say). */
  const memoryGB = () => (typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined);

  /** What each tool needs: wasm, audio, canvas (booleans) and minMemoryGB. */
  const NEEDS = {
    ocr: { wasm: true, minMemoryGB: 2 },
    speech: { wasm: true, audio: true, minMemoryGB: 2 },
    denoise: { canvas: true, minMemoryGB: 1 },
    tags: { wasm: true, minMemoryGB: 2 },
    portrait: { wasm: true, minMemoryGB: 2 },
  };
  const MODEL_TOOLS = new Set(['ocr', 'speech', 'tags', 'portrait']);

  /** Reasons a tool cannot run here, as plain sentences. Empty when it can. */
  function reasons(tool) {
    const n = NEEDS[tool];
    if (!n) return ['Unknown tool ' + tool];
    const out = [];
    if (n.wasm && !has.wasm) out.push(tr('aitools.sup.no_wasm', 'This browser has no WebAssembly, which the models need.'));
    if (n.audio && !has.audio) out.push(tr('aitools.sup.no_audio', 'This browser cannot decode audio.'));
    if (n.canvas && !has.canvas) out.push(tr('aitools.sup.no_canvas', 'This browser has no canvas.'));
    if (MODEL_TOOLS.has(tool) && !has.worker) out.push(tr('aitools.sup.no_worker', 'This browser cannot run background workers.'));
    if (MODEL_TOOLS.has(tool) && tool !== 'portrait' && !has.idb) out.push(tr('aitools.sup.no_idb', 'Models are stored in IndexedDB, which is turned off here.'));
    if (MODEL_TOOLS.has(tool) && tool !== 'portrait' && !has.subtle) out.push(tr('aitools.sup.no_https', 'Model files are checked with SHA-256, so the page must be opened over https.'));
    const mem = memoryGB();
    if (n.minMemoryGB && mem !== undefined && mem < n.minMemoryGB) out.push(tr('aitools.sup.memory', 'This device reports {mem} GB of memory; this tool needs about {need} GB.', { mem: String(mem), need: String(n.minMemoryGB) }));
    return out;
  }

  /** { ok, reason }: reason is the first problem, or '' when the tool can run. */
  function check(tool) {
    const r = reasons(tool);
    return { ok: r.length === 0, reason: r[0] || '', reasons: r };
  }

  root.SlopAISupport = { check, reasons, has };
})(typeof window !== 'undefined' ? window : globalThis);
