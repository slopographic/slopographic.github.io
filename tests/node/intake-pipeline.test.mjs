// Node tests for the one intake pipeline (shared/intake/normalize.js and shared/intake/pipeline.js, on
// shared/intake/rules.js): normalize (drops, pastes, Drive records, converted results, handles), accept and the reasons,
// the gates in order, the first-use notice once per batch, the bounded pool, the before and after hooks, the events, and
// batches queueing up. The pure scripts run in a vm context with a fake env. Run with: node tests/run.mjs intake
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function load() {
  const ctx = { console, File, Blob, TextEncoder, AbortController, atob, setTimeout };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['shared/intake/rules.js', 'shared/intake/normalize.js', 'shared/intake/pipeline.js']) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.SlopIntake;
}
const SI = load();
const png = (name = 'a.png', n = 4) => new File([new Uint8Array(n)], name, { type: 'image/png' });
const txt = (name = 'notes.txt') => new File(['hello'], name, { type: 'text/plain' });
const PICS = { types: ['image/*'], noun: 'a picture' };
/** Values made inside the vm come from another realm: compare plain copies. */
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
const names = (list) => list.map((x) => x.name);
/** A pipeline whose env records what happens, in order. */
function make(over = {}) {
  const log = [], events = [];
  const env = Object.assign({
    emit: (type, d) => { events.push({ type, app: d.app, source: d.source, files: d.files && names(d.files), file: d.file && d.file.name, result: d.result, results: d.results }); log.push('event:' + type); return true; },
    notice: async () => { log.push('notice'); return true; },
    choose: async () => { log.push('choose'); return 'add'; },
  }, over);
  return { p: SI.createPipeline(env), log, events };
}

describe('normalize: every source becomes Files', () => {
  test('a drop (DataTransfer) gives its files, or its file items', async () => {
    eq(names(await SI.normalize({ files: [png('x.png')], items: [], types: ['Files'], getData: () => '' })), ['x.png']);
    const items = [{ kind: 'string' }, { kind: 'file', getAsFile: () => png('y.png') }];
    eq(names(await SI.normalize({ files: [], items, types: ['Files'], getData: () => '' })), ['y.png']);
  });
  test('a paste of a web picture (only <img src="data:...">) becomes a File with its type', async () => {
    const cd = { files: [], items: [], types: ['text/html'], getData: (t) => (t === 'text/html' ? '<p><img alt="" src="data:image/png;base64,iVBORw0KGgo="></p>' : '') };
    const [f] = await SI.normalize(cd);
    assert.equal(f.name, 'pasted-image.png');
    assert.equal(f.type, 'image/png');
    assert.equal(f.size, 8);
  });
  test('a Slop Drive record keeps its id on file.slopDrive; a converted result and a Blob get names', async () => {
    const rec = { id: 'd1', name: 'Scan.pdf', type: 'application/pdf', blob: new Blob(['%PDF'], { type: 'application/pdf' }) };
    const [a, b, c] = await SI.normalize([rec, { name: 'out.pdf', blob: new Blob(['x']) }, new Blob(['y'], { type: 'image/jpeg' })]);
    assert.equal(a.name, 'Scan.pdf'); assert.equal(a.type, 'application/pdf'); assert.equal(a.slopDrive.id, 'd1');
    assert.equal(b.name, 'out.pdf'); assert.equal(b.slopDrive, undefined);
    assert.equal(c.name, 'file.jpg'); assert.equal(c.type, 'image/jpeg');
  });
  test('a FileList, a launch file handle, a Promise and junk', async () => {
    const list = { length: 2, 0: png('1.png'), 1: png('2.png'), item(i) { return this[i]; } };
    eq(names(await SI.normalize(list)), ['1.png', '2.png']);
    eq(names(await SI.normalize([{ getFile: async () => png('h.png') }])), ['h.png']);
    eq(names(await SI.normalize(Promise.resolve([png('p.png'), null, 42, 'not a url']))), ['p.png']);
    eq(await SI.normalize(null), []);
  });
  test('dataUrlFile reads base64 and percent-encoded data', async () => {
    const f = SI.dataUrlFile('data:text/plain,hi%20there', 'n.txt');
    assert.equal(await f.text(), 'hi there');
    assert.equal(SI.dataUrlFile('data:image/jpeg;base64,AAAA').name, 'pasted-image.jpg');
  });
});

describe('accept: the rules and the reasons', () => {
  test('refusals name the file and say why; the rest are processed', async () => {
    const { p } = make();
    p.register({ id: 'pics', accept: PICS, process: async (f) => f.name });
    const s = await p.take([png('a.png'), txt('notes.txt'), png('empty.png', 0)], { source: 'drop' });
    eq(names(s.added), ['a.png']);
    eq(s.skipped.map((x) => x.reason), ['notes.txt is not a picture', 'empty.png is empty']);
  });
  test('accept as a function: false uses the noun, a string is the reason', async () => {
    const { p } = make();
    p.register({ id: 'f', noun: 'a PDF', accept: (f) => (f.name.endsWith('.pdf') ? true : f.name === 'big.pdf.zip' ? 'big.pdf.zip is zipped' : false), process: async () => 1 });
    const s = await p.take([txt('x.txt'), txt('big.pdf.zip')]);
    eq(s.skipped.map((x) => x.reason), ['x.txt is not a PDF', 'big.pdf.zip is zipped']);
  });
});

