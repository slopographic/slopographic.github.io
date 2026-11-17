// File convert's words have one source, the tables (convert/i18n/<code>/<part>.js): no tr() call keeps English inline,
// tr works in Node from the English tables, every key the code names is in English and Swedish, and a converter page's
// label and summary (the hub card's words, the SEO page's crumb) are the tables' convert.card.<slug>, never a copy.
// Run: node --test tests/node/convert-i18n.test.mjs
// Covers: convert/js/core/i18n.js, convert/js/core/page-words.js, convert/js/core/pages.js, convert/js/core/detect.js
// Covers: convert/js/core/encoding.js, convert/js/core/catalog.js, convert/js/preview/view.js, convert/js/ui/cards.js
// Covers: shared/seo/convert-copy.mjs, shared/seo/copy.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, runTable } from '../../tools/i18n/tables.mjs';
import { tr } from '../../convert/js/core/i18n.js';
import { PAGES } from '../../convert/js/core/pages.js';
import { cardKey } from '../../convert/js/core/page-words.js';
import { KIND_LABEL } from '../../convert/js/core/detect.js';
import { ENCODINGS } from '../../convert/js/core/encoding.js';
import { CONVERSIONS, groupLabel } from '../../convert/js/core/catalog.js';

const table = (code) => {
  const t = {};
  for (const p of runTable('convert/i18n/index.js').sources[0].parts) for (const [c, d] of runTable(`convert/i18n/${code}/${p}.js`).adds) if (c === code) Object.assign(t, d);
  for (const [c, d] of runTable(`shared/i18n/ui/${code}.js`).adds) if (c === code) Object.assign(t, d);
  return t;
};
const EN = table('en'), SV = table('sv');

/** Code positions that are code (not strings, comments or regular expressions); template ${} is code. */
function codeMask(src) {
  const m = new Uint8Array(src.length), stack = [];
  let depth = 0, i = 0, last = -1;
  const tmpl = () => {
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`') { i++; return; }
      if (src[i] === '$' && src[i + 1] === '{') { m[i] = m[i + 1] = 1; i += 2; stack.push(depth); depth = 0; return; }
      i++;
    }
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i++; while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1; last = i++; continue; }
    if (c === '`') { i++; tmpl(); last = i - 1; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) i = src.length; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (c === '/' && (last < 0 || /[(,=:[!&|?{};+\-*%<>~^]/.test(src[last]) || /\b(return|typeof|case|of|in)$/.test(src.slice(0, last + 1)))) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      if (src[j] === '/') { i = j + 1; while (/[a-z]/.test(src[i])) i++; last = i - 1; continue; }
    }
    if (c === '{') depth++;
    if (c === '}') { if (!depth && stack.length) { m[i] = 1; depth = stack.pop(); i++; tmpl(); last = i - 1; continue; } depth--; }
    m[i] = 1;
    if (!/\s/.test(c)) last = i;
    i++;
  }
  return m;
}
/** The tr(...) calls of a source: their top-level arguments as text. */
function trCalls(src) {
  const mk = codeMask(src), out = [], re = /(?<![\w$.])tr\(/g;
  let r;
  while ((r = re.exec(src))) {
    if (!mk[r.index]) continue;
    const args = [];
    let d = 0, s = r.index + 3, j = r.index + 2;
    for (; j < src.length; j++) {
      if (!mk[j]) continue;
      if ('([{'.includes(src[j])) d++;
      else if (')]}'.includes(src[j])) { if (--d === 0) break; } else if (src[j] === ',' && d === 1) { args.push(src.slice(s, j).trim()); s = j + 1; }
    }
    if (src.slice(s, j).trim()) args.push(src.slice(s, j).trim());
    out.push({ at: src.slice(0, r.index).split('\n').length, args });
  }
  return out;
}
const walk = (dir) => readdirSync(path.join(ROOT, dir)).flatMap((n) => {
  const rel = `${dir}/${n}`;
  return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : /\.m?js$/.test(n) ? [rel] : [];
});
// Every file that takes tr from convert's i18n module (convert's own code and any shared code that calls it).
const USERS = [...walk('convert/js'), ...walk('shared'), ...walk('workflows/js')]
  .filter((f) => /import \{[^}]*\btr\b[^}]*\} from '[^']*(core\/|\.\/)i18n\.js'/.test(readFileSync(path.join(ROOT, f), 'utf8')))
  .filter((f) => f.startsWith('convert/js/') || /convert\/js\/core\/i18n\.js/.test(readFileSync(path.join(ROOT, f), 'utf8')));

test('the scan finds the files that use tr, and tr calls in them', () => {
  assert.ok(USERS.length > 40, USERS.join(' '));
  assert.deepEqual(trCalls("x(tr('a.b', { n: 1 }), `${tr('c.d')}`) // tr('no', 'English')").map((c) => c.args), [["'a.b'", '{ n: 1 }'], ["'c.d'"]]);
});

