/* Slop Docs — io/docx-in: Word (.docx) import on top of shared/office (zip + xml). Reads paragraphs, runs (bold, italic,
 * underline, strike, size, colour, font, super- and subscript), styles by name, lists by numbering format, tables, page
 * size and margins, and the headers and footers (default and first page, w:titlePg) with their PAGE and NUMPAGES fields
 * (simple and complex), and hyperlinks to web and mail addresses (run.link). Not carried yet: images, footnotes, comments and tracked changes. */
import { readZip, readText } from '../../../shared/office/zip.js';
import { parseXml, kids, kid, path as pathOf, attr, NS } from '../../../shared/office/xml.js';
import { twipsToPt, halfPtToPt, ooxmlToHex } from '../../../shared/office/units.js';
import { newDoc, normalizeDoc, para, uid, OBJ, defaultSection } from '../model/doc.js';
import { bulletList, numberList } from '../model/styles.js';

const STYLE_IN = { title: 'Title', subtitle: 'Subtitle', quote: 'Quote', intensequote: 'Quote', code: 'Code' }; // i18n-ignore: Word style id
function styleIn(v) {
  const k = String(v || '').replace(/\s+/g, '').toLowerCase();
  const h = /^heading([1-6])$/.exec(k);
  if (h) return 'H' + h[1];
  return STYLE_IN[k] || 'Normal';
}
const onOff = (el) => { if (!el) return false; const v = attr(el, NS.w, 'val'); return !(v === 'false' || v === '0' || v === 'none'); };
function markIn(rPr) {
  const m = {};
  if (!rPr) return m;
  if (onOff(kid(rPr, NS.w, 'b'))) m.b = true;
  if (onOff(kid(rPr, NS.w, 'i'))) m.i = true;
  if (onOff(kid(rPr, NS.w, 'strike'))) m.s = true;
  const u = kid(rPr, NS.w, 'u'); if (u && attr(u, NS.w, 'val') !== 'none') m.u = true;
  const f = kid(rPr, NS.w, 'rFonts'), fn = f && (attr(f, NS.w, 'ascii') || attr(f, NS.w, 'hAnsi')); if (fn) m.font = fn;
  const sz = kid(rPr, NS.w, 'sz'); if (sz && Number(attr(sz, NS.w, 'val'))) m.size = halfPtToPt(attr(sz, NS.w, 'val'));
  const c = kid(rPr, NS.w, 'color'), hex = c && attr(c, NS.w, 'val'); if (hex && hex !== 'auto' && ooxmlToHex(hex)) m.color = ooxmlToHex(hex);
  const va = kid(rPr, NS.w, 'vertAlign'), v = va && attr(va, NS.w, 'val');
  if (v === 'superscript') m.va = 'sup'; else if (v === 'subscript') m.va = 'sub';
  return m;
}
/** The field a field instruction names: 'page' for PAGE, 'pages' for NUMPAGES and SECTIONPAGES, else null. */
function fieldOf(instr) {
  const k = String(instr || '').trim().split(/\s+/)[0].toUpperCase();
  return k === 'PAGE' ? 'page' : k === 'NUMPAGES' || k === 'SECTIONPAGES' ? 'pages' : null;
}
/** The web or mail address of a w:hyperlink, from the part's relationships (r:id, external targets only), or ''. */
let partLinks = new Map();
function linkOf(el) {
  const t = partLinks.get(attr(el, NS.r, 'id'));
  return t && /^(https?:|mailto:|tel:)/i.test(t) ? t : '';
}
function relsMap(files, partPath) {
  const xml = readText(files, partPath.replace(/([^/]+)$/, '_rels/$1.rels')), out = new Map();
  if (xml) for (const r of kids(parseXml(xml).documentElement, NS.rel, 'Relationship')) out.set(r.getAttribute('Id'), r.getAttribute('Target'));
  return out;
}
/** Runs of a w:p (or a hyperlink in it). Page number and page count fields, simple (w:fldSimple) or complex (w:fldChar
 * begin, w:instrText, separate, the shown result, end), become field objects; other fields keep their shown text. */
