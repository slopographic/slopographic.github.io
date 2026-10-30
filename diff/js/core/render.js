/* Slop Compare: a result drawn as HTML, the one drawing for the page and for the downloaded report (core/report.js), so the
 * two always match. Pure: strings in, strings out, every text escaped.
 *   textTable(res, { view, context, open, words, pages }) → '<table class="df-t …">…'
 *     res: diffLines(). view 'unified' (one column, − and + lines) or 'split' (A on the left, B on the right); context: the
 *     unchanged lines kept around each change (-1: all); open: Set of folded runs (their first row) shown anyway;
 *     words: { ignoreWs, ignoreCase } for the changed words; pages: { a: [page per line], b: [...] } for PDFs.
 *     Each changed row carries data-block (its change's number); a fold is a row with a button (data-fold="<row>").
 *   jsonTable(json), csvTable(csv)   the structural results as tables (data-block on each difference)
 *   esc(s)
 * Every table takes tr(key, english, vars) for its own words: the page passes the translator (ui/i18n.js), the report
 * none, so the report stays in English. */
import { diffWords, visible, blockOf } from './text.js';
import { show } from './json.js';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pieces = (list, tag) => list.map((p) => (p.ch ? `<${tag}>${esc(p.text)}</${tag}>` : esc(p.text))).join('');
const num = (i) => (i >= 0 ? i + 1 : '');
const EN = (k, en) => en;

function foldRow(f, cols, tr) {
  const n = f.to - f.from;
  return `<tr class="df-fold"><td colspan="${cols}"><button type="button" class="df-fold-btn" data-fold="${f.from}">${esc(tr('diff.view.fold', `${n} unchanged line${n === 1 ? '' : 's'}`, { n }))}</button></td></tr>`;
}

/** The two sides of a changed row: word highlights when the lines are alike enough, else the whole line. */
function sides(res, r, words) {
  const a = r.a >= 0 ? res.a[r.a] : '', b = r.b >= 0 ? res.b[r.b] : '';
  if (r.t !== 'mod') return { a: esc(a), b: esc(b) };
  const w = diffWords(a, b, words);
  if (w.similarity < 0.3) return { a: `<del>${esc(a)}</del>`, b: `<ins>${esc(b)}</ins>` };
  return { a: pieces(w.a, 'del'), b: pieces(w.b, 'ins') };
}

export function textTable(res, { view = 'unified', context = 3, open = null, words = {}, pages = null, tr = EN } = {}) {
  let list = visible(res.rows, res.blocks, context);
  if (open && open.size) list = list.flatMap((f) => (f.t === 'fold' && open.has(f.from) ? res.rows.slice(f.from, f.to).map((r, k) => ({ ...r, i: f.from + k })) : [f]));
  const split = view === 'split';
  const out = [`<table class="df-t ${split ? 'df-split' : 'df-unified'}"><tbody>`];
  let page = null;
  for (const r of list) {
    if (r.t === 'fold') { out.push(foldRow(r, 4, tr)); continue; }
    if (pages) {
      const pa = r.a >= 0 ? pages.a[r.a] : null, pb = r.b >= 0 ? pages.b[r.b] : null;
      const key = `${pa}|${pb}`;
      if (key !== page) { page = key; out.push(`<tr class="df-page"><td colspan="4">${esc(pa != null && pb != null && pa !== pb ? tr('diff.view.page_ab', `Page ${pa} of A, page ${pb} of B`, { a: String(pa), b: String(pb) }) : tr('diff.view.page', `Page ${pa != null ? pa : pb}`, { page: String(pa != null ? pa : pb) }))}</td></tr>`); }
    }
    const blk = r.t === 'eq' ? -1 : blockOf(res.blocks, r.i);
    const data = blk >= 0 ? ` data-block="${blk}" data-row="${r.i}"` : ` data-row="${r.i}"`;
    const s = sides(res, r, words);
    if (split) {
      const ca = r.t === 'eq' ? 'df-eq' : r.a >= 0 ? 'df-del' : 'df-none', cb = r.t === 'eq' ? 'df-eq' : r.b >= 0 ? 'df-ins' : 'df-none';
      out.push(`<tr class="df-r df-${r.t}"${data}><td class="df-n">${num(r.a)}</td><td class="df-c ${ca}">${s.a}</td><td class="df-n">${num(r.b)}</td><td class="df-c ${cb}">${s.b}</td></tr>`);
      continue;
    }
    if (r.t === 'eq') { out.push(`<tr class="df-r df-eq"${data}><td class="df-n">${num(r.a)}</td><td class="df-n">${num(r.b)}</td><td class="df-s"> </td><td class="df-c">${s.a}</td></tr>`); continue; }
    if (r.a >= 0) out.push(`<tr class="df-r df-del"${data}><td class="df-n">${num(r.a)}</td><td class="df-n"></td><td class="df-s">−</td><td class="df-c">${s.a}</td></tr>`);
    if (r.b >= 0) out.push(`<tr class="df-r df-ins"${data}><td class="df-n"></td><td class="df-n">${num(r.b)}</td><td class="df-s">+</td><td class="df-c">${s.b}</td></tr>`);
  }
  if (!list.length) out.push(`<tr class="df-fold"><td colspan="4">${esc(tr('diff.view.both_empty', 'Both are empty.'))}</td></tr>`);
  out.push('</tbody></table>');
  return out.join('');
}

