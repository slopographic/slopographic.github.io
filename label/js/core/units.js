/* SlopLabel — core/units: unit conversion (everything is stored in mm) and small helpers. */
'use strict';

/** Words a person reads (label/i18n, shared/i18n/APPS-HOWTO.md): LT(key, vars), the key itself without SlopI18n (Node tests).
 *  LW(kind, id, en): a built-in name (a stock, a preset, an object type) in the chosen language, label.def.<kind>.<id>, else en.
 *  onLabelLang(fn): fn after a language change, once the new tables are in. */
const LT = (key, vars) => (typeof window !== 'undefined' && window.SlopI18n ? window.SlopI18n.t(key, vars) : key);
const LW = (kind, id, en) => { const I = typeof window !== 'undefined' && window.SlopI18n, k = 'label.def.' + kind + '.' + String(id).replace(/[^a-z0-9]+/gi, '_').toLowerCase(); return I && I.has(k) ? I.t(k) : en; };
const onLabelLang = (fn) => { if (typeof window !== 'undefined' && window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(fn); };

const MM_PER_IN = 25.4;
const PT_PER_MM = 72 / 25.4;
const UNITS = { mm: 'mm', in: 'inch', dots: 'dots' };

/* ---------------- units ---------------- */
function toMM(v, unit, dpi) {
  v = +v;
  if (unit === 'in') return v * MM_PER_IN;
  if (unit === 'dots') return (v * MM_PER_IN) / (dpi || 203);
  if (unit === 'pt') return v / PT_PER_MM;
  return v;
}
function fromMM(mm, unit, dpi) {
  if (unit === 'in') return mm / MM_PER_IN;
  if (unit === 'dots') return (mm * (dpi || 203)) / MM_PER_IN;
  if (unit === 'pt') return mm * PT_PER_MM;
  return mm;
}
/** mm → whole printer dots (what ZPL/EPL/TSPL take). */
function mmToDots(mm, dpi) { return Math.round((mm * dpi) / MM_PER_IN); }
function dotsToMM(d, dpi) { return (d * MM_PER_IN) / dpi; }
function unitDigits(unit) { return unit === 'in' ? 3 : unit === 'dots' ? 0 : 2; }
/** Trim a number to n decimals without trailing zeros: 12.50 → "12.5". */
function num(v, n = 3) { const s = (+v).toFixed(n); return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; }
function fmtLen(mm, unit, dpi, withUnit = true) {
  const v = fromMM(mm, unit, dpi);
  const s = num(v, unitDigits(unit));
  return withUnit ? s + (unit === 'in' ? '"' : ' ' + (unit === 'dots' ? 'dots' : unit)) : s;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;
let uidSeq = 0;
function uid(p = 'o') { return p + Date.now().toString(36).slice(-4) + (++uidSeq).toString(36) + Math.random().toString(36).slice(2, 5); }
const deepClone = (o) => JSON.parse(JSON.stringify(o));
function escHTML(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
