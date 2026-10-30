// tools/compat-check.mjs: our scripts use only what the support target has (Safari 16.4; tools/compat/features.mjs).
// The iPhone bug it guards against: a for-await over a ReadableStream (pdf.js's getTextContent) threw on Safari.
// Covers: tools/compat-check.mjs, tools/compat/features.mjs, tools/check-rules.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { compatProblems, blank, scriptsOf, inScope } from '../../tools/compat-check.mjs';
import { FEATURES, TARGET, flagged } from '../../tools/compat/features.mjs';
import { check } from '../../tools/check-rules.mjs';

const ROOT = new URL('../../', import.meta.url);
const fixture = (n) => readFileSync(new URL('fixtures/compat/' + n, import.meta.url), 'utf8');

test('the target is Safari 16.4, and every feature has a version or null, a pattern, and (when flagged) a fallback', () => {
  assert.equal(TARGET.safari, 16.4);
  for (const f of FEATURES) {
    assert.ok(f.safari === null || typeof f.safari === 'number', f.id);
    assert.ok(f.re instanceof RegExp, f.id);
    if (flagged().includes(f)) assert.ok(f.fallback, f.id);
  }
  // on the target: listed, never flagged
  for (const id of ['array-from-async', 'regexp-lookbehind', 'change-array-by-copy', 'find-last', 'structured-clone']) assert.ok(!flagged().some((f) => f.id === id), id);
});

test('flags each newer feature in the bad fixture, at its line (for await over res.body first)', () => {
  const p = compatProblems('bad.js', fixture('bad.js'));
  assert.deepEqual(p.map((x) => [x.line, x.id]), [[3, 'stream-async-iteration'], [5, 'iterator-helpers'], [6, 'set-methods'], [7, 'group-by'],
    [8, 'promise-with-resolvers'], [9, 'request-idle-callback'], [10, 'body-bytes'], [10, 'base64-hex']]);
});

test('passes the good fixture: comments, strings, templates and regexps; guards; compat-ok; features on the target', () => {
  assert.deepEqual(compatProblems('good.js', fixture('good.js')), []);
});

test('compat-ok on the line or the line above lets a guarded use through; elsewhere it does not', () => {
  const use = 'const { promise } = Promise.withResolvers();';
  assert.equal(compatProblems('a.js', use).length, 1);
  assert.equal(compatProblems('a.js', use + ' // compat-ok: guarded above').length, 0);
  assert.equal(compatProblems('a.js', '// compat-ok: guarded\n' + use).length, 0);
  assert.equal(compatProblems('a.js', '// compat-ok: guarded\n\n' + use).length, 1);
});

test('the tokenizer blanks comments and strings and keeps lines; regexps with quotes do not open a string', () => {
  const b = blank("const a = 'x // y'; /* z\n w */ const r = /[\"']/g; f(`t ${'u'} v`); // c");
  assert.equal(b.split('\n').length, 2);
  assert.ok(!/x|y|z|w|u|c$/.test(b.replace(/const|r|f/g, '')), b);
  assert.ok(b.includes('/["\']/g'), b);
});

test('a page\'s inline scripts are checked at their own lines; external and JSON scripts are not', () => {
  const html = '<p>for await (x of res.body)</p>\n<script>\nfor await (const c of res.body) {}\n</script>\n<script type="application/ld+json">{"a":"Promise.withResolvers()"}</script>\n<script src="x.js"></script>';
  assert.equal(scriptsOf(html).split('\n').length, html.split('\n').length);
  assert.deepEqual(compatProblems('p.html', html).map((x) => x.line), [3]);
});

test('scope: our browser code; not vendor, minified, tests or the Node tools', () => {
  for (const f of ['pdf/js/core/pdfjs.js', 'index.html', 'shared/compat/stream.js', 'service-worker.js']) assert.ok(inScope(f), f);
  for (const f of ['vendor/pdfjs/pdf.min.js', 'x/a.min.js', 'tests/a.js', 'tools/x.mjs', 'shared/templates/generate.test.mjs', 'README.md']) assert.ok(!inScope(f), f);
});

test('rule 6 of check-rules: a staged file with a newer feature is refused', () => {
  const read = (f) => ({ 'a/x.js': 'for await (const c of res.body) {}\n', 'a/y.js': 'const x = 1;\n' }[f] ?? null);
  const p = check(['a/x.js', 'a/y.js'], { read });
  assert.deepEqual(p.map((x) => [x.file, x.rule]), [['a/x.js', 'compat']]);
});

test('the whole repository passes', () => {
  const r = spawnSync(process.execPath, ['tools/compat-check.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
