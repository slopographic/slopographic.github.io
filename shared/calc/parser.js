/* Slopculator parser: text → syntax tree. Pure, classic script (needs lexer.js, units.js, dates.js first).
 * Exposes window.SlopCalc.parse(text). Precedence, lowest first:
 *   in / to (unit conversion)  ·  + −  ·  × ÷  ·  of (X% of Y)  ·  ^ (right-assoc)  ·  unary − and √ (bind looser than ^)
 *   postfix % binds to the number before it.
 * Juxtaposition makes a quantity: 5 km, 2 h 45 m (h then m is minutes), 90 min, 3 weeks, 12.5 lb, 100 USD, 100 C.
 * Functions: sqrt cbrt abs tax(base, rate) discount(price, rate) markup(cost, rate). Names: pi e ans today. */
(function (g) {
  'use strict';
  const ns = (g.SlopCalc = g.SlopCalc || {});
  /** A word from the shared tables (shared/i18n/ui/<code>/calc.js), the key without SlopI18n. */
  const say = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);
  const { CalcError, lexer, units, dates } = { CalcError: ns.CalcError, lexer: ns.lexer, units: ns.units, dates: ns.dates };
  const own = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

  const BIN = { '+': 10, '-': 10, '*': 20, '/': 20, of: 25, '^': 30 };
  const CAL_WORDS = { day: 'days', days: 'days', week: 'weeks', weeks: 'weeks', month: 'months', months: 'months', year: 'years', years: 'years' };
  const HOUR_WORDS = ['h', 'hr', 'hrs', 'hour', 'hours'];
  const MIN_WORDS = ['min', 'mins', 'minute', 'minutes'];
  const MINUTE_AFTER_HOUR = [...MIN_WORDS, 'm']; // "2h 45m": a bare m only counts right after an hour
  const FUNCS = { sqrt: 1, cbrt: 1, abs: 1, tax: 2, discount: 2, markup: 2 };
  const LOOSE = ['in', 'to', 'of'];

  function parse(text) {
    const toks = lexer.tokenize(text);
    let p = 0;
    const peek = (k = 0) => toks[Math.min(p + k, toks.length - 1)];
    const next = () => toks[p++];
    const word = (t) => (t.type === 'word' ? t.value.toLowerCase() : '');
    const need = (type, what) => { const t = peek(); if (t.type !== type) throw new CalcError(say('ui.calc.expected', { what }), t.pos); return next(); };

    function expr(minPrec) {
      let left = unary();
      for (;;) {
        const t = peek();
        const w = word(t);
        if (w === 'in' || w === 'to') {
          if (minPrec > 1) break;
          next();
          const u = peek();
          if (u.type !== 'word') throw new CalcError(say('ui.calc.unit_after_in'), u.pos, 'syntax');
          const target = units.lookup(u.value);
          if (!target) throw new CalcError(say('ui.calc.unknown_unit', { unit: u.value }), u.pos, 'unit');
          next();
          left = { type: 'conv', x: left, to: target, pos: t.pos };
          continue;
        }
        let op = null;
        if (t.type === 'op' && t.value !== 'sqrt') op = t.value;
        else if (w === 'of') op = 'of';
        if (!op || BIN[op] < minPrec) break;
        next();
        const right = expr(op === '^' ? BIN[op] : BIN[op] + 1);
        left = { type: 'bin', op, a: left, b: right, pos: t.pos };
      }
      return left;
    }

    function unary() {
      const t = peek();
      if (t.type === 'op' && (t.value === '-' || t.value === '+')) {
        next();
        const x = expr(30);
        return t.value === '-' ? { type: 'neg', x, pos: t.pos } : x;
      }
      if (t.type === 'op' && t.value === 'sqrt') {
        next();
        return { type: 'call', fn: 'sqrt', args: [expr(30)], pos: t.pos };
      }
      return primary();
    }

    function postfix(node) {
      if (peek().type !== 'pct') return node;
      const t = next();
      return { type: 'pct', x: node, pos: t.pos };
    }

    function primary() {
      const t = next();
      switch (t.type) {
        case 'num': return numberTail(t);
        case 'lp': {
          const e = expr(0);
          need('rp', ')');
          return postfix(e);
        }
        case 'date':
          if (!dates.parse(t.value)) throw new CalcError(say('ui.calc.bad_date', { text: t.value }), t.pos, 'syntax');
          return { type: 'date', iso: t.value, pos: t.pos };
        case 'time': {
          const [h, m] = t.value.split(':').map(Number);
          if (h > 23 || m > 59) throw new CalcError(say('ui.calc.bad_time', { text: t.value }), t.pos, 'syntax');
          return { type: 'tod', min: h * 60 + m, pos: t.pos };
        }
        case 'word': return wordTerm(t);
        case 'end': throw new CalcError(say('ui.calc.ends_early'), t.pos);
        default: throw new CalcError(say('ui.calc.unexpected', { text: t.value }), t.pos);
      }
    }

    /** A number, with a unit word after it when there is one. */
    function numberTail(t) {
      const n = t.value;
      const w = peek();
      const lw = word(w);
      if (w.type !== 'word' || LOOSE.includes(lw)) return postfix({ type: 'num', v: n, pos: t.pos });
      if (HOUR_WORDS.includes(lw)) {
        next();
        let min = n * 60;
        const num = peek(), unitWord = peek(1);
        if (num.type === 'num' && unitWord.type === 'word' && MINUTE_AFTER_HOUR.includes(word(unitWord))) {
          next(); next();
          min += num.value;
        }
        return { type: 'qty', dim: 'time', unit: 'min', v: min, pos: t.pos };
      }
      if (MIN_WORDS.includes(lw)) { next(); return { type: 'qty', dim: 'time', unit: 'min', v: n, pos: t.pos }; }
      if (own(CAL_WORDS, lw)) { next(); return { type: 'qty', dim: 'calendar', unit: CAL_WORDS[lw], v: n, pos: t.pos }; }
      const u = units.lookup(lw);
      if (u) { next(); return { type: 'qty', dim: u.dim, unit: u.unit, v: n, pos: t.pos }; }
      throw new CalcError(say('ui.calc.unknown_unit', { unit: w.value }), w.pos, 'unit');
    }

    function wordTerm(t) {
      const w = word(t);
      if (peek().type === 'lp' && own(FUNCS, w)) {
        next();
        const args = [];
        if (peek().type !== 'rp') {
          for (;;) {
            args.push(expr(0));
            if (peek().type !== 'comma') break;
            next();
          }
        }
        need('rp', ')');
        if (args.length !== FUNCS[w]) throw new CalcError(say('ui.calc.args', { fn: w, n: FUNCS[w] }), t.pos);
        return { type: 'call', fn: w, args, pos: t.pos };
      }
      if (w === 'today') return { type: 'today', pos: t.pos };
      if (w === 'pi' || w === 'e' || w === 'ans') return { type: 'const', name: w, pos: t.pos };
      return { type: 'var', name: w, raw: t.value, pos: t.pos }; // resolved when evaluated (a variable the page or graph holds)
    }

    if (peek().type === 'end') throw new CalcError(say('ui.calc.empty'), 0);
    const tree = expr(0);
    if (peek().type !== 'end') { const t = peek(); throw new CalcError(say('ui.calc.unexpected', { text: t.value }), t.pos); }
    return tree;
  }

  ns.parse = parse;

  const ASSIGN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/;
  const RESERVED = ['pi', 'e', 'ans', 'today', 'sqrt', 'cbrt', 'abs', 'tax', 'discount', 'markup'];
  /** A statement: `name = expression` gives { name, tree }; a plain expression gives { name: null, tree }. */
  function parseStatement(text) {
    const m = ASSIGN.exec(String(text));
    if (m && !RESERVED.includes(m[1].toLowerCase())) return { name: m[1].toLowerCase(), tree: parse(String(text).slice(m[0].length)) };
    return { name: null, tree: parse(text) };
  }
  ns.parseStatement = parseStatement;
  ns.RESERVED_NAMES = RESERVED;
})(typeof window !== 'undefined' ? window : globalThis);
