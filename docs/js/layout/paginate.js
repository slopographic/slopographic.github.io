/* Slop Docs — layout/paginate: flow the body into real pages. Handles space before/after (suppressed at
 * the top of a page), page breaks, keep with next, keep lines together, widow/orphan control, wrapped
 * (floating) images, tables split by rows with repeating header rows, and footnote space. */
import { layoutPara } from './para.js';
import { layoutTable } from './table.js';
import { emitLines, paraCtx, shift, flowStatic } from './blocks.js';

const EPS = 0.01;

export function flowBody(L) {
  const { doc } = L;
  const P = L.pages;
  const newPage = () => {
    const pg = L.makePage(P.length);
    P.push(pg);
    L.y = pg.body.top; L.floats = []; L.fnH = 0; L.fnIds = [];
    return pg;
  };
  newPage();
  L.page = () => P[P.length - 1];
  L.newPage = newPage;
  const blocks = doc.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (L.force) { L.force = false; newPage(); }
    if (b.type === 'table') { placeTable(L, b, [i]); continue; }
    if (b.type === 'toc') { placeToc(L, b, [i]); continue; }
    if (b.type !== 'p') continue;
    keepChain(L, blocks, i);
    placePara(L, b, [i]);
  }
}

const atTop = (L) => L.y <= L.page().body.top + EPS;
const bottom = (L) => L.page().body.bottom - L.fnH;

/** Height a block needs on the page before its first break opportunity (for keep with next). */
function headHeight(L, b) {
  if (b.type === 'table') { const T = layoutTable(L, b, L.bw, 'body', [0]); return T.rows.slice(0, Math.max(1, T.headerRows + 1)).reduce((s, r) => s + r.h, 0); }
  if (b.type !== 'p') return 0;
  const info = layoutPara(L.doc, b, L.bw, paraCtx(L, b));
  const n = info.P.keepLines ? info.lines.length : Math.min(2, info.lines.length);
  return (info.P.before || 0) + info.lines.slice(0, n).reduce((s, l) => s + l.h, 0);
}
function fullHeight(L, b) {
  const info = layoutPara(L.doc, b, L.bw, paraCtx(L, b));
  return (info.P.before || 0) + info.lines.reduce((s, l) => s + l.h, 0) + (info.P.after || 0);
}
/** Keep with next: if the chain starting at i cannot finish on this page but fits on an empty one, break first. */
function keepChain(L, blocks, i) {
  if (atTop(L)) return;
  let j = i, need = 0;
  while (j < blocks.length && blocks[j].type === 'p' && layoutPara(L.doc, blocks[j], L.bw, paraCtx(L, blocks[j])).P.keepNext) { need += fullHeight(L, blocks[j]); j++; }
  if (j === i) return;
  if (j < blocks.length) need += headHeight(L, blocks[j]);
  const page = L.page().body;
  if (L.y + need > bottom(L) + EPS && need <= page.bottom - page.top) L.newPage();
}

function floatInsets(L, top) {
  return (y) => {
    const ay = top + y;
    let left = 0, right = 0;
    for (const f of L.floats) {
      if (ay + 12 < f.y || ay > f.y + f.h) continue;
      if (f.side === 'left') left = Math.max(left, f.x + f.w + 9 - L.bx);
      else right = Math.max(right, L.bx + L.bw - f.x + 9);
    }
    return { left, right };
  };
}
const fnHeight = (L, line) => {
  let h = 0;
  for (const f of line.frags) if (f.run && f.run.obj === 'fn' && !L.fnIds.includes(f.run.id)) h += L.fnBlockH(f.run.id) + (L.fnIds.length || h ? 0 : 14);
  return h;
};
const fnIdsOf = (line) => line.frags.filter((f) => f.run && f.run.obj === 'fn').map((f) => f.run.id);

