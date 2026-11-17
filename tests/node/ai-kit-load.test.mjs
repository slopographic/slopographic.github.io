// SlopAIKit.load (shared/ai/slopai.js): the AI panel's kit is requested all at once and runs in order. On an iPhone the
// panel took seconds to open: each of ~30 files was asked for only after the one before had arrived. Also: a file that
// does not load rejects with its name (the panel shows it), and a file another loader inserted is waited for, not doubled.
// The browser side (timings, the error line) is tests/ai/iphone-panel.test.html.
// Covers: shared/ai/slopai.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../shared/ai/slopai.js', import.meta.url), 'utf8');
/** A page with just enough DOM: inserted scripts are recorded; the test decides when each loads or fails. */
function page() {
  const scripts = [];
  const el = () => {
    const ls = {};
    const n = { dataset: {}, async: true, src: '', listeners: ls, addEventListener: (t, f) => (ls[t] = ls[t] || []).push(f), remove() { n.removed = true; } };
    n.fire = (t) => { if (n['on' + t]) n['on' + t](); (ls[t] || []).forEach((f) => f()); };
    return n;
  };
  const document = {
    currentScript: { src: 'https://x.test/shared/ai/slopai.js' },
    createElement: () => el(),
    head: { append: (s) => scripts.push(s) },
    querySelector: (sel) => { const m = /data-slopai="([^"]+)"/.exec(sel); return (m && scripts.find((s) => s.dataset.slopai === m[1] && !s.removed)) || null; },
  };
  const win = { document, console: { warn() {} }, setTimeout, Promise, URL, Object, Set, JSON, Math, Error };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(SRC, win);
  const byName = (n) => scripts.find((s) => s.dataset.slopai === n && !s.removed);
  return { win, K: win.SlopAIKit, scripts, byName };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('every file of a load is inserted at once, async = false (they run in the given order), before any has loaded', async () => {
  const { K, scripts, byName } = page();
  for (const n of ['engines', 'tools', 'bridge', 'powerup']) byName(n).fire('load');   // slopai.js's own four
  const before = scripts.length;
  let done = false;
  const p = K.load(['permissions', 'picker', 'panel-run']).then(() => { done = true; });
  assert.deepEqual(scripts.slice(before).map((s) => [s.dataset.slopai, s.async, s.src]), [
    ['permissions', false, 'https://x.test/shared/ai/permissions.js'], ['picker', false, 'https://x.test/shared/ai/picker.js'], ['panel-run', false, 'https://x.test/shared/ai/panel-run.js']]);
  byName('panel-run').fire('load'); byName('permissions').fire('load'); await tick();
  assert.equal(done, false);   // waits for all of them
  byName('picker').fire('load'); await p;
  assert.equal(done, true);
});

test('a file that fails rejects the load with its name; asked again, it is tried again', async () => {
  const { K, scripts, byName } = page();
  const p = K.load(['md', 'catalog']);
  byName('md').fire('load'); byName('catalog').fire('error');
  await assert.rejects(p, /Could not load shared\/ai\/catalog\.js/);
  const n = scripts.length;
  const again = K.load(['catalog']);
  assert.equal(scripts.length, n + 1);
  byName('catalog').fire('load');
  await again;
});

test('a file already inserted is waited for (once it has loaded, at once) and never inserted twice', async () => {
  const { K, scripts, byName } = page();
  const first = K.load(['handoff']);
  const n = scripts.length;
  let second = false;
  const p2 = K.load(['handoff']).then(() => { second = true; });
  assert.equal(scripts.length, n);
  await tick(); assert.equal(second, false);
  byName('handoff').fire('load');
  await Promise.all([first, p2]);
  assert.equal(byName('handoff').dataset.loaded, '1');
});
