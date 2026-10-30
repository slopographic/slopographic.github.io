// Slop Workflows: the workflow document (.slopflow files and ?flow= links, macro steps, a version), the step checks
// against the kinds each step makes, the templates, and a run through the one runner with fake operations.
// Run: node --test tests/node/workflows-flow.test.mjs
// Covers: shared/ops/flowdoc.js, workflows/js/core/compat.js, workflows/js/core/plan.js, workflows/js/core/templates.js, convert/js/core/chain-run.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui-i18n-en.mjs';   // the shared components' words (shared/i18n/ui), as a page has them
import { createRequire } from 'node:module';
import * as R from '../../shared/ops/all.js';
import { check, firstProblem } from '../../workflows/js/core/compat.js';
import { plan, runWorkflow } from '../../workflows/js/core/plan.js';
import { TEMPLATES, fromTemplate } from '../../workflows/js/core/templates.js';

const F = createRequire(import.meta.url)('../../shared/ops/flowdoc.js');
const doc = (steps, name = 'T') => F.normalize({ kind: 'slopflow', v: 1, name, steps }).doc;

test('a workflow document keeps op and macro steps, drops what is not one, and has a version', () => {
  const { doc: d, errors } = F.normalize({ kind: 'slopflow', v: 1, name: '  My   flow ', steps: [
    { kind: 'op', id: 'resize.image', options: { width: 1080, bad: { x: 1 }, 'no space': 1 }, keep: true },
    { kind: 'macro', id: 'macro:photoslop:m1', app: 'photoslop', macroId: 'm1', options: { strength: 3 } },
    { kind: 'macro', id: 'x' }, { nothing: true }] });
  assert.equal(d.name, 'My flow');
  assert.equal(d.v, 1);
  assert.deepEqual(d.steps.map((s) => [s.kind, s.id]), [['op', 'resize.image'], ['macro', 'macro:photoslop:m1']]);
  assert.deepEqual(d.steps[0].options, { width: 1080 });
  assert.equal(d.steps[0].keep, true);
  assert.deepEqual([d.steps[1].app, d.steps[1].macroId], ['photoslop', 'm1']);
  assert.equal(errors.length, 2);
  assert.ok(d.steps.every((s) => s.uid));
  assert.equal(F.normalize({ kind: 'other' }).doc, null);
  assert.match(F.normalize({ kind: 'slopflow', v: 9, steps: [] }).errors[0], /newer/);
});

test('.slopflow text round trip: no ids, same steps; bad text says so', () => {
  const d = doc([{ id: 'to-jpg', options: { quality: 80 } }, { id: 'zip-files', keep: true }]);
  const text = F.toText(d);
  assert.ok(!text.includes('"uid"'));
  const back = F.fromText(text).doc;
  assert.equal(F.toText(back), text);
  assert.match(F.fromText('nope').errors[0], /not JSON/);
});

test('a link round trip (compressed), and a damaged link', async () => {
  const d = doc(TEMPLATES[0].steps.map((s) => ({ id: s.id, options: s.options })), 'Product photos');
  const s = await F.encode(d);
  assert.match(s, /^z[A-Za-z0-9_-]+$/);
  assert.ok(s.length < F.toText(d).length);
  assert.equal(F.toText((await F.decode(s)).doc), F.toText(d));
  assert.equal((await F.decode('zAAAA')).doc, null);
});

test('steps are checked against the kinds the step before makes', () => {
  const d = doc([{ id: 'images-to-pdf' }, { id: 'resize.image' }, { id: 'pdf.compress' }]);
  const r = check(d.steps, ['png', 'jpg'], R);
  assert.deepEqual(r.map((x) => x.ok), [true, false, true]);
  assert.match(r[1].message, /^Resize cannot take PDF, which step 1 \(Images to PDF\) makes\. It takes PNG, JPG/);
  assert.deepEqual(r[0].out, ['pdf']);
  assert.equal(firstProblem(r).index, 1);
  const files = check(doc([{ id: 'resize.image' }]).steps, ['pdf'], R);
  assert.match(files[0].message, /cannot take PDF files/);
  const unknown = check(doc([{ id: 'files.rename' }, { id: 'watermark.apply' }]).steps, [], R);
  assert.ok(unknown.every((x) => x.ok));   // "any file" first: not judged until a kind is known
  const pw = check(doc([{ id: 'pdf-protect' }]).steps, ['pdf'], R);
  assert.equal(pw[0].message, 'Type a password.');
  assert.equal(check(doc([{ id: 'pdf-protect', options: { password: 'a', confirm: 'a' } }]).steps, ['pdf'], R)[0].ok, true);
  assert.equal(check(doc([{ id: 'gone.op' }]).steps, ['png'], R)[0].ok, false);
});

