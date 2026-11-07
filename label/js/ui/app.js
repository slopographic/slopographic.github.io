/* SlopLabel — ui/app: application state, commit/undo history, selection, theme and status. The open label is App.doc; the tabs
 * (ui/tabs.js) keep each label's state and save it. */
'use strict';

const $ = (id) => document.getElementById(id);
const mk = (...a) => SlopUI.el(...a);
const App = {
  doc: null, T: null, hist: new History(), tool: 'select',
  zoom: 4, panX: 40, panY: 40, rec: 0, prompts: {}, scene: [],
  dirty: false, clip: null, tab: 'props', guides: [], hover: null, marquee: null, ghost: null,
};
// App.sel takes the Properties panel's baseline (props-reset.js) the moment the selection changes, not on the
// next frame. An edit made before that frame (a drag, or a field typed into right after selecting) must not
// end up in the baseline, or Reset would have nothing to undo.
let selIds = [];
Object.defineProperty(App, 'sel', {
  enumerable: true,
  get: () => selIds,
  set(ids) { selIds = ids; if (App.doc && typeof markPropsOpen === 'function') markPropsOpen(); },
});
const THEMES = [['pro', 'label.app.pro_dark'], ['light', 'label.app.light'], ['classic', 'label.app.classic_98']] // keys (LT at use)
  .filter(([id]) => !window.SlopTheme || SlopTheme.has(id));   // only the themes the site offers

/* ---------------- document access ---------------- */
function previewGet() { return previewResolver(App.doc, App.rec, App.prompts); }
function rebuildScene() { App.scene = buildScene(App.doc, previewGet()); App.stale = false; return App.scene; }
function objById(id) { return App.doc.objects.find((o) => o.id === id) || null; }
/** Laid-out item of an object; rebuilds the scene first if an edit is still waiting for the next frame. */
function itemOf(id) { if (App.stale) rebuildScene(); return App.scene.find((it) => it.obj.id === id) || null; }
function selObjs() { return App.doc.objects.filter((o) => App.sel.includes(o.id)); }
function selOne() { const s = selObjs(); return s.length === 1 ? s[0] : null; }
/** Label-space box of an object as drawn (auto-sized objects use their laid-out box). */
function boxOf(o) { const it = itemOf(o.id); return it ? it.box : objBox(o); }
function selBox() { return unionBox(selObjs().map(boxOf)); }
const U = () => App.doc.unit;
/** Display value of a length (mm → document unit). */
function toU(mm) { return +num(fromMM(mm, U(), App.doc.dpi), unitDigits(U()) + 1); }
function fromU(v) { return round(toMM(v, U(), App.doc.dpi), 4); }
const unitLabel = () => (U() === 'in' ? 'in' : U());

/* ---------------- selection ---------------- */
function select(ids, add = false) {
  ids = expandGroups(App.doc, ids);
  if (add) { const s = new Set(App.sel); for (const id of ids) { if (s.has(id)) s.delete(id); else s.add(id); } App.sel = [...s]; }
  else App.sel = ids;
  if (App.sel.length && App.tab !== 'props' && App.tab !== 'objects') App.tab = 'props';
  refresh();
}
function selectAll() { App.sel = App.doc.objects.filter((o) => !o.locked && !o.hidden).map((o) => o.id); refresh(); }
function deselect() { if (App.sel.length) { App.sel = []; refresh(); } }

/* ---------------- history ---------------- */
function commit(label = LT('label.cmd.edit'), coalesce = '', opts = {}) {
  if (App.hist.push(App.doc, label, coalesce)) { App.dirty = true; tabChanged(); }
  refresh(opts);
}
/** Mutate the selected objects, re-fit auto-sized ones and commit. */
function editSel(fn, label = LT('label.cmd.edit'), coalesce = '', opts = {}) {
  const get = previewGet();
  for (const o of selObjs()) { fn(o); syncAutoSize(App.doc, o, get); }
  commit(label, coalesce, opts);
}
function editDoc(fn, label = LT('label.cmd.edit'), coalesce = '', opts = {}) { fn(App.doc); commit(label, coalesce, opts); }
function restore(d) {
  App.doc = d;
  App.sel = App.sel.filter((id) => objById(id));
  App.rec = Math.min(App.rec, Math.max(0, recordCount(d) - 1));
  tabChanged();
  refresh();
}
function undo() { const d = App.hist.undo(App.doc); if (d) { restore(d); status(LT('ui.undo_what', { what: App.hist.redoLabel })); } }
function redo() { const d = App.hist.redo(App.doc); if (d) { restore(d); status(LT('ui.redo_what', { what: App.hist.undoLabel })); } }
/** Replace the document of the current tab (config import, the starter label). New labels open in a new tab: openDocTab. */
function setDoc(doc, label = LT('label.form.open')) {
  App.doc = normalizeDoc(doc);
  App.hist = new History(); App.hist.reset(App.doc, label);
  App.sel = []; App.rec = 0; App.prompts = {}; App.dirty = false; App.driveId = null; // a new label is no longer linked to a Drive file
  document.title = App.doc.name + ' — SlopLabel';
  rebuildScene();
  if (typeof fitView === 'function') fitView();
  refresh();
  tabChanged();
}

