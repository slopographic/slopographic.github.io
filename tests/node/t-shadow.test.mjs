// Rule 7 of the file rules: nothing else is named t in a script whose translator is called t (the bug where
// `const t = SlopI18n.t` at the top and `(t) => t.x` or `for (const t of list)` inside broke t('key') there).
// Covers: tools/t-shadow.mjs, tools/check-rules.mjs
// Run: node --test tests/node/t-shadow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shadowProblems, blank } from '../../tools/t-shadow.mjs';
import { check } from '../../tools/check-rules.mjs';

const TR = "const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);\n";
const lines = (src) => shadowProblems(src).map((p) => p.line);

test('a parameter, loop variable, catch binding or variable named t beside the translator is flagged, with its line', () => {
  assert.deepEqual(lines(TR + "list.map((t) => t.name);\nel.title = t('app.x');"), [2]);
  assert.deepEqual(lines(TR + 'list.forEach(t => t.stop());'), [2]);
  assert.deepEqual(lines(TR + 'for (const t of tracks) t.stop();'), [2]);
  assert.match(shadowProblems(TR + 'for (const t of tracks) t.stop();')[0].why, /loop variable/);
  assert.deepEqual(lines(TR + 'try { go(); } catch (t) { say(t); }'), [2]);
  assert.deepEqual(lines(TR + 'function f() {\n  const t = el.value.trim();\n  return t;\n}'), [3]);
  assert.deepEqual(lines(TR + 'function when(a, t) { return t; }'), [2]);
  assert.deepEqual(lines(TR + 'list.reduce((acc, t) => acc + t, 0);'), [2]);
  assert.deepEqual(lines(TR + 'const o = { show(t) { return t; } };'), [2]);
  assert.deepEqual(lines(TR + 'const [t, n] = pair;'), [2]);
  assert.deepEqual(lines(TR + 'for (const [id, t] of tiles) t.remove();'), [2]);
  assert.deepEqual(lines(TR + 'let n = 0;\nt = setTimeout(go, 9);'), [3], 'an assignment replaces the translator');
  assert.deepEqual(lines("import { t } from './i18n.js';\nel.title = t('diff.x');\nconst t2 = (t) => t;"), [3], 'an imported translator');
  assert.deepEqual(lines("const D = 1, t = (k, v) => ns.defs.t(k, v);\nlist.map((t) => t.x);"), [2], 'a translator as a later declarator');
  assert.deepEqual(lines(TR + 'function f(a) {\n  const e = a.name, t = a.type;\n  return t;\n}'), [3], 'a second declarator');
  assert.deepEqual(lines("var t = U.t;\nfunction a() { return t('pdf.menu.open'); }\nfunction b(t) { return t * 2; }"), [3], 'U.t is a translator in a file that asks t for keys');
});

test('a file without a translator called t, other translator bindings, and t in strings, comments, regexes or properties pass', () => {
  assert.deepEqual(lines('const t = Date.now();\nlist.map((t) => t.x);'), [], 'no translator');
  assert.deepEqual(lines('const t = TL.t(x);\nconst f = (t) => t + 1;'), [], 'TL.t is a time, not a translator: nothing asks t for a key');
  assert.deepEqual(lines(TR + "function inner() { const t = S.t; return t('x.y'); }"), [], 'another translator binding is fine');
  assert.deepEqual(lines(TR + "// (t) => t.x is how not to do it\nconst s = '(t) => t';\nconst re = /(t) => t/;\nconst o = { t: 1 };\no.t = 2;\nconst x = `${a} for (const t of b)`;"), []);
  assert.deepEqual(lines(TR + "list.map((tab) => tab.name + t('app.tab'));"), []);
  assert.deepEqual(lines("function t(key, vars) { return SlopI18n.t(key, vars); }\nel.title = t('app.x');\nfor (const t of list) go(t);"), [3], 'function t(key) is a translator');
});

test('blank() keeps the length and the lines and drops strings, comments and regular expressions', () => {
  const src = "a = 'x\\'y'; // c\nb = /re[/]x/g; /* m\nn */ c = `t ${'q'}`;";
  const out = blank(src);
  assert.equal(out.length, src.length);
  assert.equal(out.split('\n').length, src.split('\n').length);
  for (const gone of ['x', 'y', '// c', 're', '/* m', 'n */', '${', 'q']) assert.ok(!out.includes(gone), gone);
  assert.match(out, /^a = '\s+'; +\nb = +; +\n +c = `\s+`;$/);
});

test('check-rules reports the rule for a script, and not for a style sheet', () => {
  const files = { 'app/a.js': TR + 'items.map((t) => t.id);', 'app/b.js': TR + 'items.map((it) => it.id);', 'app/c.css': '.t { }' };
  const p = check(Object.keys(files), { read: (f) => files[f] ?? null });
  assert.deepEqual(p.map((x) => [x.file, x.rule]), [['app/a.js', 't-shadow']]);
  assert.match(p[0].message, /app\/a\.js:2: a parameter named t hides the translator t/);
});
