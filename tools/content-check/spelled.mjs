// Words spelled so that a plain search misses them, read back for the content checks (the white-label leak scan and the
// repository content check). A text file is also read through these views:
//   - adjacent quoted strings joined by + ('ac' + 'me'), or by commas when the pieces are one or two characters each
//     ('a', 'c', 'm', 'e') or the array is joined with '' (['so', 'me'].join(''));
//   - JavaScript escapes (\x61, \u0061, \u{61}), CSS escapes (\61), HTML numeric entities (&#97; &#x61;);
//   - String.fromCharCode(...) / String.fromCodePoint(...) and short arrays of character codes ([97, 99, 109]);
//   - a word split between two letters by a menu-key mark (A&CME, A&amp;CME), a soft hyphen, an invisible character or
//     an inline tag (<b>A</b>CME).
// Each view is a span of the text and the string it spells; a word counts as spelled when the string shows more of it
// than the span's own characters do. No reversed text and no base64: both read words into ordinary text and data.
// Plain string functions. Tests: tests/node/content-check-unpack.test.mjs.

const cp = (n) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');
const num = (t) => (/^0x/i.test(t) ? parseInt(t.slice(2), 16) : Number(t));

/** A JavaScript string literal's contents with its escapes read. */
export const unescapeJs = (s) => s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]{1,6}\}|[\s\S])/g, (m, e) => {
  if (e.length > 1) return cp(parseInt(e[1] === '{' ? e.slice(2, -1) : e.slice(1), 16));
  return { n: '\n', t: '\t', r: '\r' }[e] || e;
});

// a quoted string of at most 256 characters on one line (backquoted: without ${...})
const LIT = /'(?:[^'\\\n]|\\.){0,256}'|"(?:[^"\\\n]|\\.){0,256}"|`(?:[^`\\$]|\\[\s\S]|\$(?!\{)){0,256}`/.source;
const PIECE = new RegExp(LIT, 'g');
const PLUS = new RegExp(`(?:${LIT})(?:\\s*\\+\\s*(?:${LIT}))+`, 'g');
const COMMA = new RegExp(`(?:${LIT})(?:\\s*,\\s*(?:${LIT}))+`, 'g');
const JOINED = /^\s*\]\s*\.join\(\s*(?:''|""|``)\s*\)/;

/** Runs of adjacent quoted strings, read as one string. */
function joined(s) {
  const out = [];
  for (const [re, comma] of [[PLUS, false], [COMMA, true]]) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(s));) {
      const end = m.index + m[0].length, all = !comma || JOINED.test(s.slice(end, end + 40));
      const pieces = [...m[0].matchAll(PIECE)].map((p) => ({ at: m.index + p.index, end: m.index + p.index + p[0].length, text: unescapeJs(p[0].slice(1, -1)) }));
      // in a plain list only the stretches of one- and two-character pieces are a spelling
      for (let i = 0; i < pieces.length;) {
        let j = i;
        while (j < pieces.length && (all || pieces[j].text.length <= 2)) j++;
        if (j - i >= 2) out.push({ index: pieces[i].at, end: pieces[j - 1].end, text: pieces.slice(i, j).map((p) => p.text).join('') });
        i = Math.max(j, i + 1);
      }
    }
  }
  return out;
}

/** Runs of word characters and escapes around each escape, with the escapes read (esc: one escape; word: one plain
 * character of a word; read: an escape's text). */
function escaped(s, esc, word, read) {
  const out = [], first = new RegExp(esc, 'g'), unit = new RegExp(`(?:${esc})|${word}`, 'y'), one = new RegExp(`^${word}$`), all = new RegExp(esc, 'g');
  for (let m; (m = first.exec(s));) {
    let a = m.index, b = m.index;
    while (a > 0 && one.test(s[a - 1])) a--;
    unit.lastIndex = b;
    while (unit.exec(s)) b = unit.lastIndex;
    out.push({ index: a, end: b, text: s.slice(a, b).replace(all, read) });
    first.lastIndex = b;
  }
  return out;
}