describe('the gates, in order', () => {
  test('before event, notice, limits, Add or New, the app gate, before(), process, after(), after event', async () => {
    const { p, log } = make();
    p.register({
      id: 'doc', accept: PICS, limit: 2, notice: { title: 'First use', lines: [] },
      hasOpen: () => { log.push('hasOpen'); return true; }, openName: () => 'Doc',
      gate: async (b) => { log.push('gate:' + b.mode + ':' + b.take.length); },
      before: async () => { log.push('before'); },
      process: async (f, ctx) => { log.push('process:' + f.name + ':' + ctx.mode); return f.name; },
      after: async (results) => { log.push('after:' + results.join()); },
    });
    const s = await p.take([png('1.png'), png('2.png'), png('3.png')], { source: 'picker' });
    eq(log, ['event:before', 'notice', 'hasOpen', 'choose', 'gate:add:2', 'before', 'process:1.png:add', 'event:file', 'process:2.png:add', 'event:file', 'after:1.png,2.png', 'event:after']);
    assert.equal(s.skipped[0].reason, '3.png is not taken: only 2 files at a time');
    assert.equal(s.mode, 'add');
  });
  test('the first-use notice is asked once per batch, whatever the source; cancelling it stops the batch', async () => {
    let asked = 0, answer = true;
    const { p } = make({ notice: async () => { asked++; return answer; } });
    let ran = 0;
    p.register({ id: 'n', notice: { title: 'x', lines: [] }, process: async () => ++ran });
    await p.take([png('1.png'), png('2.png'), png('3.png')], { source: 'drop' });
    assert.equal(asked, 1);
    await p.take([png('4.png')], { source: 'paste' });
    assert.equal(asked, 2);
    answer = false;
    const s = await p.take([png('5.png')], { source: 'drive' });
    assert.equal(asked, 3);
    assert.equal(s.cancelled, true);
    assert.equal(ran, 4);
  });
  test('no notice for a batch with nothing accepted', async () => {
    let asked = 0;
    const { p } = make({ notice: async () => { asked++; return true; } });
    p.register({ id: 'n', accept: PICS, notice: { title: 'x', lines: [] }, process: async () => 1 });
    await p.take([txt()]);
    assert.equal(asked, 0);
  });
  test('Add or New: asked only with something open; a mode from the source skips it; Cancel stops; New goes to onNew', async () => {
    let open = false, pick = 'new';
    const seen = [];
    const { p, log } = make({ choose: async (o) => { log.push('choose:' + o.name + ':' + o.count); return pick; } });
    p.register({ id: 'd', hasOpen: () => open, openName: () => 'Doc', process: async (f, ctx) => seen.push(ctx.mode), onNew: async (files) => { seen.push('onNew:' + files.length); } });
    await p.take([png()]);
    eq(log.filter((x) => x.startsWith('choose')), []);
    open = true;
    await p.take([png(), png('b.png')]);
    eq(log.filter((x) => x.startsWith('choose')), ['choose:Doc:2']);
    await p.take([png()], { mode: 'add' });
    assert.equal(log.filter((x) => x.startsWith('choose')).length, 1);
    pick = null;
    const s = await p.take([png()]);
    assert.equal(s.cancelled, true);
    eq(seen, ['onNew:1', 'onNew:2', 'add']);
  });
  test('ask: limits the question to some sources', async () => {
    let asked = 0;
    const { p } = make({ choose: async () => { asked++; return 'add'; } });
    p.register({ id: 'd', ask: ['paste'], hasOpen: () => true, process: async () => 1 });
    await p.take([png()], { source: 'drop' });
    assert.equal(asked, 0);
    await p.take([png()], { source: 'paste' });
    assert.equal(asked, 1);
  });
  test('a listener cancelling the before event, the app gate or before() returning false stop the batch', async () => {
    let ran = 0;
    const veto = make({ emit: (type) => type !== 'before' });
    veto.p.register({ id: 'a', process: async () => ++ran });
    assert.equal((await veto.p.take([png()])).cancelled, true);
    const { p } = make();
    p.register({ id: 'g', gate: () => false, process: async () => ++ran });
    p.register({ id: 'b', before: () => false, process: async () => ++ran });
    assert.equal((await p.take([png()], { to: 'g' })).cancelled, true);
    assert.equal((await p.take([png()], { to: 'b' })).cancelled, true);
    assert.equal(ran, 0);
  });
  test('before() may replace the files', async () => {
    const { p } = make();
    p.register({ id: 'r', before: (b) => b.take.filter((f) => f.name !== 'skip.png'), process: async (f) => f.name });
    eq(names((await p.take([png('keep.png'), png('skip.png')])).added), ['keep.png']);
  });
});

