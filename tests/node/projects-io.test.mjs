// Slop Projects files: the CSV of the tasks (board order, quoted cells, formulas kept as text) and the JSON backup
// (written without the store's stamps, read back with new ids that dependencies follow, bad parts left out with a note,
// loops dropped). The sample reads like a backup and its dates keep every dependency. Also the shared record shapes:
// a project and a task pass SlopData's schema, and a bad one is refused.
// Covers: projects/js/core/io.js, projects/js/core/sample.js
// Run: node --test tests/node/projects-io.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './projects-env.mjs';

/** deepEqual on a plain copy (values made in the vm context have other prototypes). */
const eq = (a, b, m) => assert.deepEqual(plain(a), b, m);
import { load as loadData } from './data-env.mjs';

const { P } = await load();
const IO = P.io;
const project = { id: 'p1', name: 'Shop / fit-out', columns: [{ id: 'todo', name: 'To do' }, { id: 'done', name: 'Done', done: true }], people: ['Ada'], createdAt: 1, version: 3 };
const tasks = [
  { id: 't2', projectId: 'p1', title: 'Paint, "white"', column: 'done', order: 0, tags: [], checklist: [], deps: ['t1'], createdAt: 5 },
  { id: 't1', projectId: 'p1', title: '=SUM(A1)', column: 'todo', order: 0, assignee: 'Ada', priority: 'high', start: '2026-11-02', end: '2026-11-03',
    tags: ['site', 'build'], checklist: [{ text: 'a', done: true }, { text: 'b', done: false }], deps: [], customerId: 'c1', description: 'Line one\nline two' },
];
let n = 0;
const newId = () => `n${++n}`;

test('the CSV lists the tasks in board order with quoted cells and formulas kept as text', () => {
  const text = IO.csv(project, tasks, new Map([['c1', 'Ada Ltd']]));
  const lines = text.split('\r\n');
  assert.equal(lines[0], 'Title,Column,Assignee,Priority,Start,End,Due,Tags,Checklist,Depends on,Customer,Description');
  assert.equal(lines[1], `"'=SUM(A1)",To do,Ada,high,2026-11-02,2026-11-03,,"site, build",1/2,,Ada Ltd,"Line one\nline two"`);
  assert.equal(lines[2], `"Paint, ""white""",Done,,,,,,,,"'=SUM(A1)",,`);
  assert.ok(text.endsWith('\r\n'));
  assert.equal(IO.fileName(project, 'csv'), 'Shop fit-out.csv');
});

test('a backup leaves out the store stamps and reads back with new ids that dependencies follow', () => {
  const b = IO.backup(project, tasks, new Date('2026-11-01T00:00:00Z'));
  assert.equal(b.format, 'slop-projects');
  assert.equal(b.project.createdAt, undefined);
  assert.equal(b.tasks[0].id, 't1');
  const r = IO.read(JSON.parse(JSON.stringify(b)), newId, new Set());
  assert.equal(r.ok, true);
  assert.notEqual(r.project.id, 'p1');
  const paint = r.tasks.find((x) => x.title.startsWith('Paint')), sum = r.tasks.find((x) => x.title === '=SUM(A1)');
  eq((paint.deps), [sum.id]);
  assert.equal(paint.projectId, r.project.id);
  assert.equal(sum.customerId, undefined);   // no such customer here
  eq((sum.checklist), [{ text: 'a', done: true }, { text: 'b', done: false }]);
});

test('reading refuses what is not a backup, and repairs what it can with notes', () => {
  assert.equal(IO.readText('not json', newId).ok, false);
  assert.equal(IO.read({ format: 'other' }, newId).ok, false);
  assert.equal(IO.read({ project: { name: 'x' } }, newId).ok, false);
  assert.match(IO.read({ version: 9, project: { name: 'x' }, tasks: [] }, newId).message, /newer version/);
  const r = IO.read({ project: { name: ' Fix ', columns: [{ id: 'a', name: 'A' }, { id: 'a', name: 'dup' }], start: 'soon' },
    tasks: [{ id: '1', title: 'One', column: 'zzz', start: '2026-11-05', deps: ['2'] }, { id: '2', title: 'Two', deps: ['1'] }, { title: '' }] }, newId);
  assert.equal(r.ok, true);
  assert.equal(r.project.name, 'Fix');
  eq((r.project.columns), [{ id: 'a', name: 'A' }]);
  assert.equal(r.project.start, undefined);
  assert.equal(r.tasks[0].column, 'a');
  assert.equal(r.tasks[0].start, undefined);   // a start with no end is dropped
  assert.equal(r.tasks.filter((x) => x.deps.length).length, 1);   // the loop between One and Two is broken
  assert.equal(r.notes.length, 2);
});

test('the sample reads as a backup, keeps every dependency and has one task without dates', () => {
  const r = IO.read(P.sample('2026-11-05'), newId);
  assert.equal(r.ok, true);
  assert.equal(r.tasks.length, 10);
  eq((P.deps.violations(r.tasks)), []);
  assert.equal(r.tasks.filter((x) => !x.start).length, 1);
  assert.equal(r.project.start, '2026-10-26');
});

test('SlopData accepts a project and its tasks, and refuses bad ones', async () => {
  const S = await loadData();
  const r = IO.read(P.sample('2026-11-05'), newId);
  const pr = S.schema.prepare('projects', r.project);
  eq((pr.errors), []);
  for (const x of r.tasks) eq((S.schema.prepare('projectTasks', x).errors), [], x.title);
  const bad = (name, rec) => S.schema.prepare(name, rec).errors.map((e) => e.field + ' ' + e.message).join('; ');
  assert.match(bad('projects', { name: 'x', columns: [] }), /columns must be a list of 1 to 12/);
  assert.match(bad('projects', { name: 'x', columns: [{ id: 'a', name: 'A', colour: 'red' }] }), /columns\[0\]\.colour is not a field/);
  assert.match(bad('projectTasks', { id: 'q', projectId: 'p', title: 'x', column: 'a', start: '2026-11-02' }), /both a start and an end/);
  assert.match(bad('projectTasks', { id: 'q', projectId: 'p', title: 'x', column: 'a', start: '2026-11-03', end: '2026-11-02' }), /end date is before/);
  assert.match(bad('projectTasks', { id: 'q', projectId: 'p', title: 'x', column: 'a', deps: ['q'] }), /cannot depend on itself/);
  assert.match(bad('projectTasks', { id: 'q', projectId: 'p', title: 'x', column: 'a', checklist: [{ done: true }] }), /checklist\[0\]\.text is required/);
  assert.ok(S.store.DB_VERSION >= 12, 'the database version that adds the project stores');
});
