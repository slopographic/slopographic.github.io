/* Slop Sheets viewer: the filter popover opened from a column's filter button. A list of the column's distinct values
 * (with a search box, Select all and Clear), an optional "contains" text and an optional number test (greater or less).
 * Apply hands a filter object to onApply; Remove filter hands an empty one. Escape or a click outside cancels. */
import { distinctValues, emptyFilter, isActiveFilter } from '../../shared/sheets/query.js';
import { colName } from '../../shared/sheets/table.js';

const SHOW_MAX = 500;
const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
let panel = null, cleanup = () => {};

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const button = (label, cls = 'sv-btn') => { const b = el('button', cls, label); b.type = 'button'; return b; };

export function closeFilter() {
  cleanup();
  cleanup = () => {};
  if (panel) panel.remove();
  panel = null;
}

/** Opens the popover under anchor for column col of sheet. spec is the column's current filter (or emptyFilter()).
 * head: header rows at the top, left out of the value list. */
export function openFilter(anchor, { sheet, col, spec, onApply, head = 0 }) {
  closeFilter();
  const values = distinctValues(sheet, col, head);
  const items = values.map(({ text, count }) => {
    const row = el('label', 'sv-fitem');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !spec.values || spec.values.has(text);
    row.append(cb, el('span', 'sv-ftext', text === '' ? t('sheetview.filter.blanks') : text), el('span', 'sv-fcount', String(count)));
    return { text, key: text.toLowerCase(), row, cb };
  });
  const shown = () => items.filter((b) => !b.row.hidden);

  panel = el('div', 'sv-filter');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('sheetview.filter.title', { col: colName(col) }));
  panel.append(el('div', 'sv-fh', t('sheetview.filter.title', { col: colName(col) })));

  const search = el('input', 'sv-fsearch');
  search.type = 'search';
  search.placeholder = t('sheetview.filter.search');
  search.setAttribute('aria-label', t('sheetview.filter.search'));
  const note = el('div', 'sv-fnote');
  const applySearch = () => {
    const q = search.value.trim().toLowerCase();
    let hits = 0;
    for (const b of items) {
      const hit = !q || b.key.includes(q);
      if (hit) hits++;
      b.row.hidden = !hit || hits > SHOW_MAX;
    }
    note.textContent = hits > SHOW_MAX ? t('sheetview.filter.showing', { max: SHOW_MAX, n: hits }) : '';
  };
  search.addEventListener('input', applySearch);

  const list = el('div', 'sv-flist');
  list.setAttribute('role', 'group');
  list.append(...items.map((b) => b.row));

  const all = button(t('sheetview.filter.select_all'));
  all.addEventListener('click', () => { for (const b of shown()) b.cb.checked = true; });
  const none = button(t('sheetview.filter.clear'));
  none.addEventListener('click', () => { for (const b of shown()) b.cb.checked = false; });
  const bulk = el('div', 'sv-fbulk', null);
  bulk.append(all, none);

  const contains = el('input', 'sv-fcontains');
  contains.type = 'text';
  contains.placeholder = t('sheetview.filter.contains');
  contains.value = spec.contains || '';
  contains.setAttribute('aria-label', t('sheetview.filter.contains'));
  const op = el('select', 'sv-fop');
  op.setAttribute('aria-label', t('sheetview.filter.number_test'));
  for (const [v, k] of [['', 'no_test'], ['>', 'greater'], ['<', 'less']]) { const o = el('option', null, t('sheetview.filter.' + k)); o.value = v; op.append(o); }
  op.value = spec.op || '';
  const num = el('input', 'sv-fnum');
  num.type = 'number';
  num.step = 'any';
  num.placeholder = t('sheetview.filter.number');
  num.setAttribute('aria-label', t('sheetview.filter.number_label'));
  if (Number.isFinite(spec.num)) num.value = String(spec.num);
  const numRow = el('div', 'sv-fnumrow');
  numRow.append(op, num);

  const remove = button(t('sheetview.filter.remove'));
  const cancel = button(t('menu.cancel'));
  const ok = button(t('sheetview.filter.apply'), 'sv-btn sv-primary');
  const foot = el('div', 'sv-ffoot');
  foot.append(remove, cancel, ok);

  const build = () => {
    const chosen = items.filter((b) => b.cb.checked).map((b) => b.text);
    const n = Number(num.value);
    const testing = op.value !== '' && num.value !== '' && Number.isFinite(n);
    return {
      values: chosen.length === items.length ? null : new Set(chosen),
      contains: contains.value.trim(),
      op: testing ? op.value : '',
      num: testing ? n : NaN,
    };
  };
  const apply = () => { const f = build(); closeFilter(); onApply(isActiveFilter(f) ? f : emptyFilter()); };
  ok.addEventListener('click', apply);
  remove.addEventListener('click', () => { closeFilter(); onApply(emptyFilter()); });
  cancel.addEventListener('click', closeFilter);
  for (const i of [contains, num]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });

  panel.append(search, note, list, bulk, el('hr', 'sv-fsep'), contains, numRow, foot);
  document.body.append(panel);
  applySearch();
  place(anchor);
  search.focus();

  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeFilter(); anchor.focus(); } };
  const onDown = (e) => { if (panel && !panel.contains(e.target) && !anchor.contains(e.target)) closeFilter(); };
  const onResize = () => closeFilter();
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('resize', onResize);
  cleanup = () => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('resize', onResize);
  };
  return panel;
}

/** Below the button, or above it when there is no room, kept inside the window. */
function place(anchor) {
  const r = anchor.getBoundingClientRect();
  const w = panel.offsetWidth, h = panel.offsetHeight;
  const left = Math.min(Math.max(4, r.left), innerWidth - w - 4);
  let top = r.bottom + 4;
  if (top + h > innerHeight - 4) top = Math.max(4, r.top - h - 4);
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}
