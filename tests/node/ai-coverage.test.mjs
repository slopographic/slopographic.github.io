// The AI coverage audit (tools/ai-coverage.mjs → shared/commands/AI-COVERAGE.md): the file is up to date, no app loses
// what the assistant can do there (the ratchet, tests/node/ai-coverage.baseline.json), and every app has the full suite.
// Covers: tools/ai-coverage.mjs, shared/ai/app-skills.js
// Run: node --test tests/node/ai-coverage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { scan, render, skills, toolsIn, kindOf, levels, losses, ROOT, OUT, SKILLS, BASELINE } from '../../tools/ai-coverage.mjs';
import vm from 'node:vm';

const rows = scan();
const baseline = JSON.parse(readFileSync(path.join(ROOT, BASELINE), 'utf8'));

test('AI-COVERAGE.md is up to date (run node tools/ai-coverage.mjs)', () => {
  assert.equal(readFileSync(path.join(ROOT, OUT), 'utf8'), render(rows));
});

// The ratchet: no app loses a kind of command, its state, its snapshot or being reachable from another app, and a new
// app arrives with the full suite. When an app gains something, the baseline is raised with it (node tools/ai-coverage.mjs
// --baseline, which refuses to lower anything), so it cannot be lost later without this test failing.
test('no app loses AI coverage (tests/node/ai-coverage.baseline.json)', () => {
  const lost = rows.filter((r) => baseline[r.id]).map((r) => [r.id, losses(levels(r), baseline[r.id])]).filter(([, l]) => l.length);
  assert.equal(lost.length, 0, 'apps that lost coverage: ' + lost.map(([id, l]) => `${id}: ${l.join(', ')}`).join('; '));
});
test('a new app has the full suite: create, add, edit, export, state, snapshot, reachable from another app', () => {
  for (const r of rows.filter((x) => !baseline[x.id])) assert.ok(r.full, `${r.name} is new and has no full AI suite: ${JSON.stringify(levels(r))}`);
});
test('every app has the full suite (AI-COVERAGE.md: Full suite: N of N apps)', () => {
  const short = rows.filter((r) => !r.full).map((r) => `${r.name}: ${JSON.stringify(levels(r))}`);
  assert.equal(short.length, 0, 'apps without the full AI suite: ' + short.join('; '));
  assert.match(readFileSync(path.join(ROOT, OUT), 'utf8'), new RegExp(`Full suite: ${rows.length} of ${rows.length} apps`));
});
test('the baseline records what the apps have now (raise it: node tools/ai-coverage.mjs --baseline)', () => {
  for (const r of rows) assert.deepEqual(baseline[r.id], levels(r), `${r.id} changed: run node tools/ai-coverage.mjs --baseline`);
});
test('the cross-app columns are read from the apps: state, snapshot, driven', () => {
  const q = rows.find((r) => r.id === 'quotes');
  assert.equal(q.state, 'records'); assert.ok(q.snapshot); assert.equal(q.driven, true);
  assert.equal(rows.find((r) => r.id === 'photoslop').state, 'app');
  assert.deepEqual(losses({ create: true, add: true, edit: true, export: false, state: 'page', snapshot: 'page', driven: true }, { create: true, add: true, edit: true, export: true, state: 'app', snapshot: 'page', driven: true }), ['export', 'state app → page']);
});

test('commands are read from the four ways apps write them, and sorted by what they do', () => {
  const src = "const a = [{ name: 'x', type: 'number' }];\nadd('new_presentation', 'New', a);\n['add_column', 'Add', [a]],\n{ id: 'rs.ai.set-size', tool: 'set_size', args: a }\n{ id: 'co.look', title: 'Look', args: a }";
  assert.deepEqual(toolsIn(src).sort(), ['add_column', 'look', 'new_presentation', 'set_size']);
  assert.deepEqual(toolsIn("add('x_y', 'no schemas here')"), []);
  assert.deepEqual(['new_document', 'build_presentation', 'new_layer', 'insert_table', 'use_tool', 'add_noise', 'set_text', 'export_document', 'list_tools', 'undo'].map(kindOf),
    ['create', 'create', 'add', 'add', 'add', 'edit', 'edit', 'export', null, null]);
});

test('shared/ai/app-skills.js (what the AI panel says each app can make) is generated from the same scan and up to date', () => {
  const text = readFileSync(path.join(ROOT, SKILLS), 'utf8');
  assert.equal(text, skills(rows));
  const w = {}; w.window = w; vm.runInNewContext(text, w);
  const S = w.SlopAIKit.appSkills;
  assert.deepEqual([...S.slides.create], ['build_presentation', 'new_presentation']);   // (an array from the vm's realm) assert.ok(S.slides.ops.includes('outline-to-presentation'));
  assert.ok(S.docs.create.includes('build_document')); assert.ok(S.docs.ops.includes('outline-to-document'));
  assert.ok(S.tables.ops.includes('table-data-to-spreadsheet'));
  assert.ok(['add_svg_layer', 'draw_shape', 'use_tool'].every((t) => S.photoslop.add.includes(t)));
  assert.ok(S.invoices.create.includes('create_invoice'));
  for (const v of Object.values(S)) assert.ok(v.add.length <= 8, 'at most 8 add tools per app');
  assert.ok(text.split('\n').length < 120, 'one line per app');
});
