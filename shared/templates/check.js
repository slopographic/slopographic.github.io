/* Slop templates — check: validates a document against the Docs schema (docs/js/model/doc.js, the .sdoc JSON).
 *   checkDoc(doc) → [] when valid, or a list of problems ("blocks[2].runs[0].size: 120 is not 6..96").
 * It uses the Docs model's own constants (page sizes, style names, font families), so it follows the real schema. */
import { PAGE } from '../../docs/js/model/doc.js';
import { STYLE_ORDER } from '../../docs/js/model/styles.js';
import { FAMILIES } from '../../docs/js/fonts/registry.js';

const OBJ = '￼';
const FONTS = new Set(FAMILIES.map((f) => f.name));
const PROPS = new Set(['align', 'indL', 'indR', 'indF', 'before', 'after', 'line', 'lineExact', 'lineAtLeast', 'keepNext', 'keepLines', 'pageBreakBefore', 'widow', 'list', 'tabs', 'shade', 'borderBottom', 'borderTop', 'borderLeft', 'borderRight']);
const MARKS = new Set(['font', 'size', 'b', 'i', 'u', 's', 'color', 'hl', 'va', 'link', 'cm', 'dy', 'm']);
const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (x) => typeof x === 'number' && Number.isFinite(x);

/** Collects problems with their path. */
function ctx() {
  const errs = [], ids = new Set();
  return {
    errs,
    fail: (path, msg) => errs.push(`${path}: ${msg}`),
    id: (path, id) => { if (typeof id !== 'string' || !id) errs.push(`${path}.id: missing`); else if (ids.has(id)) errs.push(`${path}.id: "${id}" is used twice`); else ids.add(id); },
  };
}
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