const NUM = /0[xX][0-9a-fA-F]+|\d+/.source;
const CALL = new RegExp(`String\\.from(?:CharCode|CodePoint)\\(\\s*((?:${NUM})(?:\\s*,\\s*(?:${NUM}))*)\\s*\\)`, 'g');
const CODES = new RegExp(`\\[\\s*((?:${NUM})(?:\\s*,\\s*(?:${NUM})){2,63})\\s*,?\\s*\\]`, 'g');
/** String.fromCharCode(...) and arrays of 3 to 64 character codes, all printable ASCII. */
function codes(s) {
  const out = [], read = (list) => list.split(',').map((t) => num(t.trim()));
  if (s.includes('fromC')) for (const m of s.matchAll(CALL)) out.push({ index: m.index, end: m.index + m[0].length, text: read(m[1]).map(cp).join('') });
  for (const m of s.matchAll(CODES)) {
    const n = read(m[1]);
    if (n.every((c) => c >= 32 && c <= 126)) out.push({ index: m.index, end: m.index + m[0].length, text: String.fromCharCode(...n) });
  }
  return out;
}

const SPLIT = /[A-Za-z]+(?:(?:&amp;|&|\u00ad|[\u200b-\u200d\u2060\ufeff]|<\/?[A-Za-z][^<>]{0,40}>)+[A-Za-z]+)+/g;
const SEP = /&amp;|&|\u00ad|[\u200b-\u200d\u2060\ufeff]|<\/?[A-Za-z][^<>]{0,40}>/g;
/** Runs of letters split by marks, characters or tags that do not show as a letter, read without them. */
const split = (s) => [...s.matchAll(SPLIT)].map((m) => ({ index: m.index, end: m.index + m[0].length, text: m[0].replace(SEP, '') }));

/** Every view of a text: [{ index, end, text }] (the span s.slice(index, end) and the string it spells). */
export function spellings(s) {
  const out = [];
  if (/['"`]\s*[+,]\s*['"`]/.test(s)) out.push(...joined(s));
  if (s.includes('\\x') || s.includes('\\u')) out.push(...escaped(s, String.raw`\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]{1,6}\}`, String.raw`[\w$]`, unescapeJs));
  if (/\\[0-9a-fA-F]/.test(s)) out.push(...escaped(s, String.raw`\\[0-9a-fA-F]{1,6}[ \t]?`, String.raw`[\w-]`, (e) => cp(parseInt(e.slice(1), 16))));
  if (s.includes('&#')) out.push(...escaped(s, '&#[xX][0-9a-fA-F]{1,6};?|&#[0-9]{1,7};?', String.raw`[\w-]`, (e) => cp(/x/i.test(e[2]) ? parseInt(e.slice(3), 16) : parseInt(e.slice(2), 10))));
  out.push(...codes(s));
  if (/[&<\u00ad\u200b-\u200d\u2060\ufeff]/.test(s)) out.push(...split(s));
  return out;
}

/** The matches only a view shows: [{ index, term, word }] (index: where its span starts in s). find(string): the
 * matches in a string ([{ term, word }]). The longest views go first; a view inside one that already counted is skipped. */
export function spelledMatches(s, find) {
  const out = [], counted = [];
  for (const v of spellings(s).sort((a, b) => b.end - b.index - (a.end - a.index))) {
    if (counted.some(([a, b]) => v.index >= a && v.end <= b)) continue;
    const got = find(v.text);
    if (!got.length) continue;
    const plain = new Map();
    for (const m of find(s.slice(v.index, v.end))) plain.set(m.term, (plain.get(m.term) || 0) + 1);
    const more = got.filter((m) => { const n = plain.get(m.term) || 0; plain.set(m.term, n - 1); return n <= 0; });
    if (more.length) { counted.push([v.index, v.end]); for (const m of more) out.push({ index: v.index, term: m.term, word: m.word }); }
  }
  return out.sort((a, b) => a.index - b.index);
}
