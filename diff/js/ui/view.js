/* Slop Compare: the result under the two sides. Texts, JSON and CSV are drawn by core/render.js (the same drawing as the
 * report); pictures and PDF pages by picture.js. Next and Previous walk the changes: a text's change blocks, JSON's
 * differences, CSV's changed rows, a picture's changed areas, the PDF pages that look different.
 *   render()   draws S.result (or S.error)   go(step) → the change now shown (1-based) or 0   at(i) shows change i
 *   count()    how many changes Next and Previous walk */
import { S } from './state.js';
import { textTable, jsonTable, csvTable } from '../core/render.js';
import { changes, summary } from '../core/kind.js';
import { mountPicture } from './picture.js';
import { t, tr } from './i18n.js';

const $ = (id) => document.getElementById(id);
let pic = null, pageIx = 0;

export const count = () => changes(S.result);

function changedPages() { return S.result.pdf.visual.map((p, i) => (p.count ? i : -1)).filter((i) => i >= 0); }

function drawPage(host) {
  const r = S.result, vis = r.pdf.visual;
  host.textContent = '';
  if (!vis.length) { host.textContent = t('diff.view.no_pages'); return; }
  const bar = document.createElement('div');
  bar.className = 'df-pages';
  const sel = document.createElement('select');
  sel.className = 'df-page-pick'; sel.setAttribute('aria-label', t('diff.view.page_aria'));
  vis.forEach((p, i) => sel.append(new Option(p.missing ? t('diff.view.opt_only', { page: String(p.page), side: p.missing }) : p.count ? t('diff.view.opt_changes', { page: String(p.page), n: p.boxes.length }) : t('diff.view.opt_same', { page: String(p.page) }), String(i))));
  sel.value = String(pageIx);
  sel.addEventListener('change', () => { pageIx = Number(sel.value); drawPage(host); });
  bar.append(sel);
  if (r.pdf.more) { const n = document.createElement('span'); n.className = 'df-note'; n.textContent = t('diff.view.first_pages', { n: vis.length }); bar.append(n); }
  const box = document.createElement('div');
  host.append(bar, box);
  const p = vis[pageIx];
  pic = mountPicture(box, { canvas: { a: p.canvas.a || p.canvas.diff, b: p.canvas.b || p.canvas.diff, diff: p.canvas.diff }, boxes: p.boxes, w: p.canvas.diff.width, h: p.canvas.diff.height, view: S.opts.imageView, label: t('diff.view.page_label', { page: String(p.page) }) });
}

export function render() {
  const res = $('df-res'), out = $('df-out'), err = $('df-err');
  err.hidden = !S.error; err.textContent = S.error;
  pic = null;
  if (!S.result) { res.hidden = true; out.textContent = ''; return; }
  const r = S.result, o = S.opts, words = { ignoreWs: o.ignoreWs, ignoreCase: o.ignoreCase };
  res.hidden = false;
  res.dataset.kind = r.kind;
  if (r.kind === 'json') out.innerHTML = jsonTable(r.json, { tr });
  else if (r.kind === 'csv') out.innerHTML = csvTable(r.csv, { tr });
  else if (r.kind === 'image') {
    const i = r.image;
    out.textContent = '';
    if (i.note) { const n = document.createElement('p'); n.className = 'df-note'; n.textContent = i.size ? t('diff.view.size_note', { wa: i.size[0], ha: i.size[1], wb: i.size[2], hb: i.size[3] }) : i.note; out.append(n); }
    const box = document.createElement('div'); out.append(box);
    pic = mountPicture(box, { canvas: i.canvas, boxes: i.boxes, w: i.w, h: i.h, view: o.imageView });
  } else if (r.kind === 'pdf' && r.view === 'visual') {
    if (pageIx >= r.pdf.visual.length) pageIx = 0;
    drawPage(out);
  } else out.innerHTML = textTable(r.text, { view: o.view, context: o.context, open: S.open, words, pages: r.kind === 'pdf' ? r.pdf.pages : null, tr });
  $('df-sum').textContent = summary(r, tr);
  nav();
}

function nav() {
  const n = count();
  $('df-prev').disabled = $('df-next').disabled = !n;
  $('df-pos').textContent = n ? (S.cur >= 0 ? t('diff.view.pos', { i: S.cur + 1, n }) : t('diff.view.to_go', { n })) : '';
}

export function at(i) {
  const n = count();
  if (!n) return 0;
  S.cur = ((i % n) + n) % n;
  const r = S.result, out = $('df-out');
  if (r.kind === 'image') pic && pic.current(S.cur);
  else if (r.kind === 'pdf' && r.view === 'visual') {
    pageIx = changedPages()[S.cur];
    drawPage(out);
    if (pic) pic.current(0);
  } else {
    for (const x of out.querySelectorAll('.df-cur')) x.classList.remove('df-cur');
    const rows = out.querySelectorAll(`[data-block="${S.cur}"]`);
    for (const x of rows) x.classList.add('df-cur');
    if (rows[0]) rows[0].scrollIntoView({ block: 'center' });
  }
  nav();
  return S.cur + 1;
}
export const go = (step) => at(S.cur < 0 ? (step > 0 ? 0 : -1) : S.cur + step);

/** A fold's button opens that run of unchanged lines. */
export function wire() {
  $('df-out').addEventListener('click', (e) => {
    const b = e.target.closest('.df-fold-btn');
    if (!b) return;
    S.open.add(Number(b.dataset.fold));
    const keep = S.cur;
    render();
    if (keep >= 0) at(keep);
  });
  $('df-next').addEventListener('click', () => go(1));
  $('df-prev').addEventListener('click', () => go(-1));
}
export const resetPage = () => { pageIx = 0; };
