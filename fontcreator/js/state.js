/* Slop Font: the page's one state. The font project (core/model.js) and the glyph being drawn, every edit through
 * edit() (so it is undoable, saved in this browser and redrawn), and the page's settings (localStorage
 * 'slop-fontcreator'; the project itself is kept in IndexedDB by js/store.js). Classic script, after the core modules.
 *   FC.state.project()            the project                 load(p, label)  a new or opened project (undoable)
 *   cur() → id                    the glyph being drawn ('u0041'); glyph() → it, or null when the font has no such glyph
 *   view() → the glyph or a blank stand-in for drawing        select(id | char | cp)
 *   edit(label, scope, fn)        scope: 'glyph' (the current glyph, made when missing; or { glyph: id }), 'meta' (info,
 *                                 metrics, kerning), 'project'. fn(project, glyph) changes it in place; returns fn's value
 *   undo(), redo(), canUndo(), canRedo(), history labels
 *   settings() / set(patch)       set, tool, grid, snap, strokeWidth, cap, format, tab, tester { text, sizes, dark }, kernSample
 *   sel                           the editor's selection { contours: Set, points: Set('c:i') }, clearSel()
 *   on(fn) → off                  fn({ what: 'glyph' | 'meta' | 'project' | 'select' | 'settings', id? }) after each change
 *   snapshot() / restore(s)       the whole project (the assistant's checkpoint), dirty() / saved() */