describe('process: a bounded pool, errors as rows', () => {
  test('at most `concurrency` files at once, results in the files order', async () => {
    const { p } = make();
    let now = 0, most = 0;
    p.register({ id: 'pool', concurrency: 2, process: async (f) => { now++; most = Math.max(most, now); await new Promise((r) => setTimeout(r, 5)); now--; return f.name.toUpperCase(); } });
    const s = await p.take(['1', '2', '3', '4', '5'].map((n) => png(n + '.png')));
    assert.equal(most, 2);
    eq(s.added.map((a) => a.value), ['1.PNG', '2.PNG', '3.PNG', '4.PNG', '5.PNG']);
  });
  test('default concurrency is one; a reader error is skipped with its reason and the batch carries on', async () => {
    const { p } = make();
    let now = 0, most = 0;
    p.register({ id: 'one', process: async (f) => { now++; most = Math.max(most, now); await new Promise((r) => setTimeout(r, 2)); now--; if (f.name === 'bad.png') throw new Error('could not be decoded'); return 1; } });
    const s = await p.take([png('bad.png'), png('good.png'), png('x.png')]);
    assert.equal(most, 1);
    eq(names(s.added), ['good.png', 'x.png']);
    assert.equal(s.skipped[0].reason, 'bad.png could not be decoded');
  });
  test('ctx carries the source, the drop point, the data, progress, the Drive record and the index', async () => {
    const { p } = make();
    const seen = [];
    p.register({ id: 'c', process: async (f, ctx) => { ctx.progress(0.5); seen.push([ctx.source, ctx.at && ctx.at.x, ctx.data.where, ctx.index, ctx.drive && ctx.drive.id]); } });
    await p.take([{ id: 'r1', name: 'a.png', type: 'image/png', blob: new Blob(['x']) }, png('b.png')], { source: 'launch', at: { x: 3, y: 4 }, data: { where: 'tab' } });
    eq(seen, [['launch', 3, 'tab', 0, 'r1'], ['launch', 3, 'tab', 1, null]]);
  });
  test('a single file is a batch of one, through the same path', async () => {
    const { p, events } = make();
    p.register({ id: 's', process: async () => 'v' });
    await p.take(png('only.png'), { source: 'sample' });
    eq(events.map((e) => e.type), ['before', 'file', 'after']);
  });
});

describe('events, specs and queueing', () => {
  test('before, file and after carry the app id, the source, the files and the results', async () => {
    const { p, events } = make();
    p.register({ id: 'ev', process: async (f) => 'r:' + f.name });
    await p.take([png('a.png'), png('b.png')], { source: 'paste' });
    eq(events.map((e) => [e.type, e.app, e.source]), [['before', 'ev', 'paste'], ['file', 'ev', 'paste'], ['file', 'ev', 'paste'], ['after', 'ev', 'paste']]);
    eq(events[0].files, ['a.png', 'b.png']);
    eq([events[1].file, events[1].result], ['a.png', 'r:a.png']);
    eq(events[3].results, ['r:a.png', 'r:b.png']);
  });
  test('take goes to the main spec, or the one named; part specs (main: false) are only reached by name', async () => {
    const { p } = make();
    const got = [];
    p.register({ id: 'part', main: false, process: async () => got.push('part') });
    p.register({ id: 'app', process: async () => got.push('app') });
    await p.take([png()]);
    await p.take([png()], { to: 'part' });
    eq(got, ['app', 'part']);
    assert.equal((await p.take([png()], { to: 'nope' })).cancelled, true);
    assert.throws(() => p.register({ id: 'x' }), /process/);
  });
  test('batches for one app run one after another', async () => {
    const { p } = make();
    const order = [];
    p.register({ id: 'q', process: async (f) => { order.push('start:' + f.name); await new Promise((r) => setTimeout(r, 5)); order.push('end:' + f.name); } });
    await Promise.all([p.take([png('1.png')]), p.take([png('2.png')])]);
    eq(order, ['start:1.png', 'end:1.png', 'start:2.png', 'end:2.png']);
  });
  test('the view gets begin, a row per file, the refusals and the end summary', async () => {
    const calls = [];
    const view = { begin: () => calls.push('begin'), refuse: (r) => calls.push('refuse:' + r.name), row: (f) => { calls.push('row:' + f.name); return { progress: (v) => calls.push('p:' + v), set: (st) => calls.push(st) }; }, end: (s) => calls.push('end:' + s.added.length + '/' + s.skipped.length) };
    const { p } = make({ view: () => view });
    p.register({ id: 'v', accept: PICS, process: async (f, ctx) => { ctx.progress(1); return 1; } });
    await p.take([txt('n.txt'), png('a.png')]);
    eq(calls, ['begin', 'refuse:n.txt', 'row:a.png', 'p:1', 'ready', 'end:1/1']);
  });
});
