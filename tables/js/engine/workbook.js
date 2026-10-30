/* Slop Tables engine: the workbook (sheets, styles, defined names) and the public editing API. */
import { Sheet } from './sheet.js';
import { Calc } from './calc.js';
import { parse, walk } from './parser.js';
import { print, renameSheetAst, shiftAst } from './printer.js';
import { key, parseRange, quoteSheet, rangeText } from './refs.js';
import { ERR, errFrom, parseNumber } from './values.js';
import { parseDateTime } from './datetime.js';
import { FN } from '../fn/registry.js';

export class Workbook {
  constructor(opts = {}) {
    this.sheets = []; this.names = new Map();
    this.styles = [{}]; this.styleIds = new Map([['{}', 0]]);
    this.locale = opts.locale || { decimal: '.', group: ',', dateOrder: 'mdy', lang: 'en-US', currency: '$' };
    this.calc = new Calc(this);
    this.props = { title: '', author: '' };
    this.auto = true; this.active = 0;
    if (opts.sheets !== 0) this.addSheet();
  }
  /* ---------- sheets ---------- */
  /** The default name of a new sheet n, "Sheet1". The app sets the chosen language's (tables/js/ui/storage.js). */
  static defaultSheetName(n) { return 'Sheet' + n; }
  addSheet(name, index = this.sheets.length) {
    if (!name) { let i = this.sheets.length + 1; while (this.sheetByName(Workbook.defaultSheetName(i))) i++; name = Workbook.defaultSheetName(i); }
    if (this.sheetByName(name)) throw new Error('A sheet named "' + name + '" already exists');
    const sh = new Sheet(this, name);
    this.sheets.splice(index, 0, sh);
    this.calc.dirtyAll(); // #REF! to this name may resolve now
    return sh;
  }
  sheetByName(n) { const l = String(n).toLowerCase(); return this.sheets.find((s) => s.name.toLowerCase() === l) || null; }
  sheetById(id) { for (const s of this.sheets) if (s.id === id) return s; return null; }
  sheet(i) { return typeof i === 'string' ? this.sheetByName(i) : this.sheets[i]; }
  renameSheet(sh, name) {
    name = String(name).trim();
    if (!name || /[\\/?*[\]:]/.test(name) || name.length > 31) throw new Error('Invalid sheet name');
    const other = this.sheetByName(name);
    if (other && other !== sh) throw new Error('A sheet named "' + name + '" already exists');
    const old = sh.name;
    sh.name = name;
    this.eachFormula((s, k, cell) => { if (cell.ast) { cell.ast = renameSheetAst(cell.ast, old, name); cell.f = print(cell.ast); } });
    for (const d of this.names.values()) if (d.ast) { d.ast = renameSheetAst(d.ast, old, name); d.ref = print(d.ast); }
  }
  removeSheet(sh) {
    if (this.sheets.length < 2) throw new Error('A workbook needs at least one sheet');
    this.sheets.splice(this.sheets.indexOf(sh), 1);
    for (const [k, d] of this.names) if (d.scope === sh.id) this.names.delete(k);
    this.calc.dirtyAll(); this.recalc();
  }
  moveSheet(from, to) { const [s] = this.sheets.splice(from, 1); this.sheets.splice(to, 0, s); }
  eachFormula(fn) { for (const s of this.sheets) for (const [k, cell] of s.cells) if (cell.f) fn(s, k, cell); }
  limits() {
    let r = 0, c = 0;
    for (const s of this.sheets) { if (s.maxR > r) r = s.maxR; if (s.maxC > c) c = s.maxC; }
    return { r, c };
  }
  /* ---------- styles ---------- */
  styleId(obj) {
    const clean = {};
    for (const k of Object.keys(obj).sort()) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '' && obj[k] !== false) clean[k] = obj[k];
    const j = JSON.stringify(clean);
    let id = this.styleIds.get(j);
    if (id === undefined) { id = this.styles.length; this.styles.push(clean); this.styleIds.set(j, id); }
    return id;
  }
  style(id) { return this.styles[id || 0] || this.styles[0]; }
  patchStyle(id, patch) { return this.styleId({ ...this.style(id), ...patch }); }
  /* ---------- names ---------- */
  defineName(name, ref, scope = null) {
    if (!/^[A-Za-z_\\][\w.]*$/.test(name) || parseRange(name) || /^(TRUE|FALSE)$/i.test(name)) throw new Error('Invalid name');
    const ast = parse(String(ref).replace(/^=/, ''));
    this.names.set((scope ? scope.id + '!' : '') + name.toUpperCase(), { name, ref: print(ast), ast, scope: scope ? scope.id : null });
    this.calc.dirtyAll(); this.recalc();
  }
  deleteName(name, scope = null) { this.names.delete((scope ? scope.id + '!' : '') + name.toUpperCase()); this.calc.dirtyAll(); this.recalc(); }
  nameDef(u, sheet) { return (sheet && this.names.get(sheet.id + '!' + u)) || this.names.get(u) || null; }
  /* ---------- cells ---------- */
  /** Type text into a cell like a user: formulas, numbers, %, currency, dates, booleans, errors, 'text. */
  input(sh, r, c, text) {
    const p = parseInput(String(text ?? ''), this.locale);
    if (p.f !== undefined) return this.setFormula(sh, r, c, p.f);
    this.setValue(sh, r, c, p.v);
    if (p.nf) { const cell = sh.ensure(r, c); if (!this.style(cell.s).nf) cell.s = this.patchStyle(cell.s, { nf: p.nf }); }
  }
  setValue(sh, r, c, v) {
    const cell = sh.ensure(r, c);
    if (cell.f) { delete cell.f; delete cell.ast; delete cell.fh; delete cell.vol; delete cell.dirty; this.calc.formulaRemoved(sh, r, c); }
    cell.v = v === undefined ? null : v;
    this.calc.changed(sh, r, c);
    if (sh.spillOwner.has(key(r, c))) this.calc.changed(sh, r, c);
    sh.prune(r, c);
    if (this.auto) this.recalc();
  }
  /** Set a formula (text with or without "="). Throws FormulaError on a syntax error unless lenient. */
  setFormula(sh, r, c, text, opts = {}) {
    let ast = null;
    text = String(text).replace(/^=/, '');
    try { ast = parse(text, opts.r1c1 ? { r1c1: true, base: { r, c } } : undefined); }
    catch (e) { if (!opts.lenient) throw e; }
    const cell = sh.ensure(r, c);
    if (cell.f) this.calc.formulaRemoved(sh, r, c);
    cell.f = ast ? print(ast) : text; cell.ast = ast; cell.v = ast ? null : ERR.NAME;
    if (opts.cached !== undefined) cell.v = opts.cached;
    cell.vol = false;
    if (ast) walk(ast, (n) => { if (n.t === 'fn' && FN[n.name] && FN[n.name].vol) cell.vol = true; });
    this.calc.formulaSet(sh, r, c, cell);
    if (this.auto) this.recalc();
    return cell;
  }
  clear(sh, r1, c1, r2 = r1, c2 = c1, what = 'contents') {
    const auto = this.auto; this.auto = false;
    const keys = [];
    sh.eachIn(r1, c1, r2, c2, (r, c) => keys.push([r, c]));
    for (const [r, c] of keys) {
      const cell = sh.get(r, c);
      if (what !== 'formats') { if (cell.f || cell.v !== null) this.setValue(sh, r, c, null); }
      if (what !== 'contents') { const cl = sh.get(r, c); if (cl) { delete cl.s; sh.prune(r, c); } }
    }
    this.auto = auto;
    if (auto) this.recalc();
  }
  /** Run fn with recalculation deferred to the end. */
  batch(fn) { const a = this.auto; this.auto = false; try { return fn(); } finally { this.auto = a; if (a) this.recalc(); } }
  recalc() { return this.calc.recalc(); }
  recalcAll() { this.calc.dirtyAll(); return this.calc.recalc(); }
  value(sh, r, c) { return sh.value(r, c); }
  /** Formula text of a cell copied by (dr, dc) cells. */
  shiftFormula(f, dr, dc) { return print(shiftAst(parse(f), dr, dc)); }
  refText(sh, r1, c1, r2, c2, withSheet) { return (withSheet ? quoteSheet(sh.name) + '!' : '') + rangeText(r1, c1, r2, c2); }
}

