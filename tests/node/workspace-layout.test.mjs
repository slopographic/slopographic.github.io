// SlopWorkspace.gridFor: how many columns and rows 1 to 4 panes take in each layout (shared/workspace/workspace.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { gridFor, LAYOUTS } = createRequire(import.meta.url)('../../shared/workspace/workspace.js');

test('one pane fills the host whatever the layout', () => {
  for (const l of LAYOUTS) assert.deepEqual(gridFor(1, l), { cols: 1, rows: 1 }, l);
});

test('columns put the panes side by side, rows stack them', () => {
  assert.deepEqual(gridFor(2, 'columns'), { cols: 2, rows: 1 });
  assert.deepEqual(gridFor(3, 'columns'), { cols: 3, rows: 1 });
  assert.deepEqual(gridFor(4, 'columns'), { cols: 4, rows: 1 });
  assert.deepEqual(gridFor(2, 'rows'), { cols: 1, rows: 2 });
  assert.deepEqual(gridFor(3, 'rows'), { cols: 1, rows: 3 });
  assert.deepEqual(gridFor(4, 'rows'), { cols: 1, rows: 4 });
});

test('a grid takes 2 by 2 for four panes, and two columns for two', () => {
  assert.deepEqual(gridFor(2, 'grid'), { cols: 2, rows: 1 });
  assert.deepEqual(gridFor(3, 'grid'), { cols: 2, rows: 2 });
  assert.deepEqual(gridFor(4, 'grid'), { cols: 2, rows: 2 });
});

test('the count is kept to 1 to 4, and an unknown layout is columns', () => {
  assert.deepEqual(gridFor(0, 'columns'), { cols: 1, rows: 1 });
  assert.deepEqual(gridFor(9, 'columns'), { cols: 4, rows: 1 });
  assert.deepEqual(gridFor('3', 'columns'), { cols: 3, rows: 1 });
  assert.deepEqual(gridFor(2, 'diagonal'), { cols: 2, rows: 1 });
});
