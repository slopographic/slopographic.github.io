/* Slop Compare: the downloadable report, one self-contained HTML page (its own styles, pictures inline as data: URLs, no
 * script, nothing loaded from the network). The diff is drawn by core/render.js, as on the page. Pure.
 *   reportHtml(result, { nameA, nameB, date }) → the page
 *     result: the page's result (core/compare.js, plus io/files.js for pictures and PDFs: image.urls { a, b, diff } and
 *     pdf.visual[i].url, the difference picture of page i). The report keeps 3 lines of context, whatever the page shows.
 *   reportName(nameA, nameB, ext) → 'compare-a-vs-b.html' */
import { esc, textTable, jsonTable, csvTable } from './render.js';
import { summary } from './kind.js';

const CSS = `body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1b1b1f;background:#fff;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}.meta{color:#4a4a55;margin:0 0 12px}.sum{font-weight:600}
.df-t{border-collapse:collapse;width:100%;font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;table-layout:fixed}
.df-t td,.df-t th{padding:1px 6px;vertical-align:top;white-space:pre-wrap;word-break:break-word;text-align:left}
.df-n{width:3.5em;color:#5c5c66;text-align:right!important;user-select:none}.df-s{width:1.2em}
.df-unified .df-n{width:3.2em}.df-del,.df-unified .df-del td{background:#ffe9ec}.df-ins,.df-unified .df-ins td{background:#e3f7e8}
.df-none{background:#f3f3f5}del{background:#ffc2cb;text-decoration:none;color:#7a0016}ins{background:#a8e8b8;text-decoration:none;color:#0b4a1d}
.df-fold td{background:#f1f2f6;color:#4a4a55;text-align:center!important;font-style:italic}.df-fold button{all:unset}
.df-page td{background:#e8ecf8;font-weight:600;font-family:system-ui,sans-serif}
.df-grid th{background:#f1f2f6;border-bottom:1px solid #ccd}.df-grid td{border-bottom:1px solid #e4e4ea}.df-k{width:6em;font-family:system-ui,sans-serif}
.df-row-del td{background:#ffe9ec}.df-row-ins td{background:#e3f7e8}.df-col-del{background:#ffe0e5!important}.df-col-ins{background:#d9f3e0!important}
.pics{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.pics figure{margin:0}.pics img{max-width:100%;border:1px solid #ccd}
figcaption{color:#4a4a55;font-size:12px}@media print{body{padding:0}.df-t{font-size:10px}}`;

export const reportName = (a, b, ext = 'html') => {
  const s = (n) => String(n || '').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'text';
  return `compare-${s(a)}-vs-${s(b)}.${ext}`;
};

function pictures(list) {
  return `<div class="pics">${list.filter((p) => p.src).map((p) => `<figure><img src="${esc(p.src)}" alt="${esc(p.alt)}"><figcaption>${esc(p.alt)}</figcaption></figure>`).join('')}</div>`;
}

function body(r, words) {
  const o = r.opts || {};
  if (r.kind === 'json') return jsonTable(r.json);
  if (r.kind === 'csv') return csvTable(r.csv);
  if (r.kind === 'image') {
    const i = r.image;
    return (i.note ? `<p>${esc(i.note)}</p>` : '') + pictures([{ src: i.urls.a, alt: 'A' }, { src: i.urls.b, alt: 'B' }, { src: i.urls.diff, alt: 'Difference: changed pixels in red' }])
      + (i.boxes.length ? `<h2>Changed areas</h2><ol>${i.boxes.map((b) => `<li>${b.w} × ${b.h} px at ${b.x}, ${b.y}</li>`).join('')}</ol>` : '');
  }
  if (r.kind === 'pdf' && r.view === 'visual') {
    return r.pdf.visual.map((p) => `<h2>Page ${p.page}${p.count ? `: ${p.boxes.length} changed area${p.boxes.length === 1 ? '' : 's'}` : ': no change'}${p.missing ? ` (only in ${p.missing})` : ''}</h2>`
      + (p.count && p.url ? pictures([{ src: p.url, alt: `Page ${p.page}, changes in red` }]) : '')).join('');
  }
  return textTable(r.text, { view: o.view === 'split' ? 'split' : 'unified', context: 3, words, pages: r.kind === 'pdf' ? r.pdf.pages : null });
}

export function reportHtml(r, { nameA = 'A', nameB = 'B', date = new Date() } = {}) {
  const o = r.opts || {}, words = { ignoreWs: !!o.ignoreWs, ignoreCase: !!o.ignoreCase };
  const opts = [o.ignoreWs && 'whitespace ignored', o.ignoreCase && 'case ignored'].filter(Boolean).join(', ');
  const when = date instanceof Date ? date.toISOString().slice(0, 16).replace('T', ' ') : String(date);
  const title = `${nameA} compared with ${nameB}`;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${esc(title)}</title><style>${CSS}</style></head><body>`
    + `<h1>${esc(title)}</h1><p class="meta">A: ${esc(nameA)} · B: ${esc(nameB)} · ${esc(when)} UTC${opts ? ' · ' + esc(opts) : ''} · Made with Slop Compare, on this device</p>`
    + `<p class="sum">${esc(summary(r))}</p>${body(r, words)}</body></html>\n`;
}
