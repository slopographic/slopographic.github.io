/* SlopLabel — vars/vars: variables (prompt, counter, date/time, formula, fixed, data fields),
 * date formatting with offsets, {Name|filter} interpolation and per-label evaluation. */
'use strict';

const VAR_TYPES = { prompt: 'User prompt', counter: 'Counter / serial', date: 'Date / time', formula: 'Formula', fixed: 'Fixed value' };
const VAR_DEFAULTS = {
  prompt: { prompt: 'Enter a value', def: '', required: false, pattern: '', maxLen: 0 },
  counter: { start: 1, step: 1, pad: 6, prefix: '', suffix: '', every: 1, remember: false },
  date: { format: 'YYYY-MM-DD', days: 0, months: 0, years: 0, hours: 0, fixed: '' },
  formula: { expr: '{SKU}-{Batch}' },
  fixed: { value: '' },
};
function makeVar(type, name, props = {}) { return Object.assign({ id: uid('v'), name, type }, deepClone(VAR_DEFAULTS[type] || {}), props); }
const VAR_NAME_RE = /^[A-Za-z_][\w .-]{0,40}$/;

/* ---------------- dates ---------------- */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad2 = (n) => String(n).padStart(2, '0');
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
function dayOfYear(d) { return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1; }
/** Format tokens: YYYY YY MMMM MMM MM M DDD (day of year) DD D dddd ddd HH H hh h mm ss A WW; [literal]. */
function formatDate(d, fmt) {
  const T = {
    YYYY: () => String(d.getFullYear()), YY: () => String(d.getFullYear()).slice(-2),
    MMMM: () => MONTHS[d.getMonth()], MMM: () => MONTHS[d.getMonth()].slice(0, 3), MM: () => pad2(d.getMonth() + 1), M: () => String(d.getMonth() + 1),
    DDD: () => String(dayOfYear(d)).padStart(3, '0'), DD: () => pad2(d.getDate()), D: () => String(d.getDate()),
    dddd: () => DAYS[d.getDay()], ddd: () => DAYS[d.getDay()].slice(0, 3),
    HH: () => pad2(d.getHours()), H: () => String(d.getHours()), hh: () => pad2(d.getHours() % 12 || 12), h: () => String(d.getHours() % 12 || 12),
    mm: () => pad2(d.getMinutes()), ss: () => pad2(d.getSeconds()), A: () => (d.getHours() < 12 ? 'AM' : 'PM'), WW: () => pad2(isoWeek(d)),
  };
  return String(fmt).replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DDD|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|WW/g, (m, lit) => (lit != null ? lit : T[m]()));
}
function offsetDate(base, v) {
  const d = new Date(base.getTime());
  if (+v.years) d.setFullYear(d.getFullYear() + +v.years);
  if (+v.months) { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + +v.months); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  if (+v.days) d.setDate(d.getDate() + +v.days);
  if (+v.hours) d.setHours(d.getHours() + +v.hours);
  return d;
}
function parseDateLoose(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
}

/* ---------------- counters ---------------- */
function counterValue(v, index) {
  const every = Math.max(1, +v.every || 1);
  const n = (+v.start || 0) + (+v.step || 1) * Math.floor(index / every);
  const neg = n < 0, body = String(Math.abs(n)).padStart(Math.max(0, +v.pad || 0), '0');
  return (v.prefix || '') + (neg ? '-' : '') + body + (v.suffix || '');
}

/* ---------------- filters ---------------- */
const FILTERS = {
  upper: (s) => s.toUpperCase(), lower: (s) => s.toLowerCase(), trim: (s) => s.trim(),
  left: (s, n) => s.slice(0, +n), right: (s, n) => (+n ? s.slice(-n) : ''), mid: (s, a, n) => s.substr(+a, n == null ? undefined : +n),
  pad: (s, n, c = '0') => s.padStart(+n, c), padr: (s, n, c = ' ') => s.padEnd(+n, c),
  fixed: (s, n) => (isFinite(parseFloat(s)) ? parseFloat(s).toFixed(+n || 0) : s),
  add: (s, n) => numOr(s, (x) => x + +n), sub: (s, n) => numOr(s, (x) => x - +n), mul: (s, n) => numOr(s, (x) => x * +n), div: (s, n) => numOr(s, (x) => x / +n),
  replace: (s, a, b = '') => s.split(a).join(b), default: (s, d) => (s === '' ? d : s),
  gs1check: (s) => (/^\d+$/.test(s) ? s + gs1Check(s) : s), digits: (s) => s.replace(/\D/g, ''),
  date: (s, fmt) => { const d = parseDateLoose(s); return d ? formatDate(d, fmt || 'YYYY-MM-DD') : s; },
};
function numOr(s, f) { const x = parseFloat(s); if (!isFinite(x)) return s; const r = f(x); return String(Math.round(r * 1e9) / 1e9); }