/** Interpret typed text. Returns {f} for formulas or {v, nf?}. */
export function parseInput(text, loc = {}) {
  if (text === '') return { v: null };
  if (text[0] === "'") return { v: text.slice(1) };
  if (text[0] === '=' && text.length > 1) return { f: text.slice(1) };
  const t = text.trim();
  if (/^(TRUE|FALSE)$/i.test(t)) return { v: t.toUpperCase() === 'TRUE' };
  const e = t[0] === '#' ? errFrom(t) : null;
  if (e) return { v: e };
  const n = parseNumber(t, loc);
  if (n !== null) {
    let nf;
    const dp = (/[.,](\d+)/.exec(t.replace(/[^\d.,]/g, '')) || [, ''])[1];
    if (/%\s*$/.test(t)) nf = /\.\d/.test(t) ? '0.00%' : '0%';
    else if (/[$€£¥]/.test(t)) { const sym = /[$€£¥]/.exec(t)[0]; nf = (/^[^\d]*[$€£¥]/.test(t) ? '"' + sym + '"#,##0' : '#,##0') + (dp && dp.length !== 3 || /\.\d/.test(t) ? '.00' : '') + (/^[^\d]*[$€£¥]/.test(t) ? '' : '"' + sym + '"'); }
    else if (/^\d{1,3}(,\d{3})+/.test(t.replace(/^[-+(]/, ''))) nf = /\.\d/.test(t) ? '#,##0.00' : '#,##0';
    else if (/e/i.test(t)) nf = '0.00E+00';
    return nf ? { v: n, nf } : { v: n };
  }
  const d = parseDateTime(t, loc.dateOrder || 'mdy');
  if (d) return { v: d.v, nf: d.fmt };
  return { v: text };
}
