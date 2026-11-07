// SlopLabel tab state (label/js/io/tabstate.js): a tab keeps its label, undo history, selection, record, prompts, unsaved
// flag and view through JSON, and a damaged state is refused or repaired.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelEnv, plain } from './label-env.mjs';

const env = await labelEnv();
const G = (n) => env.get(n);

function tabWithEdits(n) {
  const T = G('tabRecord')(G('normalizeDoc')(G('newDoc')({ name: 'Shelf' })), { label: 'Open' });
  for (let i = 0; i < n; i++) {
    T.doc.label.w = 50 + i;
    T.hist.push(T.doc, 'Width ' + i, '');
  }
  return T;
}

test('a tab survives JSON with its label, selection, record, prompts, dirty flag and view', () => {
  const T = tabWithEdits(0);
  const o = G('makeObject')('text', { content: 'Hello', x: 2, y: 3 });
  T.doc.objects.push(o);
  T.hist.push(T.doc, 'Add text', '');
  T.sel = [o.id];
  T.rec = 0;
  T.prompts = { Lot: 'A-7' };
  T.dirty = true;
  T.view = { tool: 'hand', zoom: 2.5, panX: 33, panY: 21 };
  const state = JSON.parse(JSON.stringify(G('tabToState')(T)));
  const back = G('stateToTab')(state);
  assert.equal(back.doc.objects.length, 1);
  assert.equal(back.doc.objects[0].content, 'Hello');
  assert.deepEqual(plain(back.sel), [o.id]);
  assert.deepEqual(plain(back.prompts), { Lot: 'A-7' });
  assert.equal(back.dirty, true);
  assert.deepEqual(plain(back.view), { tool: 'hand', zoom: 2.5, panX: 33, panY: 21 });
  assert.equal(back.doc.name, 'Shelf');
});

test('the undo history comes back, so an undo still works after a reload', () => {
  const T = tabWithEdits(4);
  const state = JSON.parse(JSON.stringify(G('tabToState')(T)));
  const back = G('stateToTab')(state);
  assert.equal(back.hist.canUndo, true);
  assert.equal(back.hist.undoLabel, 'Width 3');
  const before = back.doc.label.w;
  const d = back.hist.undo(back.doc);
  assert.ok(d);
  assert.equal(d.label.w, before - 1);
});

test('a history longer than the saved window keeps its current step', () => {
  const T = tabWithEdits(130);
  T.hist.undo(T.doc); T.hist.undo(T.doc); // two steps back
  const state = G('tabToState')(T);
  assert.equal(state.hist.stack.length, 100);
  assert.equal(state.hist.stack[state.hist.idx].s, T.hist.stack[T.hist.idx].s, 'the current step is the same snapshot');
});

test('a state from another version, or without a label, is refused', () => {
  assert.throws(() => G('stateToTab')({ v: 9, doc: {} }), /another version/);
  assert.throws(() => G('stateToTab')({ v: 1, doc: { name: 'x' } }), /another version/);
  assert.throws(() => G('stateToTab')(null), /another version/);
});

test('a damaged undo history is replaced by a fresh one; bad selection and view are dropped', () => {
  const state = JSON.parse(JSON.stringify(G('tabToState')(tabWithEdits(2))));
  state.hist = { idx: 9, stack: [{ s: 1 }] };
  state.sel = ['missing'];
  state.view = { tool: 'select', zoom: -1, panX: 0, panY: 0 };
  state.rec = -4;
  const T = G('stateToTab')(state);
  assert.equal(T.hist.stack.length, 1);
  assert.equal(T.hist.canUndo, false);
  assert.deepEqual(plain(T.sel), []);
  assert.equal(T.view, null);
  assert.equal(T.rec, 0);
});

test('a new tab record starts with one undo step and no view', () => {
  const T = G('tabRecord')(G('newDoc')({}), { dirty: false, driveId: 'drv-1' });
  assert.equal(T.hist.stack.length, 1);
  assert.equal(T.view, null);
  assert.equal(T.driveId, 'drv-1');
  assert.equal(T.dirty, false);
});
