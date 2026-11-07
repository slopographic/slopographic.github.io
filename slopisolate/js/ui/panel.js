/* SlopIsolate — settings panel (#props): the header (panel-head.js), Model, Edges, the look sections from panel-look.js,
 * and Export. The panel is the one editor: it edits the image on screen, or, with two or more pictures selected, all of
 * them (S.targets(); "Editing 4 pictures"). Controls are built once. Each one registers a bind(it, M) function; refresh()
 * runs them all with the active image (or null) and M = the merged settings of what is edited (core/settings.js merge:
 * M.value(path), M.mixed(path)), so a setting whose values differ shows as mixed. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, K = CO.kit, h = U.h, t = U.t;
  const P = CO.panel = {};
  const binds = [];
  const bind = (fn) => binds.push(fn);
  const pct = (v) => Math.round(v * 100) + '%';
  let cache = {};
  const FALLBACK = ['fast', 'quality', 'portrait'].map((id) => ({ id, get name() { return t('ui.models.cutout.' + id); } }));   // the names are shared/cutout/models.js's (ui.models.cutout.*)
  const MODELS = window.SlopCutoutModels ? SlopCutoutModels.ids.map((id) => SlopCutoutModels.get(id)) : FALLBACK;

  /** Run a promise-returning action; errors become toasts. */
  const run = (fn) => { Promise.resolve().then(fn).catch((e) => CO.emit('toast', (e && e.message) || String(e))); };

  /** Slider bound to one look field (path, as in core/settings.js). label: a key of the app's tables. */
  function lookSlider(label, min, max, step, fmt, path, look) {
    const c = K.slider({ label: t(label), min, max, step, value: CO.settings.get(S.defaults, path), fmt, onInput: look.input, onCommit: look.commit });
    bind((it, M) => c.sync(M.value(path), M.mixed(path)));
    return c;
  }
  P.lookSlider = lookSlider;

  /* ---------- model ---------- */
  /** The Model panel sets the app's model, for every image (not only the one on screen): the image on screen follows it
   *  again if it had another of its own, and every image that follows it re-runs with it (CO.process.followModel).
   *  With several pictures selected it is a setting of those pictures only (CO.edit: only they re-run). */
  function pickModel(id) {
    const name = MODELS.find((m) => m.id === id).name;
    if (S.bulk()) {
      const n = S.targets().filter((it) => S.modelOf(it) !== id).length;
      CO.edit.apply(S.targets(), { model: id }, 'cutout.undo.model');
      if (n) CO.emit('toast', t('cutout.panel.rerun_sel', { n, name }));
      return P.refresh();
    }
    const it = S.current();
    S.model = id;
    U.store.set('model', id);
    if (it && it.model && it.model !== id) it.model = null;
    const redo = CO.process.followModel();
    if (redo.length > 1) CO.emit('toast', t('cutout.panel.rerun_all', { n: redo.length, name }));
    if (CO.macroLook) CO.macroLook(it);   // a macro being recorded keeps the model (ui/macros.js)
    P.refresh();
  }
  function modelSec() {
    const rows = MODELS.map((m) => {
      const input = h('input', { type: 'radio', name: 'cutout-model', value: m.id });
      const size = h('span', { class: 'm-size' });
      const lab = h('label', { class: 'model' }, input, h('b', null, m.name), size, h('small', null, m.blurb || ''));
      input.addEventListener('change', () => { if (input.checked) pickModel(m.id); });
      return { m, input, size, lab };
    });
    const mixed = h('p', { class: 'pp-note pp-mixed-note' }, t('cutout.panel.model_mixed'));
    bind((it, M) => {
      const id = M.n ? (M.mixed('model') ? null : M.value('model')) : S.modelOf(it);
      mixed.hidden = !(M.n && M.mixed('model'));
      for (const r of rows) {
        // The size as the first-use notice writes it, from the same byte count (shared/cutout/models.js).
        const on = r.m.id === id, bytes = r.m.bytes ? (window.SlopFirstRun ? SlopFirstRun.size(r.m.bytes) : U.fmtBytes(r.m.bytes)) : '';
        const ready = cache[r.m.id] === true;
        r.input.checked = on;
        r.lab.classList.toggle('on', on);
        r.size.classList.toggle('cached', ready);
        r.size.textContent = ready ? t('cutout.panel.on_device', { size: bytes }) : bytes;
        r.size.title = t(ready ? 'cutout.panel.stored' : 'cutout.panel.downloads_once');
      }
    });
    return K.section(t('cutout.panel.model'), h('div', { class: 'models', role: 'radiogroup', 'aria-label': t('cutout.panel.model') }, ...rows.map((r) => r.lab)), mixed);
  }
  /** Which models are stored on this device (engine call; a failure just leaves the sizes plain). */
  function loadCache() {
    try { Promise.resolve(SlopCutout.cached()).then((c) => { cache = c || {}; P.refresh(); }, () => {}); }
    catch (e) { /* engine not ready */ }
  }

  /* ---------- edges ---------- */
  function edgeSec() {
    const L = {
      threshold: K.look('cutout.panel.threshold', 's.threshold'),
      softness: K.look('cutout.panel.softness', 's.softness'),
      feather: K.look('cutout.panel.feather', 's.feather'),
      decontaminate: K.look('cutout.panel.decontaminate', 's.decontaminate'),
      refine: K.look('cutout.panel.refine', 's.refine'),
    };
    const rows = [
      lookSlider('cutout.panel.threshold', 0, 1, 0.01, pct, 's.threshold', L.threshold),
      lookSlider('cutout.panel.softness', 0, 1, 0.01, pct, 's.softness', L.softness),
      lookSlider('cutout.panel.feather', 0, 16, 0.5, (v) => v + ' px', 's.feather', L.feather),
    ];
    const dec = K.check({ label: t('cutout.panel.decontaminate'), checked: true, onChange: (v) => L.decontaminate.once(v) });
    const ref = K.check({ label: t('cutout.panel.refine'), checked: true, onChange: (v) => L.refine.once(v) });
    bind((it, M) => { dec.sync(M.value('s.decontaminate'), M.mixed('s.decontaminate')); ref.sync(M.value('s.refine'), M.mixed('s.refine')); });
    return K.section(t('cutout.panel.edges'), ...rows, dec, ref, K.note(t('cutout.panel.edges_note')));
  }

  /* ---------- export ---------- */
  function exportSec() {
    const fmt = K.seg({
      options: [['png', 'PNG'], ['webp', 'WebP'], ['jpg', 'JPG']], value: S.exportOpts.format,
      onChange: (v) => S.setExport({ format: v }),
    });
    const q = K.slider({ label: t('cutout.panel.quality'), min: 0.5, max: 1, step: 0.01, value: S.exportOpts.quality, fmt: pct, onInput: (v) => S.setExport({ quality: v }) });
    const jpg = K.color({ label: t('cutout.panel.background'), value: S.exportOpts.jpgBg, onInput: (v) => S.setExport({ jpgBg: v }) });
    // the one main button, Download (or Export N pictures), is at the panel's foot (ui/main.js); here the batch export
    const all = h('button', { type: 'button', class: 'btn', id: 'btnExportAll' });
    U.btnIcon(all, 'zip', t('cutout.panel.export_all'));
    all.addEventListener('click', () => run(() => CO.export.all()));
    bind((it) => {
      const f = S.exportOpts.format;
      fmt.sync(f);
      q.hidden = f === 'png';
      q.sync(S.exportOpts.quality);
      jpg.hidden = f !== 'jpg';
      jpg.sync(S.exportOpts.jpgBg);
      all.disabled = !S.items.some((i) => i.status === 'done');
    });
    return K.section(t('cutout.panel.export'), fmt, q, jpg,
      h('div', { class: 'no-wm', html: U.icon('lock') }, h('span', null, t('cutout.panel.no_wm'))),
      h('div', { class: 'pp-btns' }, all));
  }

  /* ---------- refresh ---------- */
  P.refresh = function () {
    const root = U.$('#props');
    if (!root) return;
    const it = S.current(), items = S.targets(), M = CO.settings.merge(items.length ? items : [S.defaults], S.modelOf);
    if (!items.length) M.n = 0;
    for (const fn of binds) fn(it, M);
    for (const sec of root.querySelectorAll('.pp-sec')) {
      if (it || items.length) sec.removeAttribute('data-off'); else sec.dataset.off = '1';
    }
  };
  P.refreshSoon = U.debounce(() => P.refresh(), 60);

  /** Builds the panel's controls (again after a language change: the same settings, the words of the new language).
   *  A rebuild swaps only these sections: the footer and the sheet's parts that shared code adds to #props stay. */
  let mine = [];
  function build(root) {
    binds.length = 0;
    const head = CO.panelHead.build(bind);
    const look = CO.panelLook ? CO.panelLook.build(bind) : [];
    const nodes = [...head, modelSec(), edgeSec(), ...look, exportSec()];
    if (mine.length && mine[0].parentNode === root) { mine[0].before(...nodes); mine.forEach((n) => n.remove()); }
    else root.replaceChildren(...nodes);
    mine = nodes;
  }

  P.init = function () {
    const root = U.$('#props');
    if (!root) return;
    build(root);
    U.onLang(() => { build(root); P.refresh(); });
    CO.on('activeItem', () => P.refresh());
    CO.on('active', () => P.refresh());
    CO.on('item', (it) => { P.refresh(); if (it.status === 'done' && cache[S.modelOf(it)] !== true) loadCache(); });
    CO.on('list', () => P.refresh());
    CO.on('export', () => P.refresh());
    CO.on('sel', () => P.refresh());
    CO.on('settings', () => P.refreshSoon());
    CO.on('history', () => P.refreshSoon());
    loadCache();
    P.refresh();
  };
})();
