/* Slop Code, Formatted view: SQL. Clause keywords start a new line, select lists, SET lists and VALUES rows get one item
 * per line, and a subquery in parentheses is indented. Words keep their case, and strings, quoted identifiers and
 * comments are copied as written. Spacing between tokens follows the source (a space stays one space, no space stays
 * none), so operators and dotted names are never touched. */
import { pad } from './fv-util.js';

const WORD = /[\p{L}\p{N}_$#@]+/uy;
const WORD_CHAR = /[\p{L}\p{N}_$#@]/u;
const DOLLAR = /\$(?:[A-Za-z_]\w*)?\$/y;
const JOIN_WORDS = new Set(['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'OUTER']);
const PLAIN = new Set(['FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'RETURNING']);
const STARTS = new Set(['INSERT', 'REPLACE', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE']);
const SUB_START = new Set(['SELECT', 'WITH', 'VALUES']);
const ITEM_LEVEL = { select: 1, set: 1, values: 1, with: 0, defs: 0 };   // where the items of a comma list start, from the frame's base

/** The offset after the quoted text at `i` (a doubled quote inside is part of it). */
function quoteEnd(s, i) {
  for (let j = s.indexOf(s[i], i + 1); j >= 0; j = s.indexOf(s[i], j + 2)) if (s[j + 1] !== s[i]) return j + 1;
  return s.length;
}

/** Tokens { t, v, sp, nl }: t is w (word or number), s (string or quoted name), l (line comment), b (block comment) or p
 * (one punctuation character); sp and nl say that white space, and a line break, came before it. */
function lex(s) {
  const toks = [], n = s.length;
  let i = 0, sp = false, nl = false;
  const add = (t, end) => { toks.push({ t, v: s.slice(i, end), sp, nl }); sp = nl = false; i = end; };
  while (i < n) {
    const c = s[i];
    if (c <= ' ' || c === ' ') { sp = true; if (c === '\n') nl = true; i++; continue; }
    if (c === '-' && s[i + 1] === '-') { const e = s.indexOf('\n', i); add('l', e < 0 ? n : e); continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); add('b', e < 0 ? n : e + 2); continue; }
    if (c === "'" || c === '"' || c === '`') { add('s', quoteEnd(s, i)); continue; }
    if (c === '$') {   // a dollar-quoted body ($$ ... $$ or $tag$ ... $tag$) may hold semicolons
      DOLLAR.lastIndex = i;
      const m = DOLLAR.exec(s), e = m ? s.indexOf(m[0], i + m[0].length) : -1;
      if (e >= 0) { add('s', e + m[0].length); continue; }
    }
    if (WORD_CHAR.test(c)) { WORD.lastIndex = i; add('w', i + WORD.exec(s)[0].length); continue; }
    add('p', i + 1);
  }
  return toks;
}

const up = (t) => t.v.toUpperCase();
const frameOf = (type, base, closeAt) => ({ type, base, closeAt, list: '', join: false, fresh: true, first: '', sawTable: false, defsDone: false });

/** The clause keyword that starts at token `i` in a statement or subquery frame: { kind, n } (n tokens), or null. */
function clauseAt(toks, i, fr) {
  const u = up(toks[i]);
  const word = (k) => (toks[i + k] && toks[i + k].t === 'w' ? up(toks[i + k]) : '');
  if (u === 'SELECT') return { kind: 'select', n: 1 };
  if (PLAIN.has(u)) return { kind: 'plain', n: 1 };
  if ((u === 'GROUP' || u === 'ORDER') && word(1) === 'BY') return { kind: 'plain', n: 2 };
  if (u === 'UNION' || u === 'INTERSECT' || u === 'EXCEPT') return { kind: 'union', n: word(1) === 'ALL' || word(1) === 'DISTINCT' ? 2 : 1 };
  if (u === 'VALUES') return { kind: 'values', n: 1 };
  if (u === 'SET' && fr.first === 'UPDATE' && fr.list !== 'set') return { kind: 'set', n: 1 };
  if (u === 'ON' && fr.join) return { kind: 'on', n: 1 };
  if (u === 'STRAIGHT_JOIN') return { kind: 'join', n: 1 };
  if (u === 'JOIN' || JOIN_WORDS.has(u)) {
    let k = 0;
    while (JOIN_WORDS.has(word(k))) k++;
    if (word(k) === 'JOIN') return { kind: 'join', n: k + 1 };
  }
  if (u === 'WITH' && fr.fresh) return { kind: 'with', n: word(1) === 'RECURSIVE' ? 2 : 1 };
  if (STARTS.has(u) && (fr.fresh || fr.list === 'with')) {
    const more = (u === 'INSERT' || u === 'REPLACE') && word(1) === 'INTO' ? 1 : u === 'DELETE' && word(1) === 'FROM' ? 1 : 0;
    return { kind: 'stmt', n: 1 + more };
  }
  return null;
}

/** Format SQL: one result for the whole text (it cannot fail: unknown syntax is printed as it came). */
export function formatSql(text) {
  const toks = lex(text), lines = [], frames = [frameOf('top', 0, 0)];
  let cur = '', ind = 0, blank = false, tight = false, comma = false;   // tight: no space before the next token
  let pend = null;   // the level of a line break that waits for the next token, so a comment after a comma stays on its line
  let frame = frames[0];
  const flush = () => { if (cur) { lines.push(pad(ind) + cur); cur = ''; } };
  const newline = (level) => { flush(); ind = level; };
  const put = (s, space) => {
    if (!cur && blank) { lines.push(''); blank = false; }
    cur += (cur && space ? ' ' : '') + s;
    tight = comma = false;
  };
  const nextSig = (k) => { while (toks[k] && (toks[k].t === 'l' || toks[k].t === 'b')) k++; return toks[k]; };
  const wordAt = (k) => (toks[k] && toks[k].t === 'w' ? up(toks[k]) : '');
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], space = (t.sp || comma) && !tight;
    const comment = t.t === 'l' || t.t === 'b';
    if (pend !== null && !(comment && !t.nl)) { newline(pend); pend = null; }
    if (comment) {   // a comment on its own line stays there; a trailing one stays on its line
      const own = t.nl || !cur;
      if (own) flush();
      put(t.v, !own && t.sp);
      if (own || t.t === 'l') flush();
      if (t.t === 'l' && pend !== null) { ind = pend; pend = null; }
    } else if (t.t === 'w' && (frame.type === 'top' || frame.type === 'sub')) {
      const u = up(t), c = clauseAt(toks, i, frame);
      if (frame.fresh && !frame.first) frame.first = u;
      if (c) {
        newline(c.kind === 'on' ? frame.base + 1 : frame.base);
        put(toks.slice(i, i + c.n).map((x) => x.v).join(' '), false);
        i += c.n - 1;
        if (c.kind === 'stmt') frame.first = u;
        frame.join = c.kind === 'join';
        frame.list = c.kind === 'select' || c.kind === 'set' || c.kind === 'values' || c.kind === 'with' ? c.kind : '';
        if (c.kind === 'select') {   // DISTINCT, ALL and TOP n stay on the SELECT line
          for (;;) {
            const w = wordAt(i + 1);
            if (w === 'DISTINCT' || w === 'ALL') put(toks[++i].v, true);
            else if (w === 'TOP' && wordAt(i + 2) && /^\d+$/.test(toks[i + 2].v)) { put(toks[i + 1].v + ' ' + toks[i + 2].v, true); i += 2; } else break;
          }
        }
        if (ITEM_LEVEL[frame.list] === 1) newline(frame.base + 1);
      } else {
        if (u === 'TABLE' && frame.first === 'CREATE') frame.sawTable = true;
        put(t.v, space);
      }
      frame.fresh = false;
    } else if (t.v === '(' && t.t === 'p') {
      const nx = nextSig(i + 1), sub = nx && nx.t === 'w' && SUB_START.has(up(nx));
      const defs = !sub && frame.type === 'top' && frame.first === 'CREATE' && frame.sawTable && !frame.defsDone;
      put('(', space);
      frame.fresh = false;
      if (sub || defs) {
        if (defs) frame.defsDone = true;
        frame = frameOf(sub ? 'sub' : 'defs', ind + 1, ind);
        if (defs) frame.list = 'defs';
        newline(frame.base);
      } else frame = frameOf('plain', ind, ind);
      frames.push(frame);
      tight = true;
    } else if (t.v === ')' && t.t === 'p') {
      if (frames.length > 1) {
        const f = frames.pop();
        frame = frames[frames.length - 1];
        if (f.type !== 'plain') newline(f.closeAt);
      }
      put(')', false);
    } else if (t.v === ',' && t.t === 'p') {
      put(',', false);
      if (frame.list in ITEM_LEVEL) pend = frame.base + ITEM_LEVEL[frame.list]; else comma = true;
    } else if (t.v === ';' && t.t === 'p') {
      put(';', false);
      flush();
      blank = true;
      ind = 0;
      frames.length = 1;
      frame = frames[0] = frameOf('top', 0, 0);
    } else {
      frame.fresh = false;
      put(t.v, space);
    }
  }
  flush();
  return { ok: true, text: lines.join('\n') };
}