(function (g) {
  'use strict';
  const F = g.SlopFont, M = F.model, CS = F.charset;
  const KEY = 'slop-fontcreator';
  const DEFAULTS = Object.freeze({ set: 'basic', tool: 'select', grid: 10, snap: true, strokeWidth: 80, cap: 'round', format: 'ttf', tab: 'draw',
    tester: { text: 'The quick brown fox jumps over the lazy dog. Åsa åt ärtor och öl. 0123456789', sizes: [16, 24, 36, 64], dark: false }, // i18n-ignore
    kernSample: 'AVATAR WAVE Type To Tokyo', sheetSet: 'upper', sheetPage: 'a4' }); // i18n-ignore
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let project = M.create({ family: 'My Font' }), cur = CS.idOf(0x41), dirty = false; // i18n-ignore
  let settings = clone(DEFAULTS);
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') settings = Object.assign(settings, s, { tester: Object.assign({}, DEFAULTS.tester, s.tester || {}) }); } catch (e) { /* fresh */ }
  const fns = new Set(), done = [], undone = [], LIMIT = 80;
  const sel = { contours: new Set(), points: new Set() };

  function emit(what, id) { for (const fn of fns) { try { fn({ what, id }); } catch (e) { console.error(e); } } }
  const glyph = () => project.glyphs.find((x) => x.id === cur) || null;
  function view() {
    const gl = glyph();
    if (gl) return gl;
    const cp = CS.cpOf(cur);
    return { id: cur, name: cp == null ? cur : CS.nameOf(cp), unicode: cp, advance: Math.round(project.metrics.upm * (cp === 0x20 ? 0.25 : 0.6)), contours: [], virtual: true };
  }
  function select(key) {
    let id = null;
    if (typeof key === 'number') id = CS.idOf(key);
    else if (key != null) {
      const k = String(key), gl = M.find(project, k);
      id = gl ? gl.id : CS.cpOf(k) != null ? CS.idOf(CS.cpOf(k)) : /^U\+[0-9A-F]{4,6}$/i.test(k) ? CS.idOf(parseInt(k.slice(2), 16)) : [...k].length === 1 ? CS.idOf(k.codePointAt(0)) : null;
    }
    if (!id) throw new Error(`No glyph “${key}”`);
    if (id !== cur) { cur = id; clearSel(); emit('select', id); }
    return id;
  }
  function clearSel() { sel.contours.clear(); sel.points.clear(); }
  const metaOf = (p) => JSON.stringify({ info: p.info, metrics: p.metrics, kerning: p.kerning });
  function capture(scope, id) {
    if (scope === 'glyph') { const gl = project.glyphs.find((x) => x.id === id); return gl ? JSON.stringify(gl) : null; }
    return scope === 'meta' ? metaOf(project) : JSON.stringify(project);
  }
  function put(step, which) {
    const v = step[which];
    if (step.scope === 'glyph') {
      const i = project.glyphs.findIndex((x) => x.id === step.id);
      if (v == null) { if (i >= 0) project.glyphs.splice(i, 1); }
      else if (i >= 0) project.glyphs[i] = JSON.parse(v); else { project.glyphs.push(JSON.parse(v)); M.sort(project); }
    } else if (step.scope === 'meta') Object.assign(project, JSON.parse(v));
    else project = JSON.parse(v);
    if (step.scope !== 'glyph' && step.cur) cur = step.cur;
    clearSel(); dirty = true;
    emit(step.scope === 'glyph' ? 'glyph' : step.scope, step.id);
  }
  function edit(label, scope, fn) {
    const sc = typeof scope === 'object' && scope ? 'glyph' : scope || 'glyph';
    const id = sc === 'glyph' ? (scope && scope.glyph) || cur : null;
    const before = capture(sc, id);
    let gl = null;
    if (sc === 'glyph') {
      gl = project.glyphs.find((x) => x.id === id);
      if (!gl) { const cp = CS.cpOf(id); if (cp == null) throw new Error(`No glyph “${id}”`); gl = M.ensure(project, cp); }
    }
    let out;
    try { out = fn(project, gl); } catch (e) { if (before !== capture(sc, id)) { put({ scope: sc, id, before }, 'before'); } throw e; }
    const after = capture(sc, id);
    if (after !== before) {
      done.push({ label, scope: sc, id, before, after, cur });
      if (done.length > LIMIT) done.shift();
      undone.length = 0; dirty = true;
      emit(sc === 'glyph' ? 'glyph' : sc, id);
    }
    return out;
  }
  function load(p, label) {
    const before = JSON.stringify(project), prevCur = cur;
    project = M.clean(p);
    const first = project.glyphs.find((x) => x.unicode === 0x41) || project.glyphs.find((x) => x.contours.length && x.id !== '.notdef') || project.glyphs[0];
    cur = first ? first.id : CS.idOf(0x41);
    done.push({ label: label || t('fontcreator.undo.open_font'), scope: 'project', before, after: JSON.stringify(project), cur: prevCur });
    if (done.length > LIMIT) done.shift();
    undone.length = 0; clearSel();
    emit('project');
  }
  function undo() { const s = done.pop(); if (!s) return null; undone.push(s); put(s, 'before'); return s.label; }
  function redo() { const s = undone.pop(); if (!s) return null; done.push(s); put(s, 'after'); return s.label; }
  function set(patch) {
    Object.assign(settings, patch || {});
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* not kept */ }
    emit('settings');
    return settings;
  }
  /** At boot: the project kept in this browser (no undo step, not dirty). */
  function boot(p) { project = M.clean(p); const a = project.glyphs.find((x) => x.unicode === 0x41); cur = a ? a.id : cur; emit('project'); }
  g.FC = g.FC || {};
  /* The words (shared/i18n/APPS-HOWTO.md; tables in fontcreator/i18n/<code>/*.js): t(key, vars) when UI is built,
   * onLang(fn) after a language change (UI built once), mark(node, { text, title, 'aria-label', placeholder }) fills a
   * node from keys and marks it so SlopI18n.apply() follows a change, setName(id) a character set's name. */
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  g.FC.t = t;
  g.FC.onLang = (fn) => (g.SlopI18n && g.SlopI18n.on ? g.SlopI18n.on(fn) : () => {});
  g.FC.mark = (n, keys) => {
    const at = [];
    for (const a in keys) {
      if (a === 'text') { n.textContent = t(keys[a]); n.setAttribute('data-i18n', keys[a]); } else { n.setAttribute(a, t(keys[a])); at.push(a + ':' + keys[a]); }
    }
    if (at.length) n.setAttribute('data-i18n-attr', at.join(';'));
    return n;
  };
  g.FC.setName = (id) => t(`fontcreator.set.${id}`);
  g.FC.state = {
    project: () => project, cur: () => cur, glyph, view, select, edit, load, boot, undo, redo, set, sel, clearSel, emit, DEFAULTS,
    canUndo: () => done.length > 0, canRedo: () => undone.length > 0, undoLabel: () => (done.length ? done[done.length - 1].label : ''),
    redoLabel: () => (undone.length ? undone[undone.length - 1].label : ''), settings: () => settings,
    on: (fn) => { fns.add(fn); return () => fns.delete(fn); },
    snapshot: () => JSON.stringify(project), restore: (s) => load(JSON.parse(s), t('fontcreator.undo.ai_all')),
    dirty: () => dirty, saved: () => { dirty = false; emit('settings'); },
  };
})(window);
