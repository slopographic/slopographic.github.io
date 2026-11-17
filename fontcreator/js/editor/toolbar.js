/* Slop Font: the bar above the glyph editor. "‹ Glyphs" (phones: back to the grid), the glyph's name and code, the
 * previous and next glyph, the tools (Select, Pen, Rectangle, Ellipse, Stroke; also their letter keys), Undo and Redo,
 * the Path menu (Union, Subtract, Intersect, Exclude, Remove overlap, Flip, Clear), snapping and the zoom. Every button
 * calls the same function as its Ctrl+K command (js/commands.js). Classic script. FC.toolbar.mount(host), paint(). */
(function (g) {
  'use strict';
  const S = () => g.FC.state, CS = () => g.SlopFont.charset, t = (k, v) => g.FC.t(k, v);
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const k in attrs) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };
  const ICON = {
    select: '<path d="M6 3l12 8-5 1.5 3 6-2.5 1.2-3-6L6 17z"/>', pen: '<path d="M12 3l6 9-6 9-6-9z"/><circle cx="12" cy="12" r="1.6"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>', ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>', stroke: '<path d="M4 18c3-9 6-12 8-6s5 3 8-6" stroke-width="3" stroke-linecap="round"/>',
  };
  let bar = null, title = null, toolBtns = {}, undoB = null, redoB = null, snapB = null;
  const safe = (fn) => () => { try { const r = fn(); if (r && r.catch) r.catch((e) => g.SlopUI.toast(e.message)); } catch (e) { g.SlopUI.toast(e.message); } };
  /** A button whose label is a key (title and aria-label); extra.text a key for its visible text, extra.glyph a sign. */
  function btn(id, label, run, extra = {}) {
    const b = el('button', Object.assign({ type: 'button', class: 'sui-btn fc-tb', id, title: t(label), 'aria-label': t(label) }, extra));
    b.setAttribute('data-i18n-attr', `title:${label};aria-label:${label}`);
    for (const k of ['text', 'glyph']) b.removeAttribute(k);
    if (extra.icon) { b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${extra.icon}</svg>`; b.removeAttribute('icon'); } else if (extra.text) g.FC.mark(b, { text: extra.text }); else b.textContent = extra.glyph || t(label);
    b.addEventListener('click', safe(run));
    return b;
  }
  function step(d) {
    const ids = [...document.querySelectorAll('#fc-cells .fc-cell')].map((c) => c.dataset.id), i = ids.indexOf(S().cur());
    const to = ids[(i + d + ids.length) % ids.length];
    if (to) S().select(to);
  }
  const PATH = ['union', 'minus', 'intersect', 'exclude', 'merge', 'flip-h', 'flip-v', 'all', 'clear'];   // labels: fontcreator.tb.path_<op>
  function pathPick(v) {
    const O = g.FC.ops;
    try {
      if (v === 'merge') O.merge(); else if (v === 'flip-h') O.flip('h'); else if (v === 'flip-v') O.flip('v');
      else if (v === 'all') g.FC.tools.all.select.selectAll(); else if (v === 'clear') O.clear(); else O.boolean(v);
    } catch (e) { g.SlopUI.toast(e.message); }
  }
  function build() {
    bar = g.FC.mark(el('div', { class: 'fc-toolbar', id: 'fc-toolbar', role: 'toolbar' }), { 'aria-label': 'fontcreator.tb.bar' });
    const back = btn('fc-back', 'fontcreator.tb.back', () => g.FC.main.frame().showList(), { text: 'fontcreator.tb.back_short', class: 'sui-btn fc-tb fc-back' });
    title = el('div', { class: 'fc-gtitle', id: 'fc-gtitle', 'aria-live': 'polite' });
    const nav = el('div', { class: 'fc-tb-group' }, btn('fc-prev', 'fontcreator.cmd.prev', () => step(-1), { glyph: '‹' }), btn('fc-next', 'fontcreator.cmd.next', () => step(1), { glyph: '›' }));
    const tools = g.FC.mark(el('div', { class: 'fc-tb-group', role: 'group' }), { 'aria-label': 'fontcreator.cmd.group_tools' });
    for (const [id, key] of g.FC.tools.IDS) {
      toolBtns[id] = btn('fc-tool-' + id, 'fontcreator.tool.' + id, () => g.FC.tools.set(id), { icon: ICON[id], 'aria-pressed': 'false' });
      const tip = `${t(`fontcreator.tool.${id}`)} (${key})`;
      toolBtns[id].title = tip; toolBtns[id].setAttribute('aria-label', tip);
      toolBtns[id].removeAttribute('data-i18n-attr');
      tools.append(toolBtns[id]);
    }
    undoB = btn('fc-undo', 'fontcreator.tb.undo_tip', () => { if (!S().undo()) g.SlopUI.toast(t('fontcreator.tb.nothing_undo')); }, { text: 'ui.undo' });
    undoB.removeAttribute('data-i18n-attr');   // paint() writes its title (the step's name)
    redoB = btn('fc-redo', 'fontcreator.tb.redo_tip', () => { if (!S().redo()) g.SlopUI.toast(t('fontcreator.tb.nothing_redo')); }, { text: 'ui.redo' });
    const path = btn('fc-path', 'fontcreator.tb.path_ops', () => {}, { text: 'fontcreator.tb.path_btn' });
    if (g.SlopMenuButton) g.SlopMenuButton.attach(path, { label: t('fontcreator.tb.path_ops'), search: false, items: () => PATH.map((value) => ({ value, label: t(`fontcreator.tb.path_${value.replace('-', '_')}`) })), onPick: pathPick });
    snapB = btn('fc-snap', 'fontcreator.tb.snap_tip', () => S().set({ snap: !S().settings().snap }), { text: 'fontcreator.tb.snap', 'aria-pressed': 'true' });
    const zoom = el('div', { class: 'fc-tb-group' }, btn('fc-zoom-out', 'ui.zoom_out', () => g.FC.editor.zoomBy(1 / 1.25), { glyph: '−' }),
      btn('fc-zoom-fit', 'fontcreator.cmd.fit', () => g.FC.editor.fit(), { text: 'fontcreator.tb.fit' }), btn('fc-zoom-in', 'ui.zoom_in', () => g.FC.editor.zoomBy(1.25), { glyph: '+' }));
    bar.append(back, title, nav, tools, el('div', { class: 'fc-tb-group' }, undoB, redoB, path, snapB), zoom);
    return bar;
  }
  function mount(host) {
    host.append(build());
    S().on(paint);
    g.FC.onLang(() => { const old = bar; old.replaceWith(build()); paint(); if (g.FC.editor && g.FC.editor.paint) g.FC.editor.paint(); });   // the tool tips and the menu label hold the language
    paint();
  }
  function paint() {
    if (!bar) return;
    const v = S().view(), cp = v.unicode;
    title.replaceChildren(el('span', { class: 'fc-gchar' }, cp != null ? CS().label(cp) : v.name), el('span', { class: 'fc-gname' }, `${v.name}${cp != null ? ' · ' + CS().hex(cp) : ''}${v.virtual ? ' · ' + t('fontcreator.tb.not_drawn') : ''}`));
    const tool = S().settings().tool;
    for (const id in toolBtns) toolBtns[id].setAttribute('aria-pressed', String(id === tool));
    undoB.disabled = !S().canUndo(); redoB.disabled = !S().canRedo();
    undoB.title = S().canUndo() ? t('fontcreator.tb.undo_what', { what: S().undoLabel() }) : t('fontcreator.tb.nothing_undo');
    snapB.setAttribute('aria-pressed', String(!!S().settings().snap));
  }
  g.FC.toolbar = { mount, paint, step };
})(window);
