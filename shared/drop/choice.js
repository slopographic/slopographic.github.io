/* SlopDropChoice: the drop zones for "Add to current" or "Create new" over an open document, where the place a file is
   dropped on decides (a drop's mode for SlopIntake.take). Attaches to window.SlopDropChoice. Classic script, no network,
   no storage. Loads after drop.js. See shared/drop/HANDOFF.md.
   ask({ files, hasDocument, labels }) -> Promise<'current' | 'new' | null>
     The question itself is the intake's one dialog (SlopIntake.choose, the pipeline's Add or New gate); ask is kept for
     callers not yet migrated and maps its answer: 'add' -> 'current'.
   zones(host, { labels, accept }) -> { at(e), hide(), destroy() } | null
     The drop-zone helper. While a drag that accept(e) takes (default: a file drag) is over host, it shows two zones over
     host: 'new' (open as a new document) and 'current' (add to the current one). at(e) says which zone an event is over,
     'new' | 'current', or null outside them. Read it in the drop event: it looks at the event's own target, so a drop
     never inherits an earlier hover. labels: { new, current, newHint, currentHint } (a hint may be a function). */
(function (root) {
  'use strict';
  const doc = root.document;
  const C = (root.SlopDropChoice = root.SlopDropChoice || {});
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  const ZONES = () => ({ new: tr('ui.drop.create_new', 'Create new'), current: tr('ui.drop.add_current', 'Add to current'), newHint: tr('ui.drop.new_hint', 'Open as a new document'), currentHint: tr('ui.drop.current_hint', 'Add to the document that is open') });
  const CSS = [
    '.sdc-zones{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:14px;z-index:20;background:color-mix(in srgb,var(--app,#111) 60%,transparent)}',
    '.sdc-zones[hidden]{display:none}',
    '.sdc-zone{border:2px dashed color-mix(in srgb,var(--fg,#888) 45%,transparent);border-radius:12px;display:grid;place-content:center;text-align:center;gap:8px;padding:16px;color:var(--fg,inherit);background:color-mix(in srgb,var(--chrome,#222) 75%,transparent);transition:background .12s,border-color .12s,transform .12s}',
    '.sdc-zone b{font:800 22px/1.1 "Archivo",var(--ui,system-ui),sans-serif;font-stretch:85%}',
    '.sdc-zone span{font-size:12px;opacity:.8;max-width:260px;justify-self:center}',
    '.sdc-zone.hot{border-color:var(--sui-accent,var(--accent,#3b5bdb));border-style:solid;background:color-mix(in srgb,var(--sui-accent,var(--accent,#3b5bdb)) 16%,transparent);transform:scale(1.01)}',
    '@media (max-width:900px){.sdc-zones{grid-template-columns:1fr}}',
  ].join('\n');

  function style() {
    if (doc.getElementById('sdc-style')) return;
    const s = doc.createElement('style');
    s.id = 'sdc-style'; s.textContent = CSS;
    doc.head.appendChild(s);
  }
  const isFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  const text = (v) => (typeof v === 'function' ? v() : v);
  function el(tag, cls, t) {
    const x = doc.createElement(tag);
    if (cls) x.className = cls;
    if (t != null) x.textContent = t;
    return x;
  }

  /** The intake's question, with the old answers. */
  C.ask = function (o) {
    o = o || {};
    const files = Array.from(o.files || []);
    if (!files.length) return Promise.resolve(null);
    if (!o.hasDocument) return Promise.resolve('new');
    const SI = root.SlopIntake;
    if (!SI || !SI.choose) return Promise.resolve('current');
    const L = Object.assign({ title: tr('ui.intake.add_files', 'Add files'), message: tr('ui.drop.where', 'Where should these files go?'), current: tr('ui.drop.add_current', 'Add to current'), new: tr('ui.drop.create_new', 'Create new') }, o.labels);
    return SI.choose({ count: files.length, names: files.map((f) => f.name), labels: { title: L.title, message: L.message, add: L.current, new: L.new, cancel: L.cancel } })
      .then((p) => (p === 'add' ? 'current' : p));
  };

  /** The drop-zone helper: two zones over host while a drag is over it. */
  C.zones = function (host, o) {
    if (!host) return null; // no host on this page: nothing to attach
    o = o || {};
    style();
    const L = Object.assign({}, ZONES(), o.labels || {});
    const accept = o.accept || isFiles;
    if (root.getComputedStyle && root.getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const box = el('div', 'sdc-zones');
    box.hidden = true; box.setAttribute('aria-hidden', 'true');
    const zone = (kind, title, hint) => { const z = el('div', 'sdc-zone'); z.dataset.choice = kind; z.append(el('b', null, title), el('span', null, text(hint))); return z; };
    box.append(zone('new', L.new, L.newHint), zone('current', L.current, L.currentHint));
    host.append(box);

    let depth = 0, shown = false, hot = 'new';
    const zoneOf = (e) => {
      const z = e.target && e.target.closest ? e.target.closest('[data-choice]') : null;
      return z && box.contains(z) ? z.dataset.choice : null;
    };
    const paint = () => {
      const hint = box.querySelector('[data-choice="current"] span');
      if (hint) hint.textContent = text(L.currentHint); // the document's name can change between drags
      box.querySelectorAll('[data-choice]').forEach((z) => z.classList.toggle('hot', z.dataset.choice === hot));
    };
    const show = () => { if (!shown) { shown = true; hot = 'new'; box.hidden = false; } };
    const hide = () => { depth = 0; shown = false; box.hidden = true; };
    const onEnter = (e) => { if (!accept(e)) return; depth++; show(); const z = zoneOf(e); if (z) hot = z; paint(); };
    const onOver = (e) => {
      if (!accept(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      const z = zoneOf(e);
      if (z && z !== hot) { hot = z; paint(); }
    };
    const onLeave = (e) => { if (!accept(e)) return; depth = Math.max(0, depth - 1); if (!depth) hide(); };
    const onDrop = (e) => { if (accept(e)) hide(); };
    host.addEventListener('dragenter', onEnter);
    host.addEventListener('dragover', onOver);
    host.addEventListener('dragleave', onLeave);
    host.addEventListener('drop', onDrop);
    return {
      at: (e) => (e ? zoneOf(e) : null),
      hide,
      destroy() {
        host.removeEventListener('dragenter', onEnter);
        host.removeEventListener('dragover', onOver);
        host.removeEventListener('dragleave', onLeave);
        host.removeEventListener('drop', onDrop);
        box.remove();
        hide();
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
