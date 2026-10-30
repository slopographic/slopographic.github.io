// Slop Projects board rules: moving a card within and between columns writes only what changes, column edits (add,
// reorder, remove with its cards moved), WIP over the limit, done columns, filters and the list view's sort.
// Covers: projects/js/core/board.js
// Run: node --test tests/node/projects-board.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './projects-env.mjs';

/** deepEqual on a plain copy (values made in the vm context have other prototypes). */
const eq = (a, b, m) => assert.deepEqual(plain(a), b, m);

const { P } = await load();
const B = P.board;
const t = (id, column, order, o = {}) => ({ id, title: id, column, order, tags: [], ...o });
const board = () => [t('a', 'todo', 0), t('b', 'todo', 1), t('c', 'todo', 2), t('x', 'doing', 0), t('y', 'doing', 1)];
const project = { columns: B.DEFAULT_COLUMNS.map((c) => ({ ...c })) };

test('moving down a column renumbers only the cards that changed place', () => {
  eq((B.move(board(), 'a', 'todo', 2)), [{ id: 'b', column: 'todo', order: 0 }, { id: 'c', column: 'todo', order: 1 }, { id: 'a', column: 'todo', order: 2 }]);
  eq((B.move(board(), 'c', 'todo', 1)), [{ id: 'c', column: 'todo', order: 1 }, { id: 'b', column: 'todo', order: 2 }]);
  eq((B.move(board(), 'b', 'todo', 1)), []);   // dropped where it was
});

test('moving to another column places the card and closes the gap it left', () => {
  eq((B.move(board(), 'b', 'doing', 1)), [{ id: 'b', column: 'doing', order: 1 }, { id: 'y', column: 'doing', order: 2 }, { id: 'c', column: 'todo', order: 1 }]);
  eq((B.move(board(), 'a', 'done')), [{ id: 'a', column: 'done', order: 0 }, { id: 'b', column: 'todo', order: 0 }, { id: 'c', column: 'todo', order: 1 }]);
  eq((B.move(board(), 'x', 'todo', 99)).find((m) => m.id === 'x'), { id: 'x', column: 'todo', order: 3 });
  eq((B.move(board(), 'nope', 'todo', 0)), []);
});

test('columns: add with a unique id, refuse blanks and a 13th, reorder', () => {
  const a = B.addColumn(project.columns, 'To do');
  assert.equal(a.ok, true);
  assert.equal(a.value[3].id, 'to-do');
  assert.equal(B.addColumn(project.columns, '  ').ok, false);
  let many = project.columns;
  for (let i = 0; i < 9; i++) many = B.addColumn(many, `C${i}`).value;
  assert.equal(B.addColumn(many, 'one more').ok, false);
  eq(B.moveColumn(project.columns, 'done', 0).map((c) => c.id), ['done', 'todo', 'doing']);
  eq(B.moveColumn(project.columns, 'todo', 9).map((c) => c.id), ['doing', 'done', 'todo']);
});

test('removing a column moves its cards to the end of the one before it; the last column stays', () => {
  const r = B.removeColumn(project.columns, board(), 'doing');
  eq(r.columns.map((c) => c.id), ['todo', 'done']);
  assert.equal(r.into, 'todo');
  eq((r.moves), [{ id: 'x', column: 'todo', order: 3 }, { id: 'y', column: 'todo', order: 4 }]);
  assert.equal(B.removeColumn(project.columns, board(), 'todo').into, 'doing');
  assert.equal(B.removeColumn([{ id: 'only', name: 'Only' }], [], 'only').ok, false);
});

test('WIP: a column over its limit is flagged; done is the marked column (else the last)', () => {
  eq((B.wip(board(), { id: 'todo', wip: 2 })), { count: 3, limit: 2, over: true });
  eq((B.wip(board(), { id: 'doing' })), { count: 2, limit: 0, over: false });
  assert.equal(B.isDone(project, { column: 'done' }), true);
  assert.equal(B.isDone({ columns: [{ id: 'a' }, { id: 'b' }] }, { column: 'b' }), true);
  assert.equal(B.columnOf(project, { column: 'gone' }), 'todo');
});

test('filters: assignee (or nobody), tag and text', () => {
  const tasks = [t('Design', 'todo', 0, { assignee: 'Ada', tags: ['web'] }), t('Copy', 'todo', 1, { assignee: 'Ben', description: 'home page words' }), t('Misc', 'todo', 2)];
  eq(B.filter(tasks, { assignee: 'Ada' }).map((x) => x.id), ['Design']);
  eq(B.filter(tasks, { assignee: '-' }).map((x) => x.id), ['Misc']);
  eq(B.filter(tasks, { tag: 'web' }).map((x) => x.id), ['Design']);
  eq(B.filter(tasks, { text: 'HOME' }).map((x) => x.id), ['Copy']);
  eq(B.peopleOf({ people: ['Chen'] }, tasks), ['Ada', 'Ben', 'Chen']);
  eq(B.tagsOf(tasks), ['web']);
});

test('the list sort: by date with empty values last both ways, by priority, by column place', () => {
  const tasks = [t('a', 'done', 0, { end: '2026-11-03', priority: 'low' }), t('b', 'todo', 0, { priority: 'high' }), t('c', 'doing', 0, { end: '2026-11-01', priority: 'medium' })];
  eq(B.sort(tasks, 'end', 'asc', project).map((x) => x.id), ['c', 'a', 'b']);
  eq(B.sort(tasks, 'end', 'desc', project).map((x) => x.id), ['a', 'c', 'b']);
  eq(B.sort(tasks, 'priority', 'asc', project).map((x) => x.id), ['b', 'c', 'a']);
  eq(B.sort(tasks, 'column', 'asc', project).map((x) => x.id), ['b', 'c', 'a']);
  eq(B.sort(tasks, 'title', 'desc', project).map((x) => x.id), ['c', 'b', 'a']);
  eq((B.progress({ checklist: [{ text: 'x', done: true }, { text: 'y' }] })), { done: 1, total: 2 });
});