test('no tr() call keeps English inline: the second argument is only ever the vars object', () => {
  const bad = [];
  for (const f of USERS) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    if (/const tr = /.test(src)) continue;   // a local helper named tr (table-out.js) is not convert's tr
    for (const c of trCalls(src)) if (c.args.length > 2 || (c.args[1] && !/^\{/.test(c.args[1]) && !/^(?!(en|english|fallback|label|text)$)[a-z]\w*$/i.test(c.args[1]))) bad.push(`${f}:${c.at} ${c.args.join(', ')}`);
  }
  assert.deepEqual(bad, []);
  // table-out.js: its own tr builds table rows; convert's tr there takes keys only
  const t = readFileSync(path.join(ROOT, 'convert/js/core/table-out.js'), 'utf8');
  for (const c of trCalls(t)) if (/^'convert\./.test(c.args[0])) assert.ok(c.args.length === 1 || /^\{/.test(c.args[1]), c.args.join(', '));
});

test('every key a tr() call names is in the English and the Swedish tables', () => {
  const missing = [];
  for (const f of USERS) {
    for (const c of trCalls(readFileSync(path.join(ROOT, f), 'utf8'))) {
      const m = /^'([a-z0-9_.]+)'$/.exec(c.args[0] || '');
      if (!m || !/^(convert|ui)\./.test(m[1])) continue;
      for (const [code, tb] of [['en', EN], ['sv', SV]]) if (!(m[1] in tb) && !(`${m[1]}#one` in tb)) missing.push(`${code} ${m[1]} (${f}:${c.at})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('tr works in Node from the English tables: text, vars, plurals, numbers, unknown keys', () => {
  assert.equal(tr('convert.card.go'), EN['convert.card.go']);
  assert.equal(tr('ui.download'), EN['ui.download']);
  assert.equal(tr('convert.card.flow', { from: 'PDF', to: 'DOCX' }), EN['convert.card.flow'].replace('{from}', 'PDF').replace('{to}', 'DOCX'));
  assert.equal(tr('convert.vcf.n_contacts', { n: 1 }), EN['convert.vcf.n_contacts#one'].replace('{n}', '1'));
  assert.equal(tr('convert.vcf.n_contacts', { n: 1234 }), EN['convert.vcf.n_contacts'].replace('{n}', '1,234'));
  assert.equal(tr('convert.no_such_key'), 'convert.no_such_key');
});

test('the labels read through dynamic keys are all in the tables (kinds, encodings, categories)', () => {
  for (const [k, v] of Object.entries(KIND_LABEL)) assert.ok(!/^convert\./.test(v), `kind ${k}: ${v}`);
  for (const [v, label] of ENCODINGS) assert.ok(!/^convert\./.test(label), `encoding ${v}`);
  for (const g of new Set([...CONVERSIONS.map((c) => c.group), ...PAGES.map((p) => p.cat), 'Other'])) assert.ok(!/^convert\./.test(groupLabel(g)), `group ${g}`);
  assert.equal(groupLabel(undefined), EN['convert.cat.other']);
});

test('a page\'s label and summary are the tables\' card words: one source for the hub card and the SEO page', async () => {
  for (const p of PAGES) {
    for (const f of ['label', 'summary']) {
      const own = Object.getOwnPropertyDescriptor(p, f);
      assert.ok(own && own.get && !('value' in own), `${p.slug}.${f} is written in the page list`);
    }
    assert.equal(p.label, EN[cardKey(p)], p.slug);
    assert.equal(p.summary, EN[cardKey(p) + '_sum'], p.slug);
    assert.ok(cardKey(p) in SV && cardKey(p) + '_sum' in SV, `${p.slug} in Swedish`);
  }
  // the hub card shows p.label and p.summary, not keys of its own
  const cards = readFileSync(path.join(ROOT, 'convert/js/ui/cards.js'), 'utf8');
  assert.match(cards, /p\.label/);
  assert.match(cards, /p\.summary/);
  assert.doesNotMatch(cards, /_sum'/);
  // the SEO copy of every converter page that has one: the crumb is the same label
  const { PAGES: COPY } = await import('../../shared/seo/copy.mjs');
  let n = 0;
  for (const p of PAGES) if (COPY[`convert/${p.slug}`]) { n++; assert.equal(COPY[`convert/${p.slug}`].crumb, p.label, p.slug); }
  assert.ok(n >= 80, `${n} converter pages have SEO copy`);
  const copySrc = readFileSync(path.join(ROOT, 'shared/seo/copy.mjs'), 'utf8');
  assert.doesNotMatch(copySrc, /'convert\/[a-z0-9-]+':/, 'converter page copy is written in shared/seo/copy.mjs');
});
