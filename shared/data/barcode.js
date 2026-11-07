// GS1 check digits for EAN-8, UPC-A (GTIN-12), EAN-13 and GTIN-14, and random barcode values.
// Random values come from crypto.getRandomValues (rejection sampling, so every symbol is equally likely).
// Pass `rand` (a function returning [0, 1)) to get a repeatable sequence, for tests; see seededRand().
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js

  /** Check digit for `body`, the code without its last digit. Weights 3 and 1 counted from the right. */
  function checkDigit(body) {
    const s = String(body);
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += (s.charCodeAt(i) - 48) * ((s.length - i) % 2 ? 3 : 1);
    return (10 - (sum % 10)) % 10;
  }

  /** Spaces and hyphens removed. Returns '' for empty input. */
  function normalizeEan(code) {
    return code === undefined || code === null ? '' : String(code).replace(/[\s-]/g, '');
  }

  /** True for 8, 12, 13 or 14 digits whose last digit is the GS1 check digit. */
  function isValidEan(code) {
    const s = String(code ?? '');
    if (!/^(?:\d{8}|\d{12,14})$/.test(s)) return false;
    return checkDigit(s.slice(0, -1)) === s.charCodeAt(s.length - 1) - 48;
  }

  /* ---------------- random values ---------------- */
  const ALPHABET = { digits: '0123456789', letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', alnum: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' };
  // Fixed-length GS1 symbologies: total length, and the digits that are random (the rest is the check digit).
  const GS1_TOTAL = { ean13: 13, ean8: 8, upca: 12 };
  const DEFAULT_LEN = { code128: 12, code39: 10, qrcode: 16, datamatrix: 16 };
  const MAX_LEN = { code128: 80, code39: 40, qrcode: 300, datamatrix: 300 };

  /** A uniform integer in [0, n). With `rand` (a [0,1) function) it is that generator; otherwise crypto. */
  function randomIndex(n, rand) {
    if (n < 1) throw new Error('empty alphabet');
    if (rand) return Math.min(n - 1, Math.floor(rand() * n));
    const c = g.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (!c || !c.getRandomValues) throw new Error('crypto.getRandomValues is not available');
    const range = 0x100000000, limit = range - (range % n), buf = new Uint32Array(1);
    for (;;) { c.getRandomValues(buf); if (buf[0] < limit) return buf[0] % n; }
  }
  /** A seeded generator (mulberry32) returning [0,1): the same seed always gives the same values. Tests only. */
  function seededRand(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const digitsOnly = (s) => { if (!/^\d*$/.test(String(s))) throw new Error(say('ui.data.bc.prefix_digits')); return String(s); };

  /**
   * One random value. opts: { symbology ('code128'|'ean13'|'ean8'|'upca'|'code39'|'qrcode'|'datamatrix'),
   * kind ('digits'|'letters'|'alnum', default alnum; EAN and UPC are always digits), length (default per
   * symbology; ignored for EAN and UPC), prefix (fixed start, default ''), rand (optional [0,1) function) }.
   * EAN and UPC values always carry a valid check digit.
   */
  function randomValue(opts = {}) {
    const sym = opts.symbology || 'code128', prefix = String(opts.prefix || ''), rand = opts.rand;
    if (GS1_TOTAL[sym]) {
      const total = GS1_TOTAL[sym], bodyLen = total - 1;
      digitsOnly(prefix);
      if (prefix.length >= bodyLen) throw new Error(say('ui.data.bc.prefix_short', { n: bodyLen }));
      let body = prefix;
      while (body.length < bodyLen) body += ALPHABET.digits[randomIndex(10, rand)];
      return body + checkDigit(body);
    }
    if (!DEFAULT_LEN[sym]) throw new Error(say('ui.data.bc.no_gen', { name: sym }));
    const kind = ALPHABET[opts.kind] ? opts.kind : 'alnum';
    const alphabet = ALPHABET[kind];
    const len = opts.length == null || opts.length === '' ? DEFAULT_LEN[sym] : Math.floor(+opts.length);
    if (!(len >= 1 && len <= MAX_LEN[sym])) throw new Error(say('ui.data.bc.length', { max: String(MAX_LEN[sym]) }));
    if (prefix.length > len) throw new Error(say('ui.data.bc.prefix_long'));
    let out = prefix;
    while (out.length < len) out += alphabet[randomIndex(alphabet.length, rand)];
    return out;
  }
  /**
   * `count` distinct random values (the same options as randomValue). Throws when the alphabet cannot
   * give that many distinct values, rather than looping forever.
   */
  function randomValues(count, opts = {}) {
    const n = Math.floor(+count);
    if (!(n >= 1 && n <= 10000)) throw new Error(say('ui.data.bc.count', { max: 10000 }));
    const seen = new Set(), out = [];
    let misses = 0;
    while (out.length < n) {
      const v = randomValue(opts);
      if (seen.has(v)) { if (++misses > 1000 + n * 20) throw new Error(say('ui.data.bc.distinct')); continue; }
      seen.add(v); out.push(v);
    }
    return out;
  }

  ns.barcode = { checkDigit, normalizeEan, isValidEan, randomValue, randomValues, seededRand, randomIndex };
})(typeof window !== 'undefined' ? window : globalThis);
