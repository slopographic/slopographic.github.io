// Money and tax, integers only. Amounts are minor units (cents); rates are basis points
// (2000 = 20.00%). Rounding is HALF AWAY FROM ZERO: 0.5 -> 1, 2.5 -> 3, -0.5 -> -1.
// Products go through BigInt, so no float error can reach a stored amount.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const MAX_MINOR = 9e12; // largest amount a record may hold (90 billion in major units)
  const ONE = 10000; // 100.00% in basis points
  const digitCache = new Map();

  /** round(a * b / c), ties away from zero. a, b and c must be safe integers; c must be positive. */
  function mulDiv(a, b, c) {
    if (![a, b, c].every(Number.isSafeInteger)) throw new RangeError('money: expected whole numbers');
    if (c <= 0) throw new RangeError('money: divisor must be positive');
    const A = BigInt(a) * BigInt(b);
    const C = BigInt(c);
    const m = A < 0n ? -A : A;
    const q = (2n * m + C) / (2n * C); // floor(m / C + 1/2)
    const r = Number(A < 0n ? -q : q);
    if (!Number.isSafeInteger(r)) throw new RangeError('money: result out of range');
    return r;
  }

  /** Minor-unit digits for a currency code, from Intl (USD 2, JPY 0). */
  function digits(currency) {
    const code = String(currency || 'USD').toUpperCase();
    if (!digitCache.has(code)) {
      let d = 2;
      try { d = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits; } catch (e) { /* unknown code: keep 2 */ }
      digitCache.set(code, d);
    }
    return digitCache.get(code);
  }

  /* ---- Typed numbers in the visitor's language. The one parser for amounts, rates and percentages people type.
   * The marks come from Intl.NumberFormat(lang).formatToParts; lang is SlopI18n's current language unless given.
   * Rules (plainFromTyped), never a silent guess:
   *  1. Ends are trimmed. A leading "-" (or U+2212) is a minus. No "+", currency sign, exponent or bare ".5"/"5.".
   *  2. Decimal mark: the language's own (sv/de/fr ",", en/ja "."), and a plain "." too, except where "." is the
   *     language's group mark (rule 4). At most one decimal mark; its digits are never grouped.
   *  3. Group marks are optional, only the language's own, only in the whole part and only in its pattern: groups of
   *     three ("1 234 567"), in hi 2-2-3 ("12,34,567"). Any space (regular, no-break U+00A0, narrow U+202F, thin
   *     U+2009) counts as a space group mark; ' and U+2019 count the same; Arabic ٬ also takes ",". Anything else
   *     (a mark of another style, a group of two in en) makes the text invalid.
   *  4. Where "." is the group mark (de, es, it, pt-BR, nl, tr, id, vi): text without the decimal comma is grouping when it
   *     fits the pattern exactly ("1.234" and "1.234.567" are whole numbers), else one "." is a decimal point ("12.50").
   *  5. Where "," is the group mark (en, ja, zh, ko, hi…): a comma is only ever grouping. "1,234" is 1234; "1,5" and
   *     "12,50" are invalid (null), never 15 or 1.5.
   *  6. Arabic-Indic and Persian digits read as 0-9.
   * The result is plain text ("-1234.5") for the strict parsers below; callers that read stored data, AI tool arguments
   * or files with a fixed format use those strict parsers directly. */
  const sepCache = new Map();
  const SPACE = '[ \\u00a0\\u202f\\u2009]';
  const esc = (c) => c.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&');
  /** The language of the page: SlopI18n's current language, else English (Node tests, pages without it). */
  const uiLang = () => { try { return (g.SlopI18n && g.SlopI18n.get && g.SlopI18n.get()) || 'en'; } catch (e) { return 'en'; } };
  /** { decimal, group, indian } for a language, from Intl (group '' when it has none). */
  function separators(lang) {
    const key = String(lang || 'en');
    if (!sepCache.has(key)) {
      let parts;
      try { parts = new Intl.NumberFormat(key).formatToParts(1234567.5); } catch (e) { parts = new Intl.NumberFormat('en').formatToParts(1234567.5); }
      const of = (type) => (parts.find((x) => x.type === type) || { value: '' }).value;
      const ints = parts.filter((x) => x.type === 'integer');
      sepCache.set(key, { decimal: of('decimal') || '.', group: of('group'), indian: ints.length > 2 && ints[1].value.length === 2 });
    }
    return sepCache.get(key);
  }
  const reCache = new Map();
  function patterns(lang) {
    const key = String(lang || 'en');
    if (!reCache.has(key)) {
      const { decimal, group, indian } = separators(key);
      const G = !group ? null : /^\s$/.test(group) ? SPACE : /^['\u2019]$/.test(group) ? "['\u2019]" : group === '\u066c' ? '[\u066c,]' : esc(group);
      const whole = G ? (indian ? `\\d+|\\d{1,2}(?:${G}\\d{2})*${G}\\d{3}` : `\\d+|\\d{1,3}(?:${G}\\d{3})+`) : '\\d+';
      const D = group === '.' ? esc(decimal) : `[${esc(decimal)}.]`;
      reCache.set(key, { main: new RegExp(`^(${whole})(?:${D}(\\d+))?$`), dot: group === '.' ? /^(\d+)\.(\d+)$/ : null });
    }
    return reCache.get(key);
  }
  /** Typed text in a language -> plain decimal text ("1 234,50" sv -> "1234.50"), or null when it breaks the rules above. */
  function plainFromTyped(text, lang = uiLang()) {
    let s = String(text ?? '').trim().replace(/[\u0660-\u0669]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[\u06f0-\u06f9]/g, (d) => d.charCodeAt(0) - 0x6f0);
    const neg = /^[-\u2212]/.test(s);
    if (neg) s = s.slice(1);
    const P = patterns(lang);
    const m = P.main.exec(s) || (P.dot && P.dot.exec(s));
    if (!m) return null;
    return (neg ? '-' : '') + m[1].replace(/\D/g, '') + (m[2] ? `.${m[2]}` : '');
  }
  /** Plain decimal text shown the way the language types it: "12.50" -> "12,50" in sv/de (no grouping). For inputs. */
  const typedPlain = (plain, lang = uiLang()) => String(plain ?? '').replace('.', separators(lang).decimal);

  /** Parses decimal text such as "12.5" into minor units (1250). Null when it is not a plain decimal, or when it has
   *  more decimal places than the currency allows (it is never rounded silently). Strict (a dot, no grouping) unless
   *  opts.typed: true (the page's language) or a language code, which reads it by the rules of plainFromTyped. */
  function parseMinor(text, currency = 'USD', opts) {
    const typed = opts && opts.typed;
    const plain = typed ? plainFromTyped(text, typed === true ? uiLang() : typed) : String(text ?? '').trim();
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(plain ?? '');
    if (!m) return null;
    const d = digits(currency);
    const frac = m[3] || '';
    if (frac.length > d) return null;
    const v = Number(BigInt(m[2] + frac.padEnd(d, '0')));
    const n = m[1] && v ? -v : v;
    return Number.isSafeInteger(n) && Math.abs(n) <= MAX_MINOR ? n : null;
  }
  /** An amount typed in the page's language (or lang): parseMinor(text, currency, { typed }). */
  const parseTyped = (text, currency = 'USD', lang = true) => parseMinor(text, currency, { typed: lang });
  /** A percentage as basis points ("7.5" -> 750; "7,5" when typed in sv), 0 to 100 with at most two decimals, else null. */
  function parsePercent(text, opts) {
    const bp = parseMinor(text, 'USD', opts);
    return bp !== null && bp >= 0 && bp <= ONE ? bp : null;
  }

  /** Plain decimal text with the currency's minor digits, no symbol or grouping: 1250 USD -> "12.50", -5 -> "-0.05",
   *  500 JPY -> "500". Exact (string arithmetic); round-trips with parseMinor. For forms and CSV. */
  function plainMinor(minor, currency = 'USD') {
    const d = digits(currency), neg = minor < 0;
    const s = String(Math.abs(minor)).padStart(d + 1, '0');
    return (neg ? '-' : '') + (d ? `${s.slice(0, -d)}.${s.slice(-d)}` : s);
  }
  /** plainMinor for an input the person edits, with the language's decimal mark: 1250 USD -> "12,50" in sv. Parse it back
   *  with parseTyped. */
  const typedMinor = (minor, currency = 'USD', lang = uiLang()) => typedPlain(plainMinor(minor, currency), lang);

  /** Display only, through Intl.NumberFormat with halfExpand rounding (ties away from zero). */
  function formatMinor(minor, currency = 'USD', locale = 'en-US') {
    const code = String(currency || 'USD').toUpperCase();
    const d = digits(code);
    const opts = { style: 'currency', currency: code, minimumFractionDigits: d, maximumFractionDigits: d, roundingMode: 'halfExpand' };
    let nf;
    try { nf = new Intl.NumberFormat(locale || 'en-US', opts); } catch (e) { nf = new Intl.NumberFormat('en-US', opts); }
    return nf.format(Number(minor) / 10 ** d);
  }

  /** Tax on a net amount at a rate in basis points, rounded half away from zero. */
  const taxOn = (net, rateBp) => mulDiv(net, rateBp, ONE);

  /** One line: gross = qty x unit price (exact), net = gross less the discount (basis points, rounded half away),
   *  tax = taxOn(net), total = net + tax. Prices are tax-exclusive. An absent discount is zero. */
  function lineAmounts(line) {
    const gross = mulDiv(line.qty, line.unitPrice, 1);
    const net = line.discount ? mulDiv(gross, 10000 - line.discount, 10000) : gross;
    const tax = taxOn(net, line.taxRate);
    return { net, tax, total: net + tax };
  }

  /** Totals for a list of lines. Tax is rounded per line and then summed; byRate groups net and tax by rate. */
  function documentTotals(lines) {
    let subtotal = 0, tax = 0;
    const rates = new Map();
    for (const l of lines) {
      const a = lineAmounts(l);
      subtotal += a.net;
      tax += a.tax;
      const r = rates.get(l.taxRate) || { rate: l.taxRate, net: 0, tax: 0 };
      r.net += a.net;
      r.tax += a.tax;
      rates.set(l.taxRate, r);
    }
    return { subtotal, tax, total: subtotal + tax, byRate: [...rates.values()].sort((x, y) => x.rate - y.rate) };
  }

  ns.money = { MAX_MINOR, ONE, mulDiv, taxOn, lineAmounts, documentTotals, parseMinor, parseTyped, parsePercent, formatMinor, plainMinor,
    typedMinor, typedPlain, plainFromTyped, separators, uiLang, digits };
})(typeof window !== 'undefined' ? window : globalThis);