export function placePara(L, p, path) {
  const doc = L.doc, ctx = paraCtx(L, p);
  let info = layoutPara(doc, p, L.bw, ctx);
  const P = info.P;
  if (P.pageBreakBefore && !atTop(L)) L.newPage();
  if (!atTop(L)) L.y += P.before || 0;
  // floating images anchored here
  for (const a of info.atoms.filter((x) => x.kind === 'float')) {
    const x = a.run.wrap === 'left' ? L.bx + (P.indL || 0) : L.bx + L.bw - (P.indR || 0) - a.fw;
    L.floats.push({ side: a.run.wrap, x, y: L.y, w: a.fw, h: a.fh });
    L.page().items.push({ kind: 'img', x, y: L.y, w: a.fw, h: a.fh, src: a.run.src, story: 'body', path, off: a.start, float: a.run.wrap });
  }
  const floating = () => L.floats.some((f) => f.y + f.h > L.y);
  if (floating()) info = { ...layoutPara(doc, p, L.bw, { ...ctx, atoms: info.atoms, widthAt: floatInsets(L, L.y) }), floated: true };
  let lines = info.lines, k = 0;
  while (k < lines.length) {
    const avail = bottom(L) - L.y;
    let n = 0, hs = 0, fh = 0, brk = false;
    while (k + n < lines.length) {
      const ln = lines[k + n], extra = fnHeight(L, ln);
      if (hs + ln.h + fh + extra > avail + EPS) break;
      hs += ln.h; fh += extra; n++;
      if (ln.reason === 'pb') { brk = true; break; }
    }
    const left = lines.length - k;
    if (n < left && !brk) {
      if (atTop(L)) n = Math.max(n, 1);
      else {
        const rest = lines.slice(k).reduce((s, l) => s + l.h, 0);
        const pageH = L.page().body.bottom - L.page().body.top;
        if (P.keepLines && k === 0 && rest <= pageH) n = 0;
        else if (P.widow !== false && left >= 2) {
          if (k === 0 && n < 2) n = 0; // orphan: the first line alone at the bottom
          else if (left - n < 2) n = Math.max(0, left - 2); // widow: the last line alone at the top
          if (k === 0 && n < 2) n = 0;
        }
      }
    }
    if (n > 0) {
      const pg = L.page();
      for (let j = k; j < k + n; j++) for (const id of fnIdsOf(lines[j])) if (!L.fnIds.includes(id)) { L.fnIds.push(id); pg.fns.push(id); }
      L.fnH += fh;
      L.y = emitLines(L, pg.items, info, k, n, L.bx, L.y, L.bw, 'body', path, p);
      k += n;
    }
    if (brk && k >= lines.length) L.force = true;
    if (k < lines.length) {
      L.newPage();
      if (info.floated) { // the rest was broken around a float on the previous page: re-break at full width
        const prev = lines[k - 1];
        const again = layoutPara(doc, p, L.bw, { ...ctx, atoms: info.atoms, startAt: prev.next, pending: prev.pending, first: false });
        lines = [...lines.slice(0, k), ...again.lines]; info = { ...info, lines, floated: false };
      }
    }
  }
  L.y += P.after || 0;
}

export function placeTable(L, t, path) {
  const T = layoutTable(L, t, L.bw, 'body', path);
  const heads = T.rows.slice(0, T.headerRows);
  const headH = heads.reduce((s, r) => s + r.h, 0);
  const pageH = () => L.page().body.bottom - L.page().body.top;
  let r = 0, onPage = 0;
  while (r < T.rows.length) {
    // rows tied by vertical merges move together
    let n = 1; while (r + n - 1 < T.rows.length - 1 && T.rows[r + n - 1].keepNext) n++;
    const group = T.rows.slice(r, r + n), gh = group.reduce((s, x) => s + x.h, 0);
    if (L.y + gh > bottom(L) + EPS && !atTop(L) && (gh + (r >= T.headerRows ? headH : 0) <= pageH() || onPage > 0)) {
      L.newPage(); onPage = 0;
      if (r >= T.headerRows && headH) { for (const h of heads) { for (const it of h.items) L.page().items.push(shift(it, L.bx, L.y)); L.y += h.h; } }
    }
    for (const row of group) { for (const it of row.items) L.page().items.push(shift(it, L.bx, L.y)); L.y += row.h; }
    r += n; onPage += n;
  }
  L.y += 4;
}

function placeToc(L, b, path) {
  const { blocks } = L.tocBlocks(b);
  blocks.forEach((p, i) => placePara(L, p, [...path, i]));
}
export { flowStatic };
