// AI permissions (shared/ai/permissions.js): kinds, the three modes, remembered rules, "for this request" ending with
// the reply, "for this visit", and the loop asking through it (tools.js env.permit) for local and cloud models alike.
// Also: prompt caching's effect on a recorded 5-step task (usage measured live with Claude Haiku 5.5, 2026-10-24).
// Covers: shared/ai/permissions.js, shared/ai/tools.js, shared/ai/cmdtools.js, shared/ai/filetools.js, shared/ai/cloud/providers.js,
//   shared/ai/cloud/meter.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { kit, sseResponse } from './ai-cloud-env.mjs';
import * as FX from './ai-cloud-fixtures.mjs';

function fresh() {
  const w = kit();
  vm.runInContext(readFileSync(new URL('../../shared/ai/filetools.js', import.meta.url), 'utf8'), vm.createContext(w));
  const P = w.SlopAIPermissions, asked = [];
  let answer = 'once';
  P.prompt = async (req) => { asked.push(req); return typeof answer === 'function' ? answer(req) : answer; };
  return { w, P, asked, setAnswer: (a) => { answer = a; } };
}

test('kinds: deleting words are delete, other marked commands are app changes', () => {
  const { P } = fresh();
  assert.equal(P.kindOf('ps.crop Crop to selection'), 'change');
  assert.equal(P.kindOf('ps.flatten Flatten image'), 'change');
  assert.equal(P.kindOf('ps.delete-layer Delete layer'), 'delete');
  assert.equal(P.kindOf('demo.clear Clear canvas'), 'delete');
  assert.equal(P.kindOf('docs.close Close document'), 'delete');
});

test('modes: ask (default) asks for everything; changes allows only app changes; all allows everything', () => {
  const { P } = fresh();
  assert.equal(P.mode(), 'ask');
  for (const k of ['change', 'delete', 'send']) assert.equal(P.decide(k, 'photoslop').allow, false, k);
  P.setMode('changes');
  assert.deepEqual(['change', 'delete', 'send'].map((k) => P.decide(k, 'photoslop').allow), [true, false, false]);
  P.setMode('all');
  assert.deepEqual(['change', 'delete', 'send'].map((k) => P.decide(k, 'photoslop').allow), [true, true, true]);
  assert.match(P.MODES.find((m) => m.id === 'all').warning, /send copies of your files/);
  assert.throws(() => P.setMode('yolo'));
});

test('always rules: per kind and app, remembered on the device, removable', async () => {
  const { w, P, asked, setAnswer } = fresh();
  setAnswer('always');
  assert.equal(await P.ask({ kind: 'delete', app: 'photoslop', appName: 'PhotoSlop', action: 'Delete layer' }), true);
  assert.equal(asked.length, 1);
  assert.equal(await P.ask({ kind: 'delete', app: 'photoslop', action: 'Delete layer' }), true);
  assert.equal(asked.length, 1, 'remembered: no second question');
  assert.equal(P.decide('delete', 'docs').allow, false, 'another app still asks');
  assert.equal(P.decide('send', 'photoslop').allow, false, 'another kind still asks');
  assert.equal(JSON.parse(w.localStorage.getItem('slop-ai.permissions')).always[0].appName, 'PhotoSlop');
  P.removeRule('delete', 'photoslop');
  assert.equal(P.decide('delete', 'photoslop').allow, false);
});

test('"for this request" ends with the reply; "for this visit" lasts the tab; once and deny remember nothing', async () => {
  const { w, P, asked, setAnswer } = fresh();
  P.startRequest(); setAnswer('request');
  assert.equal(await P.ask({ kind: 'change', app: 'photoslop' }), true);
  assert.equal(await P.ask({ kind: 'change', app: 'photoslop' }), true);
  assert.equal(asked.length, 1);
  P.endRequest();
  assert.equal(P.decide('change', 'photoslop').allow, false, 'the next request asks again');
  setAnswer('visit');
  await P.ask({ kind: 'send', app: 'photoslop' });
  assert.equal(P.decide('send', 'photoslop').allow, true);
  assert.match(w.sessionStorage.getItem('slop-ai.permissions.visit'), /send\|photoslop/);
  assert.equal(w.localStorage.getItem('slop-ai.permissions'), null, 'nothing on the device');
  setAnswer('once');
  await P.ask({ kind: 'delete', app: 'photoslop' });
  assert.equal(P.decide('delete', 'photoslop').allow, false);
  setAnswer('deny');
  assert.equal(await P.ask({ kind: 'delete', app: 'photoslop' }), false);
});

/** A page with Crop (an app change), Delete layer and look_at_file, driven by a scripted Claude through the loop. */
async function loop(fx, prompts, mode = 'ask') {
  const { w, P, asked, setAnswer } = fresh();
  setAnswer(prompts); P.setMode(mode);
  const ran = [];
  const cmd = { list: () => [{ id: 'ps.crop', title: 'Crop' }, { id: 'ps.delete-layer', title: 'Delete layer' }], run: (id) => { ran.push(id); } };
  const K = w.SlopAIKit, tools = K.appTools.build({ cmd, apps: () => [], hub: null });
  tools.push(K.fileTools.look({ who: 'Anthropic', hub: { list: async () => [{ id: '1', name: 'a.txt', type: 'text/plain', blob: new Blob(['hello']) }] } }));
  const eng = new K.CloudEngine({ provider: 'anthropic', model: 'claude-haiku-5-5', key: async () => 'k' });
  for (const f of fx) w.answers.push(sseResponse(f));
  const permit = (req) => P.ask(Object.assign({ app: 'photoslop', appName: 'PhotoSlop' }, req));
  P.startRequest();
  await K.tools.run(eng, [{ role: 'user', content: 'go' }], { tools, env: { permit }, maxSteps: 6 });
  P.endRequest();
  return { ran, asked, P, w };
}
const call = (name, args) => FX.ANTHROPIC_TOOL.replace('"name":"run_command"', `"name":"${name}"`).replace('"partial_json":"{\\"id\\": \\"demo.', `"partial_json":"${JSON.stringify(args).slice(0, -1).replace(/"/g, '\\"')}`).replace('"partial_json":"bold\\"}"', '"partial_json":"}"');

