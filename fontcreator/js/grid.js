/* Slop Font: the glyph grid, the list on the left (SlopFrame's list). One cell per character of the chosen set (or every
 * glyph in the font), each with its drawing in miniature; an empty one is dashed. A click (or Enter) opens it in the
 * editor; the arrow keys move between cells. The box above adds characters: type them and press Enter. Classic script.
 *   FC.grid.mount(listEl)   paint()   paintOne(id)   svgOf(glyph, metrics) → '<svg…>' (also the kerning list's chips) */
(function (g) {
  'use strict';
  const F = g.SlopFont, CS = F.charset, P = F.paths;
  const S = () => g.FC.state, t = (k, v) => g.FC.t(k, v);
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const k in attrs) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };
  let root = null, cells = null, setSel = null, count = null, painted = null;
  const cache = new Map();

  function svgOf(gl, m) {
    const pad = Math.round(m.upm * 0.05), adv = Math.max(gl.advance, m.upm * 0.3), h = m.ascender - m.descender;
    const d = gl.contours.length ? P.toSvg(P.orient(gl.contours)) : '';
    return `<svg viewBox="${-pad} ${-m.ascender} ${adv + 2 * pad} ${h}" aria-hidden="true" focusable="false"><path transform="scale(1 -1)" d="${d}"/></svg>`;
  }
  function codes() {
    const s = S().settings().set, p = S().project();
    if (s === 'font') return p.glyphs.map((x) => x.id);
    let cps = CS.codes(s);
    if (s === 'basic' || s === 'all') {   // letters and digits first, then the punctuation
      const first = [...CS.codes('upper'), ...CS.codes('lower'), ...CS.codes('digits')];
      cps = [...first, ...cps.filter((c) => !first.includes(c))];
    }
    const ids = cps.map(CS.idOf);
    const extra = s === 'basic' || s === 'all' ? p.glyphs.filter((x) => x.id !== '.notdef' && !ids.includes(x.id) && (s === 'basic' ? x.unicode > 0x7e : x.unicode > 0x17f)).map((x) => x.id) : [];
    return [...ids, ...extra];
  }
  function cell(id) {
    const p = S().project(), gl = p.glyphs.find((x) => x.id === id), cp = CS.cpOf(id);
    const lab = cp != null ? CS.label(cp) : id, drawn = !!(gl && gl.contours.length);
    const key = gl ? JSON.stringify([gl.contours, gl.advance, p.metrics]) : '';
    let pic = cache.get(id);
    if (!pic || pic.key !== key) { pic = { key, svg: gl ? svgOf(gl, p.metrics) : '' }; cache.set(id, pic); }
    const b = el('button', { type: 'button', class: 'fc-cell' + (drawn ? '' : ' fc-empty') + (id === S().cur() ? ' fc-on' : ''), 'data-id': id,
      'aria-label': t(drawn ? 'fontcreator.grid.cell' : 'fontcreator.grid.cell_empty', { code: cp != null ? CS.hex(cp) + ' ' : '', char: lab }), 'aria-current': String(id === S().cur()) });
    const art = el('span', { class: 'fc-cell-art' });
    art.innerHTML = drawn ? pic.svg : `<span class="fc-cell-ghost" aria-hidden="true">${cp != null && cp > 0x20 && cp !== 0xa0 && cp !== 0xad ? lab.replace(/[&<]/g, (c) => (c === '&' ? '&amp;' : '&lt;')) : ''}</span>`;
    b.append(art, el('span', { class: 'fc-cell-lab' }, lab));
    return b;
  }
  function paint() {
    if (!cells) return;
    const ids = codes(), focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('.fc-cell');
    const keep = focused ? focused.dataset.id : null;
    cells.replaceChildren(...ids.map(cell));
    if (keep) { const c = cells.querySelector(`[data-id="${CSS.escape(keep)}"]`); if (c) c.focus(); }
    const st = F.model.stats(S().project());
    count.textContent = t('fontcreator.grid.count', { drawn: st.drawn, n: st.glyphs });
    setSel.value = painted = S().settings().set;
  }
  function paintOne(id) {
    if (!cells) return;
    const old = cells.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (old) old.replaceWith(cell(id)); else paint();
    const st = F.model.stats(S().project());
    count.textContent = t('fontcreator.grid.count', { drawn: st.drawn, n: st.glyphs });
  }
  function open(id, keyboard) {
    S().select(id);
    const fr = g.FC.main && g.FC.main.frame();
    if (fr && fr.showView) fr.showView();
    if (keyboard && g.FC.editor) g.FC.editor.focus();   // a tap leaves the focus alone (no ring round the canvas)
  }
  function keys(e) {
    const c = e.target.closest('.fc-cell');
    if (!c) return;
    const all = [...cells.querySelectorAll('.fc-cell')], i = all.indexOf(c);
    const cols = Math.max(1, Math.round(cells.clientWidth / (c.offsetWidth || 64)));
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: all.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const cell = all[Math.max(0, Math.min(all.length - 1, to))];
    if (cell) cell.focus();
  }
  function addChars(text) {
    const cps = CS.parseChars(text);
    if (!cps.length) return 0;
    S().edit(t('fontcreator.grid.undo_add', { n: cps.length }), 'project', (p) => { for (const cp of cps) F.model.ensure(p, cp); });
    if (S().settings().set !== 'font' && !CS.codes(S().settings().set).includes(cps[0])) S().set({ set: 'font' });
    S().select(cps[0]);
    return cps.length;
  }
  function mount(listEl) {
    root = listEl;
    setSel = g.FC.mark(el('select', { id: 'fc-set' }), { 'aria-label': 'fontcreator.grid.show' });
    for (const id of [...CS.SETS.map((s) => s.id), 'all', 'font']) setSel.append(g.FC.mark(el('option', { value: id }), { text: 'fontcreator.set.' + id }));
    setSel.addEventListener('change', () => S().set({ set: setSel.value }));
    const add = g.FC.mark(el('input', { type: 'text', id: 'fc-add-chars', autocomplete: 'off', spellcheck: 'false' }), { placeholder: 'fontcreator.grid.add_ph', 'aria-label': 'fontcreator.grid.add_label' });
    add.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const n = addChars(add.value); if (n) { add.value = ''; g.SlopUI.toast(t('fontcreator.grid.added', { n })); } } });
    count = el('p', { class: 'fc-count', id: 'fc-count', 'aria-live': 'polite' });
    cells = g.FC.mark(el('div', { class: 'fc-cells', id: 'fc-cells', role: 'group' }), { 'aria-label': 'fontcreator.app.glyphs' });
    cells.addEventListener('click', (e) => { const c = e.target.closest('.fc-cell'); if (c) open(c.dataset.id, e.detail === 0); });
    cells.addEventListener('keydown', keys);
    root.append(el('div', { class: 'fc-list-head' }, setSel, add, count), cells);
    S().on((e) => {
      if (e.what === 'glyph') paintOne(e.id);
      else if (e.what === 'select') { for (const c of cells.querySelectorAll('.fc-on')) { c.classList.remove('fc-on'); c.setAttribute('aria-current', 'false'); } const c = cells.querySelector(`[data-id="${CSS.escape(e.id)}"]`); if (c) { c.classList.add('fc-on'); c.setAttribute('aria-current', 'true'); } }
      else if (e.what === 'settings') { if (painted !== S().settings().set) paint(); }
      else paint();
    });
    g.FC.onLang(() => { cache.clear(); paint(); });   // the count and the cells' labels
    paint();
  }
  g.FC.grid = { mount, paint, paintOne, svgOf, addChars };
})(window);