/* ---------------- add / remove objects ---------------- */
function addObject(o, label = LT('label.undo.add', { what: LW('type', o.type, TYPE_NAMES[o.type] || o.type) })) {
  App.doc.objects.push(o);
  syncAutoSize(App.doc, o, previewGet());
  App.sel = [o.id];
  App.tab = 'props';
  commit(label);
  return o;
}
function deleteSel() {
  const ids = new Set(App.sel.filter((id) => { const o = objById(id); return o && !o.locked; }));
  if (!ids.size) return;
  App.doc.objects = App.doc.objects.filter((o) => !ids.has(o.id));
  App.sel = [];
  pruneAssets(App.doc);
  commit(ids.size > 1 ? LT('label.undo.delete_n', { n: ids.size }) : LT('ui.delete'));
}
function duplicateSel(dx = 2, dy = 2) {
  const src = selObjs(); if (!src.length) return;
  const gmap = {}, out = [];
  for (const o of src) {
    const c = Object.assign(deepClone(o), { id: uid(), x: round(o.x + dx), y: round(o.y + dy), locked: false });
    if (o.group) c.group = gmap[o.group] || (gmap[o.group] = uid('g'));
    out.push(c);
  }
  App.doc.objects.push(...out);
  App.sel = out.map((o) => o.id);
  commit(out.length > 1 ? LT('label.app.duplicate_objects') : LT('label.cmd.duplicate'));
}

/* ---------------- refresh scheduling ---------------- */
let rafQ = 0, refreshOpts = {};
function refresh(opts = {}) {
  App.stale = true;
  refreshOpts = { keepProps: (rafQ ? refreshOpts.keepProps : true) && !!opts.keepProps };
  if (rafQ) return;
  rafQ = requestAnimationFrame(() => { rafQ = 0; const o = refreshOpts; refreshOpts = {}; refreshNow(o); });
}
function refreshNow(o = {}) {
  rebuildScene();
  if (typeof drawView === 'function') drawView();
  if (typeof renderPanels === 'function') renderPanels(o);
  updateChrome();
}
function updateChrome() {
  const d = App.doc, n = recordCount(d);
  $('cbLabel').textContent = `${d.name} · ${fmtLen(d.label.w, d.unit, d.dpi, false)} × ${fmtLen(d.label.h, d.unit, d.dpi)} · ${d.dpi} dpi`;
  $('recNav').hidden = !n;
  if (n) $('recInfo').textContent = `${App.rec + 1} / ${n}`;
  $('btnUndo').disabled = !App.hist.canUndo; $('btnRedo').disabled = !App.hist.canRedo;
  $('btnUndo').title = App.hist.canUndo ? LT('ui.undo_what', { what: App.hist.undoLabel }) + ' (Ctrl+Z)' : LT('label.cmd.undo');
  $('zoomVal').textContent = Math.round((App.zoom / (96 / 25.4)) * 100) + '%';
  const errs = sceneErrors(App.scene), warns = App.scene.filter((i) => i.warn).length;
  if (errs.length) status(errs[0] + (errs.length > 1 ? ' ' + LT('label.st.more', { n: errs.length - 1 }) : ''), 'err');
  else if (warns) status(LT('label.st.no_fit', { n: warns }), 'warn');
  else if (statusSticky < Date.now()) status(LT('label.st.objects', { n: d.objects.length }) + (App.sel.length ? ' · ' + LT('label.st.selected', { n: App.sel.length }) : '') + (n ? ' · ' + LT('label.st.records', { n }) : ''));
}
let statusSticky = 0;
function status(msg, cls = '', sticky = 0) {
  const s = $('stMsg'); if (!s) return;
  s.textContent = msg; s.className = cls;
  if (sticky) statusSticky = Date.now() + sticky;
}
function setRecord(i) { const n = recordCount(App.doc); if (!n) return; App.rec = (i + n) % n; refresh(); }

/* ---------------- theme & dock ---------------- */
/** Paints this page with a theme (pro, light or classic). The colours are the shared Slop theme tokens (--sl-*). */
function applyTheme(t) {
  if (!THEMES.some(([id]) => id === t)) t = 'pro';
  document.documentElement.dataset.theme = t;
  lsSet('sloplabel-theme', t);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === 'light' ? '#f4f4f4' : t === 'classic' ? '#c0c0c0' : '#1e1e1e';
  if (typeof readViewColors === 'function') readViewColors();
  refresh();
}
/** A choice made in this app: it is saved as the shared Slop theme, so every page follows it. */
function setTheme(t) {
  const shared = { pro: 'dark', light: 'light', classic: 'classic' }[t];
  if (window.SlopTheme && shared) SlopTheme.set(shared);
  applyTheme(t);
}
const narrow = () => matchMedia('(max-width: 760px)').matches;
/** Phones: the dock is a bottom sheet. SlopSheet (shared/ui/sheet.js) does the Panels button, the ×, Escape, a tap
 * outside and the swipe down; on a wide screen the dock stays in its column. */
function wireDock() {
  App.sheet = SlopSheet.attach({ root: $('app'), panel: $('dock'), phone: '(max-width: 760px)', toggles: [$('btnDock')], label: LT('label.boot.panels'),
    onChange: (open) => { if (open) renderPanels(); } });
}
function showDock(tab, open = true) {
  if (tab) App.tab = tab;
  if (App.sheet) { if (open) App.sheet.open(); else App.sheet.close(); }
  refresh();
}
function hideDock() { if (App.sheet) App.sheet.close(); }