function checkBorder(c, path, b) {
  if (b === undefined || b === null) return;
  if (!isObj(b) || !num(b.w) || b.w <= 0) return c.fail(path, 'border needs a positive w');
  if (b.color !== undefined && !HEX.test(b.color)) c.fail(path + '.color', `"${b.color}" is not #rrggbb`);
}
function checkProps(c, path, p, lists) {
  if (!isObj(p)) return c.fail(path, 'props must be an object');
  for (const k of Object.keys(p)) if (!PROPS.has(k)) c.fail(path + '.' + k, 'unknown paragraph property');
  if (p.align !== undefined && !['left', 'center', 'right', 'justify'].includes(p.align)) c.fail(path + '.align', `"${p.align}" is not an alignment`);
  if (p.shade !== undefined && !HEX.test(p.shade)) c.fail(path + '.shade', `"${p.shade}" is not #rrggbb`);
  for (const k of ['borderBottom', 'borderTop', 'borderLeft', 'borderRight']) checkBorder(c, path + '.' + k, p[k]);
  if (p.list !== undefined && (!isObj(p.list) || !lists[p.list.id])) c.fail(path + '.list', `list "${p.list && p.list.id}" is not defined in lists`);
  for (const k of ['indL', 'indR', 'indF', 'before', 'after']) if (p[k] !== undefined && !num(p[k])) c.fail(path + '.' + k, 'must be a number');
  if (p.tabs !== undefined && (!Array.isArray(p.tabs) || p.tabs.some((t) => !isObj(t) || !num(t.pos)))) c.fail(path + '.tabs', 'each tab needs a numeric pos');
}
function checkMarks(c, path, r) {
  for (const k of Object.keys(r)) if (!MARKS.has(k) && !['text', 'obj', 'f'].includes(k)) c.fail(path + '.' + k, 'unknown run mark');
  if (r.font !== undefined && !FONTS.has(r.font)) c.fail(path + '.font', `"${r.font}" is not a font family`);
  if (r.size !== undefined && !(num(r.size) && r.size >= 6 && r.size <= 96)) c.fail(path + '.size', `${r.size} is not 6..96`);
  for (const k of ['b', 'i', 'u', 's']) if (r[k] !== undefined && typeof r[k] !== 'boolean') c.fail(path + '.' + k, 'must be a boolean');
  for (const k of ['color', 'hl']) if (r[k] !== undefined && !HEX.test(r[k])) c.fail(path + '.' + k, `"${r[k]}" is not #rrggbb`);
  if (r.va !== undefined && !['sup', 'sub'].includes(r.va)) c.fail(path + '.va', 'must be sup or sub');
}
function checkRun(c, path, r) {
  if (!isObj(r) || typeof r.text !== 'string') return c.fail(path, 'run needs text');
  if (!r.text.length) c.fail(path + '.text', 'empty runs are not allowed');
  if (r.obj !== undefined) {
    if (!['img', 'field', 'fn', 'pb'].includes(r.obj)) c.fail(path + '.obj', `"${r.obj}" is not an object type`);
    if (r.text !== OBJ && r.obj !== 'pb') c.fail(path + '.text', 'object runs must hold U+FFFC');
    if (r.obj === 'field' && !['page', 'pages'].includes(r.f)) c.fail(path + '.f', 'field must be page or pages');
  }
  checkMarks(c, path, r);
}
function checkCells(c, path, rows, cols, lists, depth) {
  if (!Array.isArray(rows) || !rows.length) return c.fail(path, 'rows must be a non-empty array');
  rows.forEach((row, ri) => {
    const rp = `${path}.rows[${ri}]`;
    if (!isObj(row) || !Array.isArray(row.cells)) return c.fail(rp, 'row needs cells');
    let span = 0;
    row.cells.forEach((cell, ci) => {
      const cp = `${rp}.cells[${ci}]`;
      if (!isObj(cell) || !Array.isArray(cell.blocks) || !cell.blocks.length) return c.fail(cp, 'cell needs blocks');
      if (!Number.isInteger(cell.span || 1) || (cell.span || 1) < 1) c.fail(cp + '.span', 'span must be a positive integer');
      if (cell.shade !== undefined && !HEX.test(cell.shade)) c.fail(cp + '.shade', `"${cell.shade}" is not #rrggbb`);
      span += cell.span || 1;
      checkBlocks(c, cp + '.blocks', cell.blocks, lists, depth + 1);
    });
    if (span !== cols.length) c.fail(rp, `cells span ${span} columns, table has ${cols.length}`);
  });
}
function checkTable(c, path, b, lists, depth) {
  c.id(path, b.id);
  if (!Array.isArray(b.cols) || !b.cols.length || b.cols.some((x) => !num(x) || x <= 0)) c.fail(path + '.cols', 'needs positive widths');
  if (b.border !== null && b.border !== undefined) checkBorder(c, path + '.border', b.border);
  if (b.align !== undefined && !['left', 'center'].includes(b.align)) c.fail(path + '.align', 'must be left or center');
  checkCells(c, path, b.rows, b.cols || [], lists, depth);
}
function checkBlocks(c, path, list, lists, depth = 0) {
  if (!Array.isArray(list)) return c.fail(path, 'must be an array of blocks');
  if (depth > 6) return c.fail(path, 'nested too deeply');
  list.forEach((b, i) => {
    const bp = `${path}[${i}]`;
    if (!isObj(b)) return c.fail(bp, 'block must be an object');
    if (b.type === 'p') {
      c.id(bp, b.id);
      if (!STYLE_ORDER.includes(b.style)) c.fail(bp + '.style', `"${b.style}" is not a style`);
      checkProps(c, bp + '.props', b.props || {}, lists);
      if (!Array.isArray(b.runs)) return c.fail(bp + '.runs', 'must be an array');
      b.runs.forEach((r, ri) => checkRun(c, `${bp}.runs[${ri}]`, r));
    } else if (b.type === 'table') checkTable(c, bp, b, lists, depth);
    else if (b.type === 'toc') c.id(bp, b.id);
    else c.fail(bp + '.type', `"${b.type}" is not a block type`);
  });
}
function checkStyles(c, styles) {
  for (const name of Object.keys(styles)) {
    if (!STYLE_ORDER.includes(name)) { c.fail('styles.' + name, 'unknown style'); continue; }
    const s = styles[name];
    if (!isObj(s)) { c.fail('styles.' + name, 'must be an object'); continue; }
    if (s.p) checkProps(c, `styles.${name}.p`, s.p, {});
    if (s.r) checkMarks(c, `styles.${name}.r`, s.r);
  }
}
function checkLists(c, lists) {
  for (const id of Object.keys(lists)) {
    const d = lists[id];
    if (!isObj(d) || !['bullet', 'number'].includes(d.kind) || !Array.isArray(d.levels) || !d.levels.length) { c.fail('lists.' + id, 'needs kind and levels'); continue; }
    d.levels.forEach((L, i) => { if (!isObj(L) || typeof L.fmt !== 'string' || typeof L.text !== 'string' || !num(L.indent) || !num(L.hanging)) c.fail(`lists.${id}.levels[${i}]`, 'needs fmt, text, indent and hanging'); });
  }
}
function checkSection(c, s) {
  if (!isObj(s)) return c.fail('section', 'must be an object');
  if (!(typeof s.size === 'string' ? PAGE[s.size] : isObj(s.size) && num(s.size.w) && num(s.size.h))) c.fail('section.size', `"${s.size}" is not a page size`);
  if (!['portrait', 'landscape'].includes(s.orient)) c.fail('section.orient', 'must be portrait or landscape');
  if (!isObj(s.margin)) return c.fail('section.margin', 'missing');
  for (const k of ['top', 'right', 'bottom', 'left', 'header', 'footer']) if (!num(s.margin[k]) || s.margin[k] < 0) c.fail('section.margin.' + k, 'must be a number of points');
  if (typeof s.differentFirst !== 'boolean') c.fail('section.differentFirst', 'must be a boolean');
  if (!Number.isInteger(s.pageStart) || s.pageStart < 1) c.fail('section.pageStart', 'must be a whole number from 1');
}

/** Problems with a document, as a list of strings. An empty list means the document is valid. */
export function checkDoc(doc) {
  const c = ctx();
  if (!isObj(doc)) return ['document must be an object'];
  if (doc.v !== 1) c.fail('v', 'must be 1');
  if (!isObj(doc.meta)) c.fail('meta', 'must be an object');
  checkSection(c, doc.section);
  if (!isObj(doc.styles)) c.fail('styles', 'must be an object'); else checkStyles(c, doc.styles);
  if (!isObj(doc.lists)) c.fail('lists', 'must be an object'); else checkLists(c, doc.lists);
  for (const k of ['media', 'footnotes', 'comments']) if (!isObj(doc[k])) c.fail(k, 'must be an object');
  for (const part of ['header', 'footer']) {
    if (!isObj(doc[part])) { c.fail(part, 'must be { default, first }'); continue; }
    checkBlocks(c, `${part}.default`, doc[part].default, doc.lists || {});
    checkBlocks(c, `${part}.first`, doc[part].first, doc.lists || {});
  }
  checkBlocks(c, 'blocks', doc.blocks, doc.lists || {});
  if (Array.isArray(doc.blocks) && doc.blocks.length && doc.blocks[doc.blocks.length - 1].type !== 'p') c.fail('blocks', 'the last block must be a paragraph');
  return c.errs;
}