test('every template uses operations of the registry and fits together (Protect and send waits for its password)', () => {
  assert.deepEqual(TEMPLATES.map((t) => t.name), ['Product photos', 'Photos for the web', 'Scans to one PDF', 'Protect and send']);
  for (const t of TEMPLATES) {
    const d = fromTemplate(t, F);
    const r = check(d.steps, [], R);
    const bad = r.filter((x) => !x.ok).map((x) => x.message);
    assert.deepEqual(bad, t.id === 'protect-send' ? ['Type a password.'] : [], t.id);
    for (const s of d.steps) assert.ok(R.validateOptions(R.byId(s.id), s.options).ok, s.id);
  }
  assert.deepEqual(check(fromTemplate(TEMPLATES[0], F).steps, ['jpg'], R).at(-1).out, ['jpg']);
});

test('plan and run: each step with its checked options and its kind, kept in-between files, passwords from this visit only', async () => {
  const seen = [];
  const fake = (id, ext, mode = 'each') => ({ id, label: id, from: ['*'], ext, mode, options: [{ key: 'n', type: 'number', min: 0, max: 9, value: 1 }],
    run: async (files, o) => { seen.push([id, files.length, o.n]); return files.map((f) => ({ name: f.name + '.' + (ext || f.kind), blob: new Blob([String(o.n)]) })); } });
  R.register([fake('t.a', 'aa'), fake('t.b', '', 'combine'), { ...fake('t.c', 'cc'), options: [{ key: 'password', type: 'password', label: 'P' }], check: (o) => (o.password ? '' : 'pw') }], { app: 'test', label: 'Test' });
  const d = doc([{ id: 't.a', options: { n: 12 } }, { id: 't.b', keep: true }, { id: 't.c' }]);
  const p = plan(d, R, { secrets: { [d.steps[2].uid]: { password: 'x' } } });
  assert.deepEqual(p.options.map((o) => o.n ?? o.password), [9, 1, 'x']);
  assert.ok(p.notes[0].includes('above the maximum'));
  assert.equal(p.steps[1].to('aa', {}), 'aa');
  const items = [{ id: 1, name: 'one', kind: 'png', file: new Blob(['1']) }, { id: 2, name: 'two', kind: 'png', file: new Blob(['2']) }];
  const res = await runWorkflow(d, items, R, { secrets: { [d.steps[2].uid]: { password: 'x' } } });
  assert.deepEqual(seen, [['t.a', 1, 9], ['t.a', 1, 9], ['t.b', 2, 1], ['t.c', 1, undefined], ['t.c', 1, undefined]]);
  assert.deepEqual(res.outputs.map((o) => [o.name, o.kind]), [['one.aa.aa.cc', 'cc'], ['two.aa.aa.cc', 'cc']]);
  assert.deepEqual(res.middles.map((m) => m.step), [2, 2]);
  await assert.rejects(runWorkflow(doc([{ id: 'gone.op' }]), items, R), /not available/);
});

test('a cancelled run stops before the next file and says Cancelled', async () => {
  const ac = new AbortController();
  R.register([{ id: 't.slow', label: 'slow', from: ['*'], mode: 'each', options: [], run: async (files) => { ac.abort(); return files.map((f) => ({ name: f.name, blob: f.file })); } }], { app: 'test' });
  const items = [1, 2, 3].map((id) => ({ id, name: 'f' + id, kind: 'txt', file: new Blob(['x']) }));
  const units = [];
  const res = await runWorkflow(doc([{ id: 't.slow' }]), items, R, { signal: ac.signal, onUnit: (u) => units.push(u.state) });
  assert.equal(res.cancelled, true);
  assert.deepEqual(res.errors.map((e) => e.message), ['Cancelled', 'Cancelled']);
  assert.deepEqual(units, ['run', 'done', 'error', 'error']);
});