function runsIn(pEl) {
  const out = [];
  let fld = null; // a complex field being read: { instr, state: 'instr' | 'result', f }
  const fieldRun = (m, f) => out.push({ ...m, obj: 'field', f, text: OBJ });
  for (const el of kids(pEl, NS.w, '*')) {
    if (el.localName === 'fldSimple') {
      const f = fieldOf(attr(el, NS.w, 'instr')), r0 = kid(el, NS.w, 'r'), m = markIn(r0 && kid(r0, NS.w, 'rPr'));
      if (f) fieldRun(m, f); else out.push(...runsIn(el));
      continue;
    }
    const rs = el.localName === 'hyperlink' ? kids(el, NS.w, 'r') : el.localName === 'r' ? [el] : [];
    const href = el.localName === 'hyperlink' ? linkOf(el) : '';
    for (const r of rs) {
      const m = markIn(kid(r, NS.w, 'rPr'));
      if (href) m.link = href;
      for (const c of kids(r, NS.w, '*')) {
        if (c.localName === 'fldChar') {
          const t = attr(c, NS.w, 'fldCharType');
          if (t === 'begin') fld = { instr: '', state: 'instr', m };
          else if (t === 'separate' && fld) { fld.f = fieldOf(fld.instr); fld.state = 'result'; if (fld.f) fieldRun(fld.m, fld.f); }
          else if (t === 'end') { if (fld && fld.state === 'instr' && fieldOf(fld.instr)) fieldRun(fld.m, fieldOf(fld.instr)); fld = null; }
          continue;
        }
        if (c.localName === 'instrText') { if (fld) fld.instr += c.textContent; continue; }
        if (fld && (fld.state === 'instr' || fld.f)) continue; // the instruction, or a page field's stale shown value
        if (c.localName === 't') { if (c.textContent) out.push({ ...m, text: c.textContent }); }
        else if (c.localName === 'tab') out.push({ ...m, text: '\t' });
        else if (c.localName === 'br' || c.localName === 'cr') {
          if (attr(c, NS.w, 'type') === 'page') out.push({ obj: 'pb', text: OBJ });
          else out.push({ ...m, text: '\n' });
        }
      }
    }
  }
  return out;
}
/** The headers and footers a section references (default and first page), read from their parts. */
function readHF(files, sp, lists, out) {
  const relsXml = readText(files, 'word/_rels/document.xml.rels');
  if (!sp || !relsXml) return;
  const rels = new Map();
  for (const r of kids(parseXml(relsXml).documentElement, NS.rel, 'Relationship')) rels.set(r.getAttribute('Id'), r.getAttribute('Target'));
  for (const [tag, kind] of [['headerReference', 'header'], ['footerReference', 'footer']]) {
    for (const ref of kids(sp, NS.w, tag)) {
      const type = attr(ref, NS.w, 'type') || 'default', target = rels.get(attr(ref, NS.r, 'id'));
      if ((type !== 'default' && type !== 'first') || !target) continue;
      const part = 'word/' + target.replace(/^\/?word\//, '').replace(/^\//, ''), xml = readText(files, part);
      partLinks = relsMap(files, part);
      if (xml) out[kind][type] = blocksIn(parseXml(xml).documentElement, lists).filter((b, i, all) => b.type !== 'p' || b.runs.length || all.length > 1);
    }
  }
  if (onOff(kid(sp, NS.w, 'titlePg'))) out.section.differentFirst = true;
}
function paraIn(pEl, lists) {
  const pPr = kid(pEl, NS.w, 'pPr'), p = para();
  p.runs = runsIn(pEl);
  if (!pPr) return p;
  p.style = styleIn(attr(pathOf(pPr, NS.w, 'pStyle'), NS.w, 'val'));
  const props = {};
  const jc = attr(kid(pPr, NS.w, 'jc'), NS.w, 'val');
  if (jc) props.align = { both: 'justify', center: 'center', right: 'right', end: 'right' }[jc] || 'left';
  const ind = kid(pPr, NS.w, 'ind');
  if (ind) {
    const L = attr(ind, NS.w, 'left') ?? attr(ind, NS.w, 'start'), R = attr(ind, NS.w, 'right') ?? attr(ind, NS.w, 'end');
    if (L != null) props.indL = twipsToPt(L);
    if (R != null) props.indR = twipsToPt(R);
    if (attr(ind, NS.w, 'firstLine') != null) props.indF = twipsToPt(attr(ind, NS.w, 'firstLine'));
    if (attr(ind, NS.w, 'hanging') != null) props.indF = -twipsToPt(attr(ind, NS.w, 'hanging'));
  }
  const sp = kid(pPr, NS.w, 'spacing');
  if (sp) {
    if (attr(sp, NS.w, 'before') != null) props.before = twipsToPt(attr(sp, NS.w, 'before'));
    if (attr(sp, NS.w, 'after') != null) props.after = twipsToPt(attr(sp, NS.w, 'after'));
    const ln = Number(attr(sp, NS.w, 'line')), rule = attr(sp, NS.w, 'lineRule') || 'auto';
    if (ln) { if (rule === 'exact') props.lineExact = twipsToPt(ln); else if (rule === 'atLeast') props.lineAtLeast = twipsToPt(ln); else props.line = ln / 240; }
  }
  const np = kid(pPr, NS.w, 'numPr');
  if (np) {
    const id = attr(kid(np, NS.w, 'numId'), NS.w, 'val');
    if (id && id !== '0') props.list = { id: lists.get(id) || 'bul', lvl: Number(attr(kid(np, NS.w, 'ilvl'), NS.w, 'val') || 0) };
  }
  if (kid(pPr, NS.w, 'keepNext')) props.keepNext = true;
  if (kid(pPr, NS.w, 'keepLines')) props.keepLines = true;
  if (kid(pPr, NS.w, 'pageBreakBefore')) props.pageBreakBefore = true;
  const shd = kid(pPr, NS.w, 'shd'), fill = shd && attr(shd, NS.w, 'fill');
  if (fill && fill !== 'auto' && ooxmlToHex(fill)) props.shade = ooxmlToHex(fill);
  p.props = props;
  p.runs = p.runs.filter((r) => r.text);
  return p;
}
function tableIn(tEl, lists) {
  const grid = kids(kid(tEl, NS.w, 'tblGrid'), NS.w, 'gridCol');
  const cols = grid.length ? grid.map((c) => twipsToPt(attr(c, NS.w, 'w') || 0) || 36) : [468];
  const rows = kids(tEl, NS.w, 'tr').map((tr) => ({
    header: !!kid(kid(tr, NS.w, 'trPr'), NS.w, 'tblHeader'),
    cells: kids(tr, NS.w, 'tc').map((tc) => {
      const tcPr = kid(tc, NS.w, 'tcPr');
      const span = Number(attr(kid(tcPr, NS.w, 'gridSpan'), NS.w, 'val') || 1);
      const vm = kid(tcPr, NS.w, 'vMerge');
      const shd = kid(tcPr, NS.w, 'shd'), fill = shd && attr(shd, NS.w, 'fill');
      const blocks = blocksIn(tc, lists);
      return { blocks: blocks.length ? blocks : [para()], span, vmerge: vm ? (attr(vm, NS.w, 'val') === 'restart' ? 'restart' : 'continue') : undefined, shade: fill && fill !== 'auto' ? ooxmlToHex(fill) : undefined };
    }),
  }));
  const bd = pathOf(tEl, NS.w, 'tblPr', 'tblBorders');
  return { type: 'table', id: uid('t'), cols, rows, border: bd ? { w: 0.5, color: '#000000' } : null, align: 'left' };
}
function blocksIn(el, lists) {
  const out = [];
  for (const c of kids(el, NS.w, '*')) {
    if (c.localName === 'p') out.push(paraIn(c, lists));
    else if (c.localName === 'tbl') out.push(tableIn(c, lists));
  }
  return out;
}
function listKinds(xml) {
  const kinds = new Map();
  if (!xml) return kinds;
  const d = parseXml(xml);
  const abs = new Map();
  for (const a of kids(d.documentElement, NS.w, 'abstractNum')) {
    const lvl = kids(a, NS.w, 'lvl').find((l) => attr(l, NS.w, 'ilvl') === '0') || kid(a, NS.w, 'lvl');
    const fmt = attr(kid(lvl, NS.w, 'numFmt'), NS.w, 'val');
    abs.set(attr(a, NS.w, 'abstractNumId'), fmt === 'bullet' ? 'bul' : 'num');
  }
  for (const n of kids(d.documentElement, NS.w, 'num')) kinds.set(attr(n, NS.w, 'numId'), abs.get(attr(kid(n, NS.w, 'abstractNumId'), NS.w, 'val')) || 'num');
  return kinds;
}

/** DOCX Blob/bytes → document. Throws when the file is not a Word document. */
export async function importDocx(src) {
  const files = await readZip(src);
  const xml = readText(files, 'word/document.xml');
  if (!xml) throw new Error('Not a Word document');
  const d = parseXml(xml), body = kid(d.documentElement, NS.w, 'body');
  const lists = listKinds(readText(files, 'word/numbering.xml'));
  const out = newDoc();
  partLinks = relsMap(files, 'word/document.xml');
  out.blocks = blocksIn(body, lists);
  const sp = kid(body, NS.w, 'sectPr'), sz = pathOf(sp, NS.w, 'pgSz'), mar = pathOf(sp, NS.w, 'pgMar');
  if (sz) {
    const w = twipsToPt(attr(sz, NS.w, 'w')), h = twipsToPt(attr(sz, NS.w, 'h'));
    out.section = { ...defaultSection(), size: { w: Math.min(w, h), h: Math.max(w, h) }, orient: w > h ? 'landscape' : 'portrait' };
  }
  if (mar) {
    const g = (k) => (attr(mar, NS.w, k) != null ? twipsToPt(attr(mar, NS.w, k)) : undefined);
    out.section.margin = { ...out.section.margin, top: g('top') ?? 72, right: g('right') ?? 72, bottom: g('bottom') ?? 72, left: g('left') ?? 72, header: g('header') ?? 36, footer: g('footer') ?? 36 };
  }
  readHF(files, sp, lists, out);
  partLinks = new Map();
  const usesBul = [...lists.values()].includes('bul'), usesNum = [...lists.values()].includes('num');
  if (usesBul) out.lists.bul = bulletList();
  if (usesNum) out.lists.num = numberList();
  return normalizeDoc(out);
}