test('the loop asks through the module with the action named; "allow app changes" never sends a file', async () => {
  const fx = [call('run_command', { id: 'ps.crop' }), call('look_at_file', { file: 'a.txt' }), call('run_command', { id: 'ps.delete-layer' }), FX.ANTHROPIC_TEXT];
  let r = await loop(fx, 'once');
  assert.deepEqual([...r.ran], ['ps.crop', 'ps.delete-layer']);
  assert.deepEqual(r.asked.map((q) => [q.kind, q.action]), [['change', 'Crop'], ['send', 'Look at a.txt'], ['delete', 'Delete layer']]);
  assert.equal(r.asked[1].title, 'Send a copy to Anthropic?'); assert.equal(r.asked[0].appName, 'PhotoSlop'); assert.equal(r.asked[2].step, 3);
  // allow app changes: crop runs without asking; the file and the delete still ask (and are denied here)
  r = await loop(fx, 'deny', 'changes');
  assert.deepEqual([...r.ran], ['ps.crop']);
  assert.deepEqual(r.asked.map((q) => q.kind), ['send', 'delete']);
});

test('prompt caching on a recorded 5-step task: same tokens, about a third of the cost', () => {
  const w = kit(), C = w.SlopAIKit.cloud;
  // measured live: 6 model turns, 5 tool calls, Claude Haiku 5.5, 34 tools; caching off, then on
  const off = { input: 42592, cacheRead: 0, cacheWrite: 0, output: 306 }, on = { input: 42592, cacheRead: 35314, cacheWrite: 7264, output: 306 };
  const haiku = C.price(C.byId('anthropic'), 'claude-haiku-5-5'), sonnet = C.price(C.byId('anthropic'), 'claude-sonnet-5-5');
  assert.equal(C.cost(off, haiku).toFixed(4), '0.0044'); assert.equal(C.cost(on, haiku).toFixed(4), '0.0014');
  assert.equal(C.cost(off, sonnet).toFixed(4), '0.0882'); assert.equal(C.cost(on, sonnet).toFixed(4), '0.0283');
  assert.equal(C.meter.line(Object.assign({ cost: C.cost(on, sonnet) }, on)), '42,898 tokens (35,314 from cache) · about $0.03');
});

test('spending (generate_image): its own kind with its own title; before() runs first; never covered by "allow app changes"', async () => {
  const { w, P, asked, setAnswer } = fresh();
  const T = w.SlopAIKit.tools, order = [];
  const tool = { name: 'generate_image', permission: { kind: 'spend-image', title: 'Spend on image generation' }, params: { prompt: { type: 'string', required: true } },
    before: async () => { order.push('before'); }, confirmText: () => 'Make 1 picture with OpenAI (gpt-image, 1024 × 1024 px): about $0.04 per picture.',
    label: (a) => 'Make a picture: ' + a.prompt, run: async () => { order.push('run'); return 'made'; } };
  const permit = (req) => { order.push('ask'); return P.ask(Object.assign({ app: 'photoslop', appName: 'PhotoSlop' }, req)); };
  P.setMode('changes'); setAnswer('deny');
  let r = await T.dispatch({ name: 'generate_image', arguments: { prompt: 'a slime' } }, [tool], { permit });
  assert.equal(r.ok, false); assert.deepEqual(order, ['before', 'ask']);
  assert.equal(asked[0].kind, 'spend-image'); assert.equal(asked[0].title, 'Spend on image generation?'); assert.match(asked[0].detail, /about \$0\.04 per picture/);
  setAnswer('always'); order.length = 0;
  r = await T.dispatch({ name: 'generate_image', arguments: { prompt: 'a slime' } }, [tool], { permit });
  assert.equal(r.result, 'made');
  r = await T.dispatch({ name: 'generate_image', arguments: { prompt: 'more slime' } }, [tool], { permit });
  assert.equal(asked.length, 2, 'always allowed in PhotoSlop: no third question');
  assert.match(P.MODES.find((m) => m.id === 'all').warning, /spend on image generation/);
});

test('the words people read follow the language: modes, kinds and the questions (shared/i18n/ui/sv/ai2.js)', () => {
  const { w, P } = fresh();
  const en = w.SlopI18n, sv = en.create({ defaultLang: 'sv', profile: null });
  w.SlopI18n = sv;
  for (const code of ['en', 'sv']) for (const p of ['ai', 'ai2']) vm.runInContext(readFileSync(new URL(`../../shared/i18n/ui/${code}/${p}.js`, import.meta.url), 'utf8'), w);
  assert.deepEqual(Array.from(P.MODES, (m) => m.short), ['Fråga varje gång', 'Tillåt appändringar', 'Tillåt allt']);
  assert.equal(P.KINDS.send.name, 'filutskick');
  const look = w.SlopAIKit.fileTools.look({ who: 'Anthropic', hub: { list: async () => [] } });
  assert.equal(look.confirmTitle(), 'Skicka en kopia till Anthropic?');
  assert.match(look.confirmText({ file: 'open' }), /^Assistenten vill titta på det som är öppet i den här appen\. .*1024 px.*Anthropic/);
  w.SlopI18n = en;   // back to English: the same objects read English at once
  assert.equal(P.MODES[0].short, 'Ask each time');
  assert.equal(look.confirmTitle(), 'Send a copy to Anthropic?');
});
