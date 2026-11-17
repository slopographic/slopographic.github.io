// The file rules (tools/check-rules.mjs): at most 300 lines per source file, and a test that names every new or changed
// script. The whole repository must pass rule 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, lineCount, isSource, needsTest, touchProblems, MAX_LINES } from '../../tools/check-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lines = (n) => 'x\n'.repeat(n);
const fake = (files) => (f) => (f in files ? files[f] : null);

test('lines are counted as wc -l does, plus a last line without a newline', () => {
  assert.equal(lineCount(''), 0);
  assert.equal(lineCount('a\nb\n'), 2);
  assert.equal(lineCount('a\nb'), 2);
});

test('sources are our .js, .mjs, .css and .html; vendored, minified and generated files are not', () => {
  for (const f of ['pdf/js/ui/panes.js', 'tools/x.mjs', 'pdf/css/find.css', 'index.html', 'tests/a.test.html']) assert.ok(isSource(f), f);
  for (const f of ['vendor/pdfjs/pdf.js', 'shared/x.min.js', 'sw-precache-2.js', 'packs.json', 'README.md']) assert.ok(!isSource(f), f);
  assert.ok(needsTest('pdf/js/ui/panes.js'));
  assert.ok(!needsTest('tests/pdf/pdf.spec-panes.js') && !needsTest('pdf/css/find.css') && !needsTest('index.html'));
});

test(`a source file over ${MAX_LINES} lines is refused; ${MAX_LINES} is fine; vendor is not checked`, () => {
  const read = fake({ 'a.js': lines(MAX_LINES), 'b.css': lines(MAX_LINES + 1), 'vendor/big.js': lines(5000) });
  const p = check(['a.js', 'b.css', 'vendor/big.js'], { read });
  assert.deepEqual(p.map((x) => [x.file, x.rule]), [['b.css', 'size']]);
  assert.match(p[0].message, /301 lines/);
});

test('a script no test names is refused; a test that loads it or a Covers line answers it', () => {
  const read = fake({ 'app/a.js': 'x', 'app/b.js': 'x', 'app/c.js': 'x', 'app/s.css': 'x' });
  const tests = '<script src="../../app/a.js"></script>\n/* Covers: app/b.js */';
  const p = check(['app/a.js', 'app/b.js', 'app/c.js', 'app/s.css', 'gone.js'], { read, tests });
  assert.deepEqual(p.map((x) => [x.file, x.rule]), [['app/c.js', 'test']]);
  assert.match(p[0].message, /Covers: app\/c\.js/);
});

test('without the tests text only the size rule runs (the --all mode)', () => {
  assert.deepEqual(check(['app/c.js'], { read: fake({ 'app/c.js': 'x' }) }), []);
});

test('every tracked source file has at most 300 lines (node tools/check-rules.mjs --all)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/check-rules.mjs'), '--all'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('rule 5: app scripts use pointer events, not mouse listeners, unless a touch-ok comment says why', () => {
  assert.equal(touchProblems('app/js/a.js', "el.addEventListener('mousedown', f);").length, 1);
  assert.equal(touchProblems('app/js/a.js', 'el.addEventListener("mousemove", f);').length, 1);
  assert.equal(touchProblems('app/js/a.js', 'h({ onmouseup: f })').length, 1);
  assert.equal(touchProblems('app/js/a.js', "el.addEventListener('mousedown', keep); // touch-ok: keeps the focus").length, 0);
  assert.equal(touchProblems('app/js/a.js', "el.addEventListener('pointerdown', f); el.addEventListener('mouseenter', g);").length, 0);
  assert.equal(touchProblems('tests/a.test.js', "el.addEventListener('mousedown', f);").length, 0); // tests and vendor are not app code
  assert.equal(touchProblems('vendor/x.js', "el.addEventListener('mousedown', f);").length, 0);
});

test('rule 5: a script that drags (setPointerCapture) marks its touch surface', () => {
  assert.equal(touchProblems('app/js/a.js', 'el.setPointerCapture(e.pointerId);').length, 1);
  assert.equal(touchProblems('app/js/a.js', "el.setPointerCapture(e.pointerId); SlopTouch.surface(el);").length, 0);
  assert.equal(touchProblems('app/js/a.js', "el.setPointerCapture(e.pointerId); el.setAttribute('data-touch-surface', '');").length, 0);
  assert.equal(touchProblems('app/js/a.js', "el.setPointerCapture(e.pointerId); el.style.touchAction = 'none'; // touch-action").length, 0);
  assert.equal(touchProblems('app/js/a.js', 'el.setPointerCapture(e.pointerId); // touch-ok: the grip is marked in app.css').length, 0);
});

test('rule 5 holds on the whole repository', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/check-rules.mjs'), '--all'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

// Rule 4 (tools/one-way.mjs): one way in, one way out, in the apps on the shared intake.
test('a migrated app may not add its own way in or out; other apps, shared/intake and marked lines pass', () => {
  const read = fake({
    'pdf/js/x.js': "a.addEventListener('drop', f);\nSlopUI.pickFiles({});\nH.consumeLaunch();\nconst i = h('input', { type: 'file' });\n"
      + "H.appsAccepting(t).map((a) => ({ label: `Open in ${a.name}` }));\n// SlopUI.pickFiles in a comment\nrow.addEventListener('drop', g); // intake-ok: a row reorder\n",
    'not-migrated/js/y.js': "a.addEventListener('paste', f);\n",
    'shared/intake/sources.js': "document.addEventListener('paste', onPaste);\n",
  });
  const p = check(['pdf/js/x.js', 'not-migrated/js/y.js', 'shared/intake/sources.js'], { read, size: false });
  assert.deepEqual(p.map((x) => [x.file, x.rule]), Array(5).fill(['pdf/js/x.js', 'one-way']));
  assert.match(p[0].message, /pdf\/js\/x\.js:1: a 'drop' listener of its own/);
  assert.match(p[4].message, /hand-made "Open in"/);
});
test('a migrated app may not list Slop Drive files for a picker of its own; a library or lookup says intake-ok', () => {
  const read = fake({
    'crm/js/x.js': "const files = await SlopHub.list({ trashed: false });\nconst r = await hub().list();\nH.list({ accept });\n"
      + "const all = await H().list(); // intake-ok: the library view\nstore.list('customers');\nS.hub.list();\n",
  });
  const p = check(['crm/js/x.js'], { read, size: false });
  assert.deepEqual(p.map((x) => x.message.match(/x\.js:(\d+)/)[1]), ['1', '2', '3']);
  assert.match(p[0].message, /a list of Slop Drive files of its own/);
});