const KIND = { added: 'Added', removed: 'Removed', changed: 'Changed' }, ROW = { mod: 'changed', del: 'removed', ins: 'added' };
const kind = (tr, k) => { const c = ROW[k] || k; return esc(tr(`diff.view.k_${c}`, KIND[c])); };
export function jsonTable(json, { tr = EN } = {}) {
  if (!json.entries.length) return `<p class="df-same">${esc(tr('diff.view.no_json_diff', 'No differences in the data.'))}</p>`;
  const rows = json.entries.map((e, i) => `<tr class="df-r df-j-${e.kind}" data-block="${i}"><td class="df-k">${kind(tr, e.kind)}</td><td class="df-path"><code>${esc(e.path)}</code></td>`
    + `<td class="df-c">${e.kind === 'added' ? '' : `<del>${esc(show(e.a, 200))}</del>`}</td><td class="df-c">${e.kind === 'removed' ? '' : `<ins>${esc(show(e.b, 200))}</ins>`}</td></tr>`);
  return `<table class="df-t df-grid"><thead><tr><th>${esc(tr('diff.view.th_change', 'Change'))}</th><th>${esc(tr('diff.view.th_path', 'Path'))}</th><th>A</th><th>B</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

export function csvTable(csv, { all = false, tr = EN } = {}) {
  const cols = csv.columns, gone = new Set(csv.removed), fresh = new Set(csv.added);
  const onlyA = esc(tr('diff.view.only_a', 'Only in A')), onlyB = esc(tr('diff.view.only_b', 'Only in B')), key = esc(tr('diff.view.key', ' (key)'));
  const head = cols.map((c) => `<th${gone.has(c) ? ` class="df-col-del" title="${onlyA}"` : fresh.has(c) ? ` class="df-col-ins" title="${onlyB}"` : ''}>${esc(c)}${c === csv.key ? key : ''}</th>`).join('');
  const out = [];
  let blk = 0, skipped = 0;
  const flush = () => { if (skipped) { out.push(`<tr class="df-fold"><td colspan="${cols.length + 2}">${esc(tr('diff.view.fold_rows', `${skipped} unchanged row${skipped === 1 ? '' : 's'}`, { n: skipped }))}</td></tr>`); skipped = 0; } };
  for (const r of csv.rows) {
    if (r.t === 'eq' && !all) { skipped++; continue; }
    flush();
    const ch = new Set(r.changed), mark = r.t === 'eq' ? '' : ` data-block="${blk++}"`;
    const cell = (c) => {
      const a = r.a ? r.a.cells[c] : undefined, b = r.b ? r.b.cells[c] : undefined;
      if (r.t === 'mod' && ch.has(c)) return `<td class="df-c df-cell"><del>${esc(a)}</del> <ins>${esc(b)}</ins></td>`;
      return `<td class="df-c">${esc(r.b ? (b === undefined ? '' : b) : a === undefined ? '' : a)}</td>`;
    };
    const label = r.t === 'eq' ? '' : kind(tr, r.t);
    out.push(`<tr class="df-r df-row-${r.t}"${mark}><td class="df-n">${r.at}</td><td class="df-k">${label}</td>${cols.map(cell).join('')}</tr>`);
  }
  flush();
  return `<table class="df-t df-grid df-csv"><thead><tr><th>${esc(tr('diff.view.th_line', 'Line'))}</th><th>${esc(tr('diff.view.th_row', 'Row'))}</th>${head}</tr></thead><tbody>${out.join('')}</tbody></table>`;
}
