// Which test pages a change needs (tools/ci/affected.mjs, tools/ci/deps.mjs): what a page loads, through the app pages
// it opens and their modules, its Covers: lines, the smoke pages, and the runner files that select nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGraph, namedPaths, resolvePath } from '../../tools/ci/deps.mjs';
import { affectedPages, sliceCount, SMOKE, MAX_SLICES } from '../../tools/ci/affected.mjs';

const REPO = {
  'tests/pdf/a.test.html': '<script src="../harness.js"></script><script src="a.spec.js"></script>',
  'tests/pdf/a.spec.js': "frame.src = '../../pdf/index.html';",
  'tests/pdf/b.test.html': '<script src="../../shared/money.js"></script><script>// Covers: pdf/js/save.js\n</script>',
  'tests/home/c.test.html': '<a href="../../pdf/index.html">a link is not a load</a><script>fetch("data/x.json")</script>',
  'tests/home/data/x.json': '{}',
  'tests/harness.js': '',
  'pdf/index.html': '<link rel="stylesheet" href="css/app.css"><script src="js/app.js"></script><script src="/shared/ui.js"></script>',
  'pdf/css/app.css': '',
  'pdf/js/app.js': "import './io.js'; new Worker('js/worker.js'); const u = 'https://cdn.example/x.js';",
  'pdf/js/io.js': '',
  'pdf/js/worker.js': "importScripts('../../vendor/pdfjs/pdf.js');",
  'pdf/js/save.js': '',
  'vendor/pdfjs/pdf.js': "'../../shared/never.js'",
  'shared/ui.js': '', 'shared/money.js': '', 'shared/never.js': '',
};
const files = new Set(Object.keys(REPO));
const graph = makeGraph(files, (f) => REPO[f] ?? null);
const pages = [...files].filter((f) => f.endsWith('.test.html'));
const pick = (changed) => affectedPages(changed, pages, graph.closure, []);

test('names: quoted paths in scripts, what tags load, Covers: lines; not links or outside URLs', () => {
  const n = namedPaths('<a href="x.html"></a><img src="p.png"><script>load("./m.js"); // Covers: a/b.js, c/d.mjs\n</script>', true);
  assert.deepEqual(n.rel.sort(), ['./m.js', 'p.png']);
  assert.deepEqual(n.repo, ['a/b.js', 'c/d.mjs']);
  assert.equal(resolvePath('../x/', ['tests/a'], (f) => f === 'tests/x/index.html'), 'tests/x/index.html');
  assert.equal(resolvePath('/shared/ui.js', ['pdf'], (f) => f === 'shared/ui.js'), 'shared/ui.js');
});

test('a page depends on the app page it opens, its modules and workers, relative to the right folder', () => {
  const c = graph.closure('tests/pdf/a.test.html');
  for (const f of ['tests/pdf/a.spec.js', 'pdf/index.html', 'pdf/css/app.css', 'pdf/js/app.js', 'pdf/js/io.js', 'pdf/js/worker.js', 'vendor/pdfjs/pdf.js', 'shared/ui.js']) assert.ok(c.has(f), f);
  assert.ok(!c.has('shared/never.js'), 'vendored code is not scanned');
  assert.ok(graph.closure('tests/home/c.test.html').has('tests/home/data/x.json'));
  assert.ok(!graph.closure('tests/home/c.test.html').has('pdf/index.html'), 'a link is not a load');
});

test('the changed pages, the pages that load or name a changed file, and the smoke pages', () => {
  assert.deepEqual(pick(['pdf/js/io.js']), ['tests/pdf/a.test.html']);
  assert.deepEqual(pick(['pdf/js/save.js']), ['tests/pdf/b.test.html']);
  assert.deepEqual(pick(['shared/money.js', 'tests/home/c.test.html']), ['tests/home/c.test.html', 'tests/pdf/b.test.html']);
  assert.deepEqual(pick(['README.md']), []);
  assert.deepEqual(pick(['tests/harness.js', '.github/workflows/rules.yml', 'tests/run.mjs']), [], 'runner and CI files select nothing');
  assert.deepEqual(affectedPages(['README.md'], [...pages, ...SMOKE], graph.closure), [...SMOKE].sort());
});

test('slices: one per 12 pages, at least one, at most MAX_SLICES', () => {
  assert.equal(sliceCount(0), 1);
  assert.equal(sliceCount(12), 1);
  assert.equal(sliceCount(13), 2);
  assert.equal(sliceCount(5000), MAX_SLICES);
});