/** Replace {Name} / {Name|filter:arg|…} using get(name) → string|undefined. {{ and }} are literal braces.
 *  Unknown names stay as {Name} so the designer shows what is missing. */
function interpolate(tpl, get) {
  return String(tpl == null ? '' : tpl).replace(/\{\{|\}\}|\{([^{}]+)\}/g, (m, inner) => {
    if (m === '{{') return '{'; if (m === '}}') return '}';
    const parts = inner.split('|'), name = parts[0].trim();
    let v = get(name);
    if (v === undefined) return m;
    v = String(v);
    for (const f of parts.slice(1)) {
      const [fn, ...args] = f.split(':');
      const F = FILTERS[fn.trim()];
      if (F) v = String(F(v, ...args));
    }
    return v;
  });
}
function varRefs(tpl) { const out = []; String(tpl || '').replace(/\{\{|\}\}|\{([^{}|]+)[^{}]*\}/g, (m, n) => { if (n) out.push(n.trim()); return m; }); return out; }

/* ---------------- data records ---------------- */
function recordCount(doc) { return doc.data && doc.data.rows ? doc.data.rows.length : 0; }
/** A data row as {variableName: value}, following the column → variable mapping. */
function recordAt(doc, i) {
  const D = doc.data; if (!D || !D.rows || !D.rows[i]) return {};
  const rec = {}, row = D.rows[i];
  D.columns.forEach((c, k) => { const name = (D.map && D.map[c]) || c; if (name !== '-') rec[name] = row[k] == null ? '' : String(row[k]); });
  return rec;
}
function dataFieldNames(doc) { const D = doc.data; return D ? D.columns.map((c) => (D.map && D.map[c]) || c).filter((n) => n !== '-') : []; }

/** Build a resolver for one label. ctx: { record, index, now, prompts }.
 *  Data fields win over prompts of the same name (so a CSV column can feed a prompt variable). */
function makeResolver(doc, ctx = {}) {
  const byName = new Map(doc.vars.map((v) => [v.name, v]));
  const rec = ctx.record || {}, prompts = ctx.prompts || {}, now = ctx.now || new Date(), index = ctx.index || 0;
  const memo = new Map(), busy = new Set();
  function get(name) {
    if (memo.has(name)) return memo.get(name);
    let val;
    if (Object.prototype.hasOwnProperty.call(rec, name)) val = rec[name];
    else {
      const v = byName.get(name);
      if (!v) {
        const sys = { LABEL_NO: String(index + 1), RECORD_NO: String((ctx.recordIndex || 0) + 1), TODAY: formatDate(now, 'YYYY-MM-DD'), NOW: formatDate(now, 'YYYY-MM-DD HH:mm') };
        return sys[name];
      }
      if (busy.has(name)) return '#CYCLE';
      busy.add(name);
      switch (v.type) {
        case 'prompt': val = prompts[name] != null ? String(prompts[name]) : (v.def || ''); break;
        case 'counter': val = counterValue(v, index + (ctx.counterBase && ctx.counterBase[name] || 0)); break;
        case 'date': { const base = v.fixed ? parseDateLoose(v.fixed) || now : now; val = formatDate(offsetDate(base, v), v.format || 'YYYY-MM-DD'); break; }
        case 'formula': val = interpolate(v.expr, get); break;
        case 'fixed': val = v.value == null ? '' : String(v.value); break;
        default: val = '';
      }
      busy.delete(name);
    }
    memo.set(name, val);
    return val;
  }
  return get;
}
function evalVars(doc, ctx) { const get = makeResolver(doc, ctx), out = {}; for (const v of doc.vars) out[v.name] = get(v.name); for (const n of dataFieldNames(doc)) out[n] = get(n); return out; }
function resolveText(tpl, get) { return interpolate(tpl, get); }
/** Validate prompt answers. Returns an array of messages. */
function checkPrompts(doc, prompts) {
  const errs = [];
  for (const v of doc.vars) {
    if (v.type !== 'prompt') continue;
    const s = prompts[v.name] != null ? String(prompts[v.name]) : v.def || '';
    if (v.required && !s) errs.push(`${v.name} is required`);
    if (v.maxLen && s.length > v.maxLen) errs.push(`${v.name}: at most ${v.maxLen} characters`);
    if (v.pattern && s) { try { if (!new RegExp('^(?:' + v.pattern + ')$').test(s)) errs.push(`${v.name} does not match ${v.pattern}`); } catch (e) { /* bad pattern: ignore */ } }
  }
  return errs;
}
