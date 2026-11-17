/* Slop Compare: the report as a PDF, written with pdf-lib (convert/js/core/lib.js loadPdfLib), A4 pages with real text.
 * Lines keep their colours (removed red, added green) and the changed words their darker marks; pictures and PDF pages are
 * placed as PNGs. The standard PDF fonts cover Western European letters only: other characters print as "?" (the HTML
 * report keeps every character). Browser only.
 *   reportPdf(result, { nameA, nameB, date }) → Uint8Array (result: io/files.js withUrls(), so pictures have urls) */
import { loadPdfLib } from '../../../convert/js/core/lib.js';
import { visible, diffWords } from '../core/text.js';
import { summary } from '../core/kind.js';
import { show } from '../core/json.js';

const W = 595.28, H = 841.89, M = 40, SIZE = 8, LH = 10.5, CW = SIZE * 0.6;
const COLS = Math.floor((W - 2 * M - 64) / CW);
const KEEP = '–—‘’“”•…€™';
export const latin = (s) => String(s).replace(/−/g, '-').replace(/\t/g, '    ').replace(/[^\x20-\x7e\xa0-\xff]/g, (c) => (KEEP.includes(c) ? c : '?'));

export async function reportPdf(r, { nameA = 'A', nameB = 'B', date = new Date() } = {}) {
  const L = await loadPdfLib();
  const doc = await L.PDFDocument.create();
  const mono = await doc.embedFont(L.StandardFonts.Courier), sans = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
  const rgb = (h) => L.rgb(...[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));
  const C = { del: rgb('ffe9ec'), ins: rgb('e3f7e8'), delW: rgb('ffb3c0'), insW: rgb('9fe3b1'), fold: rgb('eef0f5'), ink: rgb('1b1b1f'), dim: rgb('5c5c66') };
  let page, y;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const need = (h) => { if (y - h < M) newPage(); };
  const say = (text, { font = sans, size = 10, color = C.ink, gap = 4 } = {}) => {
    for (const line of wrap(latin(text), Math.floor((W - 2 * M) / (size * 0.5)))) { need(size + gap); page.drawText(line, { x: M, y: y - size, size, font, color }); y -= size + gap; }
  };
  newPage();
  say(`${nameA} compared with ${nameB}`, { font: bold, size: 15, gap: 6 });
  say(`A: ${nameA} · B: ${nameB} · ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC · Made with Slop Compare, on this device`, { size: 8.5, color: C.dim, gap: 8 });
  say(summary(r), { font: bold, size: 10.5, gap: 10 });

  /** One line of code: numbers, sign, the text wrapped, its background and its changed character ranges. */
  const codeLine = (na, nb, sign, text, bg, marks, markColor) => {
    const segs = wrap(latin(text), COLS, true);
    for (let k = 0; k < segs.length; k++) {
      need(LH);
      const x0 = M + 64, top = y - LH + 0.2;
      if (bg) page.drawRectangle({ x: M, y: top, width: W - 2 * M, height: LH, color: bg });
      const from = k * COLS;
      for (const [s, e] of marks) { const a = Math.max(s, from), b = Math.min(e, from + segs[k].length); if (b > a) page.drawRectangle({ x: x0 + (a - from) * CW, y: top, width: (b - a) * CW, height: LH, color: markColor }); }
      if (!k) page.drawText(`${na}`.padStart(5) + `${nb}`.padStart(6) + ' ' + sign, { x: M, y: y - SIZE, size: SIZE, font: mono, color: C.dim });
      page.drawText(segs[k], { x: x0, y: y - SIZE, size: SIZE, font: mono, color: C.ink });
      y -= LH;
    }
  };
  const ranges = (pieces) => { const out = []; let at = 0; for (const p of pieces) { const n = latin(p.text).length; if (p.ch) out.push([at, at + n]); at += n; } return out; };
  const n = (i) => (i >= 0 ? i + 1 : '');
  const o = r.opts || {}, words = { ignoreWs: !!o.ignoreWs, ignoreCase: !!o.ignoreCase };

  if (r.kind === 'text' || (r.kind === 'pdf' && r.view !== 'visual')) {
    const t = r.text;
    for (const row of visible(t.rows, t.blocks, 3)) {
      if (row.t === 'fold') { codeLine('', '', ' ', `… ${row.to - row.from} unchanged lines`, C.fold, [], C.fold); continue; }
      const a = row.a >= 0 ? t.a[row.a] : '', b = row.b >= 0 ? t.b[row.b] : '';
      if (row.t === 'eq') { codeLine(n(row.a), n(row.b), ' ', a, null, [], null); continue; }
      const w = row.t === 'mod' ? diffWords(a, b, words) : null, alike = w && w.similarity >= 0.3;
      if (row.a >= 0) codeLine(n(row.a), '', '-', a, C.del, alike ? ranges(w.a) : [], C.delW);
      if (row.b >= 0) codeLine('', n(row.b), '+', b, C.ins, alike ? ranges(w.b) : [], C.insW);
    }
  } else if (r.kind === 'json') {
    for (const e of r.json.entries) say(`${e.kind[0].toUpperCase() + e.kind.slice(1)} ${e.path}: ${e.kind === 'added' ? '' : show(e.a, 300)}${e.kind === 'changed' ? ' -> ' : ''}${e.kind === 'removed' ? '' : show(e.b, 300)}`, { font: mono, size: 8.5 });
  } else if (r.kind === 'csv') {
    for (const row of r.csv.rows) {
      if (row.t === 'eq') continue;
      const cells = row.t === 'mod' ? row.changed.map((c) => `${c}: ${row.a.cells[c]} -> ${row.b.cells[c]}`).join('; ') : Object.values((row.a || row.b).cells).join(', ');
      say(`Line ${row.at} ${{ mod: 'changed', del: 'removed', ins: 'added' }[row.t]}: ${cells}`, { font: mono, size: 8.5 });
    }
  } else {
    const pics = r.kind === 'image' ? [[r.image.urls.diff, 'Difference: changed pixels in red'], [r.image.urls.a, 'A'], [r.image.urls.b, 'B']]
      : r.pdf.visual.filter((p) => p.count && p.url).map((p) => [p.url, `Page ${p.page}: ${p.boxes.length} changed area${p.boxes.length === 1 ? '' : 's'}`]);
    for (const [src, label] of pics) {
      if (!src) continue;
      const img = await doc.embedPng(await (await fetch(src)).arrayBuffer());
      const k = Math.min((W - 2 * M) / img.width, (H - 2 * M - 20) / img.height, 1);
      need(img.height * k + 18);
      say(label, { size: 9, color: C.dim });
      page.drawImage(img, { x: M, y: y - img.height * k, width: img.width * k, height: img.height * k });
      y -= img.height * k + 12;
    }
  }
  return doc.save();
}

/** Text in lines of at most n characters: at spaces, or (hard) exactly every n characters for code. */
function wrap(s, n, hard = false) {
  if (!s.length) return [''];
  if (hard) { const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out; }
  const out = []; let cur = '';
  for (const w of s.split(' ')) { if (cur && (cur + ' ' + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
  if (cur) out.push(cur);
  return out;
}
