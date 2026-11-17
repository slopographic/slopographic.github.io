/* Slop Sheets: the grid. mountGrid(host, options) draws a sheet as a table: column letters stay on top, row numbers
 * stay on the left, and only the rows on screen are in the DOM (fixed row height, so a long sheet scrolls smoothly).
 * Shared by the viewer (sheetview/) and the EML preview (window.SlopSheets.preview). Styles: shared/sheets/table.css.
 *   options: { sheet, order, sort, filtered: Set<col>, style: plain|striped|grid|compact, palette: app|light|dark|classic|lime,
 *              sortable: true, onSort(col), onFilter(col, button), emptyText }
 *   returns: { update(patch), scroller, destroy() }. Only the given keys of patch change. */
import { KEY } from './csv.js';

export const ROW_HEIGHT = { plain: 26, striped: 26, grid: 26, compact: 20 };
const OVERSCAN = 12;

/** Zero-based column index → letters: 0 → A, 25 → Z, 26 → AA. */
export function colName(c) {
  let s = '', n = c + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** A word from the shared tables (shared/i18n/ui/<code>/sheets.js), the key without SlopI18n. */
const say = (key, vars) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(key, vars) : key);

/** Column widths in pixels from the first rows and the letters; capped so one long cell does not swallow the grid. */
function widthsFor(sheet) {
  const sample = Math.min(sheet.height, 300);
  const out = [];
  for (let c = 0; c < sheet.width; c++) {
    let len = colName(c).length + 4;
    for (let r = 0; r < sample; r++) { const t = sheet.text[r][c]; if (t && t.length > len) len = t.length; }
    out.push(clamp(Math.round(len * 7.4 + 18), 56, 320));
  }
  return out;
}

export function mountGrid(host, options = {}) {
  const root = el('div', 'ss-grid');
  const scroller = el('div', 'ss-scroll');
  const table = el('table', 'ss-table');
  const colgroup = el('colgroup'), thead = el('thead'), tbody = el('tbody');
  table.append(colgroup, thead, tbody);
  scroller.append(table);
  root.append(scroller);
  host.append(root);

  const st = {
    sheet: null, order: [], sort: null, filtered: new Set(), style: 'striped', palette: 'app', sortable: true,
    onSort: null, onFilter: null, emptyText: 'This sheet is empty.',
  };
  let widths = [], raf = 0, lastSheet = null;

  function applyAttrs() {
    root.dataset.style = st.style;
    root.dataset.palette = st.palette;
    root.style.setProperty('--ss-rh', ROW_HEIGHT[st.style] + 'px');
  }

  function buildColgroup() {
    const sheet = st.sheet;
    const digits = String(sheet ? sheet.height : 0).length;
    const nums = el('col'); nums.style.width = (44 + digits * 8) + 'px';
    colgroup.replaceChildren(nums, ...widths.map((w) => { const c = el('col'); c.style.width = w + 'px'; return c; }));
  }

  function headCell(c) {
    const th = el('th', 'ss-head');
    th.scope = 'col';
    const sort = st.sort && st.sort.col === c ? st.sort : null;
    th.setAttribute('aria-sort', sort ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none');
    if (st.sortable && st.onSort) {
      const b = el('button', 'ss-sort');
      b.type = 'button';
      b.title = say('ui.sheets.sort_col', { col: colName(c) });
      b.append(el('span', 'ss-letter', colName(c)), el('span', 'ss-arrow', sort ? (sort.dir < 0 ? '▼' : '▲') : ''));
      b.addEventListener('click', () => st.onSort(c));
      th.append(b);
    } else th.append(el('span', 'ss-letter', colName(c)));
    if (st.sortable && st.onFilter) {
      const f = el('button', 'ss-filter' + (st.filtered.has(c) ? ' on' : ''), '▾');
      f.type = 'button';
      f.title = say(st.filtered.has(c) ? 'ui.sheets.col_filtered' : 'ui.sheets.filter_col', { col: colName(c) });
      f.setAttribute('aria-label', f.title);
      f.setAttribute('aria-haspopup', 'dialog');
      f.addEventListener('click', (e) => { e.stopPropagation(); st.onFilter(c, f); });
      th.append(f);
    }
    return th;
  }

  function buildHead() {
    const tr = el('tr');
    tr.append(el('th', 'ss-corner'));
    const sheet = st.sheet;
    for (let c = 0; sheet && c < sheet.width; c++) tr.append(headCell(c));
    thead.replaceChildren(tr);
  }

  function rowEl(i) {
    const sheet = st.sheet, r = st.order[i];
    const tr = el('tr', i % 2 ? 'ss-row ss-alt' : 'ss-row');
    tr.dataset.row = String(r + 1);
    tr.append(el('th', 'ss-rn', String(r + 1)));
    const vals = sheet.rows[r], texts = sheet.text[r];
    for (let c = 0; c < sheet.width; c++) {
      const v = vals[c], k = KEY(r, c);
      let cls = 'ss-cell';
      if (typeof v === 'number' || v instanceof Date) cls += ' ss-num';
      if (sheet.bold.has(k)) cls += ' ss-b';
      if (!texts[c]) cls += ' ss-blank';
      const td = el('td', cls, texts[c]);
      tr.append(td);
    }
    return tr;
  }

  function spacer(px, cols) {
    const tr = el('tr', 'ss-spacer');
    tr.style.height = px + 'px';
    const td = el('td');
    td.colSpan = cols;
    td.style.height = px + 'px';
    tr.append(td);
    return tr;
  }

  function paintBody() {
    const sheet = st.sheet;
    const cols = sheet ? sheet.width + 1 : 1;
    if (!sheet || st.order.length === 0) {
      const tr = el('tr', 'ss-empty-row');
      const td = el('td', 'ss-empty', sheet && sheet.height && st.order.length === 0 ? 'No rows match the filters.' : st.emptyText);
      td.colSpan = cols;
      tr.append(td);
      tbody.replaceChildren(tr);
      return;
    }
    const n = st.order.length, rh = ROW_HEIGHT[st.style];
    const top = scroller.scrollTop, view = scroller.clientHeight || 600;
    const first = clamp(Math.floor(top / rh) - OVERSCAN, 0, n);
    const last = clamp(Math.ceil((top + view) / rh) + OVERSCAN, first, n);
    const frag = document.createDocumentFragment();
    if (first > 0) frag.append(spacer(first * rh, cols));
    for (let i = first; i < last; i++) frag.append(rowEl(i));
    if (n - last > 0) frag.append(spacer((n - last) * rh, cols));
    tbody.replaceChildren(frag);
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; paintBody(); });
  }
  const onScroll = () => schedule();
  scroller.addEventListener('scroll', onScroll, { passive: true });

  function update(patch = {}) {
    for (const k of ['sort', 'filtered', 'style', 'palette', 'sortable', 'onSort', 'onFilter', 'emptyText']) if (k in patch) st[k] = patch[k];
    let sheetChanged = false;
    if ('sheet' in patch && patch.sheet !== lastSheet) { st.sheet = patch.sheet; lastSheet = patch.sheet; sheetChanged = true; widths = st.sheet ? widthsFor(st.sheet) : []; }
    if ('order' in patch) { st.order = patch.order || []; if (patch.resetScroll) scroller.scrollTop = 0; }
    applyAttrs();
    if (sheetChanged) buildColgroup();
    buildHead();
    paintBody();
  }

  const all = (sheet) => (sheet ? Array.from({ length: sheet.height }, (_, i) => i) : []);
  update({ ...options, order: options.order ?? all(options.sheet ?? null) });

  return {
    update,
    scroller,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
      root.remove();
    },
  };
}
