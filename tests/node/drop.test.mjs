// Node tests for shared/drop (SlopDrop) on the intake pipeline (shared/intake): the accept and refuse rules as a drop applies them, and attach() with a missing
// zone (returns null, no throw) and with a missing target (the null is skipped; with none left the zone takes drops).
// The three classic scripts run in a vm context with a small fake DOM (elements record their listeners), so no browser
// is needed. Run with: node tests/run.mjs drop   (or: node --test tests/node/drop.test.mjs)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/** A minimal element: classes, children, and listeners that can be counted (and fired by the test). */
function fakeElement(tag = 'div') {
  const listeners = {}, classes = new Set();
  const node = {
    tagName: tag.toUpperCase(), className: '', textContent: '', title: '', hidden: false, style: {}, dataset: {},
    children: [], isConnected: true, value: '', files: null,
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c),
    },
    append(...n) { this.children.push(...n); },
    replaceChildren(...n) { this.children = n; },
    setAttribute() {}, remove() { this.isConnected = false; }, click() {},
    contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    scrollIntoView() {}, offsetWidth: 0,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    listenerCount: (type) => (listeners[type] || []).length,
    fire(type, e) { for (const f of listeners[type] || []) f(Object.assign(e, { currentTarget: node })); },
  };
  return node;
}

/** A fresh SlopDrop in a vm context: rules, panel and drop, run in order, over a fake document. */
function load() {
  const win = new EventTarget(), docEvents = new EventTarget();
  const document = {
    addEventListener: (...a) => docEvents.addEventListener(...a),
    removeEventListener: (...a) => docEvents.removeEventListener(...a),
    dispatchEvent: (e) => docEvents.dispatchEvent(e),
    documentElement: { dataset: {} },
    createElement: (tag) => fakeElement(tag),
    getElementById: () => null,
    head: { appendChild() {} },
    body: fakeElement('body'),
  };
  const sandbox = {
    console, document, CustomEvent, File, AbortController, TextEncoder,
    addEventListener: (...a) => win.addEventListener(...a),
    removeEventListener: (...a) => win.removeEventListener(...a),
    dispatchEvent: (e) => win.dispatchEvent(e),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const files = ['shared/intake/rules.js', 'shared/intake/normalize.js', 'shared/intake/pipeline.js', 'shared/intake/intake.js',
    'shared/intake/sources.js', 'shared/drop/panel.js', 'shared/drop/drop.js'];
  for (const f of files) {
    vm.runInContext(read(f), sandbox, { filename: f });
  }
  return { SD: sandbox.SlopDrop, document };
}
/** Values made inside the vm come from another realm: copy them before comparing. */
const plain = (v) => JSON.parse(JSON.stringify(v));
const picture = (name, size = 100) => ({ name, type: 'image/png', size });
const text = (name) => ({ name, type: 'text/plain', size: 5 });
const RULES = { types: ['image/*'], exts: ['.png'], noun: 'a picture' };
/** A drop event as the browser sends it: a Files drag with the given files. */
const dropEvent = (files) => ({
  type: 'drop', clientX: 3, clientY: 4, preventDefault() {},
  dataTransfer: { types: ['Files'], files, items: [] },
});

describe('accept and refuse, through a drop', () => {
  test('pictures are taken, a text file and an empty picture are refused with the reason', async () => {
    const { SD } = load();
    const zone = fakeElement('div');
    const seen = [];
    const summary = await new Promise((done) => {
      SD.attach(zone, {
        accept: RULES, toast: false,
        process: async (f) => { seen.push(f.name); return f.name; },
        done: (s) => done(s),
      });
      zone.fire('drop', dropEvent([picture('a.png'), text('notes.txt'), picture('empty.png', 0)]));
    });
    assert.deepEqual(seen, ['a.png']);
    assert.deepEqual(plain(summary.added.map(({ name, value }) => ({ name, value }))), [{ name: 'a.png', value: 'a.png' }]);
    assert.deepEqual(plain(summary.skipped), [
      { name: 'notes.txt', reason: 'notes.txt is not a picture' },
      { name: 'empty.png', reason: 'empty.png is empty' },
    ]);
  });

  test('limit: 1 takes the first file and refuses the rest with a reason', async () => {
    const { SD } = load();
    const zone = fakeElement('div');
    const seen = [];
    const summary = await new Promise((done) => {
      SD.attach(zone, { accept: RULES, limit: 1, toast: false, process: async (f) => { seen.push(f.name); return 1; }, done });
      zone.fire('drop', dropEvent([picture('one.png'), picture('two.png')]));
    });
    assert.deepEqual(seen, ['one.png']);
    assert.equal(summary.skipped[0].name, 'two.png');
    assert.equal(summary.skipped[0].reason, 'two.png is not taken: only one file at a time');
  });

  test('a reader error is refused as a row, and the batch carries on', async () => {
    const { SD } = load();
    const zone = fakeElement('div');
    const summary = await new Promise((done) => {
      SD.attach(zone, {
        accept: RULES, toast: false, done,
        process: async (f) => { if (f.name === 'bad.png') throw new Error('could not be decoded'); return 'ok'; },
      });
      zone.fire('drop', dropEvent([picture('bad.png'), picture('good.png')]));
    });
    assert.deepEqual(plain(summary.added.map((a) => a.name)), ['good.png']);
    assert.equal(summary.skipped[0].reason, 'bad.png could not be decoded');
  });
  test('the drag label: a take-everything app (any: true) is never told a type will be refused', () => {
    const { SD } = load();
    assert.equal(SD.rules.dragLabel(['image/png', 'application/x-msdownload'], { any: true }), 'Drop to add 2 files');
    assert.equal(SD.rules.dragLabel(['text/plain'], RULES), 'Drop to add 1 file (1 will be refused)');
  });
});

describe('attach with a missing zone or target', () => {
  test('a missing zone returns null and does not throw (null, undefined)', () => {
    const { SD } = load();
    assert.equal(SD.attach(null, { accept: RULES, process: async () => 1 }), null);
    assert.equal(SD.attach(undefined, {}), null);
    assert.equal(SD.attach(null), null);
  });

  test('a null target is skipped; the real target takes the drop', async () => {
    const { SD } = load();
    const zone = fakeElement('div');
    const stage = fakeElement('section');
    let handle;
    assert.doesNotThrow(() => { handle = SD.attach(zone, { accept: RULES, toast: false, targets: [null, stage], process: async () => 1 }); });
    assert.ok(handle && typeof handle.choose === 'function', 'a handle is returned');
    assert.equal(stage.listenerCount('drop'), 2, 'the stage takes the drops (its end-of-drag mark, then the batch)');
    assert.equal(stage.listenerCount('dragover'), 1);
    assert.equal(zone.listenerCount('drop'), 0, 'the zone is not a target when another target is left');
  });

  test('when every target is missing, the zone takes the drops', async () => {
    const { SD } = load();
    const zone = fakeElement('div');
    const summary = await new Promise((done) => {
      SD.attach(zone, { accept: RULES, toast: false, targets: [null, undefined], process: async () => 'x', done });
      zone.fire('drop', dropEvent([picture('z.png')]));
    });
    assert.equal(summary.added.length, 1);
  });

  test('destroy removes the listeners it added', () => {
    const { SD } = load();
    const zone = fakeElement('div');
    const handle = SD.attach(zone, { accept: RULES, toast: false, process: async () => 1 });
    assert.equal(zone.listenerCount('drop'), 2);
    handle.destroy();
    assert.equal(zone.listenerCount('drop'), 0);
    assert.equal(zone.listenerCount('dragover'), 0);
  });
});
