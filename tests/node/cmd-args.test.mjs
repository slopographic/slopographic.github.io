// SlopCmd argument schemas (shared/commands/args.js) and the model's tools built from commands (shared/ai/cmdtools.js).
// Covers: shared/commands/args.js, shared/ai/cmdtools.js, shared/ai/tools.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const A = require('../../shared/commands/args.js');
const BLUR = [{ name: 'radius', type: 'number', min: 0.1, max: 250, default: 4, step: 0.1, description: 'px' }];
const EXPORT = [{ name: 'format', type: 'enum', values: ['png', 'jpeg', 'webp'], default: 'png' }, { name: 'quality', type: 'number', min: 1, max: 100, default: 90, integer: true }, { name: 'transparent', type: 'boolean', default: true }];

test('numbers: coerced from text, clamped to the range with a note, rounded to the step', () => {
  let r = A.validate(BLUR, { radius: '8px' });
  assert.equal(r.ok, true); assert.deepEqual(r.args, { radius: 8 }); assert.deepEqual(r.notes, []);
  r = A.validate(BLUR, { radius: 900 });
  assert.equal(r.args.radius, 250); assert.match(r.notes[0], /above the maximum, so 250 was used/);
  r = A.validate(BLUR, { radius: -3 });
  assert.equal(r.args.radius, 0.1); assert.match(r.notes[0], /below the minimum/);
  assert.equal(A.validate(BLUR, { radius: 3.14159 }).args.radius, 3.1);
  assert.equal(A.validate(EXPORT, { quality: '72.6' }).args.quality, 73);
  r = A.validate(BLUR, { radius: 'lots' });
  assert.equal(r.ok, false); assert.match(r.errors[0], /radius must be a number from 0\.1 to 250/);
});

test('defaults fill missing values; unknown names are dropped with a note; names match loosely', () => {
  const r = A.validate(EXPORT, { Format: 'JPEG', bogus: 1 });
  assert.deepEqual(r.args, { format: 'jpeg', quality: 90, transparent: true });
  assert.match(r.notes.join(), /ignored unknown argument bogus/);
  assert.deepEqual(A.defaults(EXPORT), { format: 'png', quality: 90, transparent: true });
  assert.deepEqual(A.validate([{ name: 'keep_aspect', type: 'boolean' }], { keepAspect: 'no' }).args, { keep_aspect: false });
});

test('enums, booleans, colours and strings', () => {
  assert.equal(A.validate(EXPORT, { format: 'web' }).args.format, 'webp');           // a prefix
  assert.match(A.validate(EXPORT, { format: 'gif' }).errors[0], /one of: png, jpeg, webp/);
  assert.equal(A.validate(EXPORT, { transparent: 'yes' }).args.transparent, true);
  assert.equal(A.validate(EXPORT, { transparent: 0 }).args.transparent, false);
  assert.equal(A.validate(EXPORT, { transparent: 'maybe' }).ok, false);
  const C = [{ name: 'color', type: 'color' }];
  assert.equal(A.validate(C, { color: 'Red' }).args.color, '#ff0000');
  assert.equal(A.validate(C, { color: '#abc' }).args.color, '#aabbcc');
  assert.equal(A.validate(C, { color: 'rgb(255, 128, 0)' }).args.color, '#ff8000');
  assert.equal(A.validate(C, { color: 'ff8800ff' }).args.color, '#ff8800');
  assert.equal(A.validate(C, { color: 'sparkly' }).ok, false);
  const T = [{ name: 'text', type: 'string', required: true, maxLength: 5 }];
  assert.match(A.validate(T, {}).errors[0], /Missing text/);
  const r = A.validate(T, { text: 'Hello world' });
  assert.equal(r.args.text, 'Hello'); assert.match(r.notes[0], /cut to 5/);
  assert.deepEqual(A.normalize({ n: { type: 'number' } }), [{ name: 'n', type: 'number' }]);   // a map works too
});

test('JSON schema, hints and step summaries', () => {
  const s = A.jsonSchema(EXPORT);
  assert.deepEqual(s.properties.format, { type: 'string', enum: ['png', 'jpeg', 'webp'], default: 'png' });
  assert.deepEqual(s.properties.quality, { type: 'integer', minimum: 1, maximum: 100, default: 90 });
  assert.equal(s.additionalProperties, false);
  assert.equal(A.hint(BLUR[0]), 'number 0.1–250, default 4');
  assert.equal(A.summary('Gaussian blur', BLUR, { radius: 8 }), 'Gaussian blur, radius 8');
});

/* cmdtools in a small browser-like context */
function kit() {
  const w = { SlopCmdArgs: A, console };
  w.window = w;
  const ctx = vm.createContext(w);
  for (const f of ['shared/ai/tools.js', 'shared/ai/cmdtools.js']) vm.runInContext(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'), ctx);
  return w.SlopAIKit;
}
function fakeCmd() {
  const ran = [];
  const cmds = [
    { id: 'ps.ai.gaussian-blur', tool: 'gaussian_blur', title: 'Gaussian blur', args: BLUR, destructive: false },
    { id: 'ps.ai.delete-layer', tool: 'delete_layer', title: 'Delete layer', args: [], destructive: true },
    { id: 'ps.ai.new-layer', tool: 'new_layer', title: 'New layer', args: [{ name: 'name', type: 'string' }], destructive: false },
    { id: 'ps.view-zoom-in', title: 'View › Zoom In' },
    { id: 'ps.layer-merge-down', title: 'Layer › Merge Down' },
  ];
  return { ran, list: () => cmds.map((c) => Object.assign({ enabled: true }, c)), state: () => ({ layers: 2 }),
    run: (id) => { ran.push([id]); return true; },
    exec: async (id, args) => { const c = cmds.find((x) => x.id === id); const v = c.args ? A.validate(c.args, args) : { ok: true, args, notes: [] }; if (!v.ok) return { ok: false, error: v.errors.join('; ') }; ran.push([id, v.args]); return { ok: true, args: v.args, notes: v.notes }; } };
}

test('tool definitions are built from the commands that have args, plus app_state, list_commands and run_command', () => {
  const K = kit(), cmd = fakeCmd();
  const tools = K.cmdTools.build(cmd, { label: 'PhotoSlop' });
  assert.deepEqual([...tools.map((t) => t.name)], ['app_state', 'gaussian_blur', 'delete_layer', 'new_layer', 'list_commands', 'run_command']);
  const defs = JSON.parse(JSON.stringify(K.cmdTools.definitions(cmd)));
  const blur = defs.find((d) => d.function.name === 'gaussian_blur');
  assert.equal(blur.type, 'function');
  assert.deepEqual(blur.function.parameters.properties.radius, { type: 'number', minimum: 0.1, maximum: 250, description: 'px', default: 4 });
  assert.match(K.tools.describe(tools), /gaussian_blur\(radius\?: number 0\.1–250, default 4\)/);
  assert.equal(tools[1].label({ radius: 8 }), 'Gaussian blur, radius 8');
});

test('arguments are clamped before the command runs; the result says so', async () => {
  const K = kit(), cmd = fakeCmd(), tools = K.cmdTools.build(cmd, {});
  const r = await K.tools.dispatch({ name: 'gaussian_blur', arguments: { radius: 9000 } }, tools);
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(cmd.ran[0])), ['ps.ai.gaussian-blur', { radius: 250 }]);
  assert.match(r.result, /Done: Gaussian blur, radius 250\. Note: radius 9000 is above the maximum/);
  const bad = await K.tools.dispatch({ name: 'gaussian_blur', arguments: { radius: 'huge' } }, tools);
  assert.equal(bad.ok, false); assert.match(bad.error, /must be a number/);
  const st = await K.tools.dispatch({ name: 'app_state', arguments: {} }, tools);
  assert.equal(st.result, '{"layers":2}');
});

test('destructive commands ask first: the explicit flag wins, then the words in the id or title', async () => {
  const K = kit(), cmd = fakeCmd(), tools = K.cmdTools.build(cmd, {});
  let asked = 0;
  const no = await K.tools.dispatch({ name: 'delete_layer', arguments: {} }, tools, { confirm: async () => { asked++; return false; } });
  assert.equal(no.ok, false); assert.equal(asked, 1); assert.equal(cmd.ran.length, 0);
  await K.tools.dispatch({ name: 'new_layer', arguments: { name: 'Sky' } }, tools, { confirm: async () => { asked++; return true; } });
  assert.equal(asked, 1, '"New layer" sets destructive: false, so it does not ask although its title says "new"');
  await K.tools.dispatch({ name: 'run_command', arguments: { id: 'ps.layer-merge-down' } }, tools, { confirm: async () => { asked++; return true; } });
  assert.equal(asked, 2, 'merge is a destructive word');
  await K.tools.dispatch({ name: 'run_command', arguments: { id: 'ps.view-zoom-in' } }, tools, { confirm: async () => { asked++; return true; } });
  assert.equal(asked, 2);
  assert.equal(K.cmdTools.isDestructive({ id: 'x.clear', title: 'Clear', destructive: false }), false);
});

test('the agent loop stops between actions when aborted and caps the number of actions', async () => {
  const K = kit(), cmd = fakeCmd(), tools = K.cmdTools.build(cmd, {});
  const call = '<tool_call>{"name": "gaussian_blur", "arguments": {"radius": 2}}</tool_call>';
  const engine = (reply) => ({ chat: async function* () { yield { type: 'done', text: '', raw: reply, toolCalls: K.tools.parse(reply, tools).calls, usage: {} }; } });
  const ctl = new AbortController();
  let n = 0;
  await K.tools.run(engine(call + call + call), [], { tools, signal: ctl.signal, onTool: ({ phase }) => { if (phase === 'end' && ++n === 1) ctl.abort(); } });
  assert.equal(cmd.ran.length, 1);
  const r = await K.tools.run(engine(call.repeat(5)), [], { tools, maxCalls: 3, maxSteps: 3 });
  assert.equal(cmd.ran.length, 4); assert.match(r.text, /at most 3 actions/);
});

// Covers: shared/commands/args.js (forgiving enums: the owner's Slop Signature session, font "Trebuchet MS" refused)
test('enum options match the value, the label, loose text, a CSS stack\'s first family and a unique prefix', () => {
  const FONTS = [['Arial, Helvetica, sans-serif', 'Arial'], ['Helvetica, Arial, sans-serif', 'Helvetica'], ['Verdana, Geneva, sans-serif', 'Verdana'],
    ["'Times New Roman', Times, serif", 'Times New Roman'], ["'Trebuchet MS', sans-serif", 'Trebuchet MS']];
  const F = [{ name: 'font', type: 'enum', options: FONTS, default: 'Arial, Helvetica, sans-serif' }];
  const v = (x) => A.validate(F, { font: x });
  assert.equal(v('Trebuchet MS').args.font, "'Trebuchet MS', sans-serif");       // the label (the owner's case)
  assert.equal(v("'Trebuchet MS', sans-serif").args.font, "'Trebuchet MS', sans-serif");   // the exact value
  assert.equal(v('trebuchet ms').args.font, "'Trebuchet MS', sans-serif");       // case and spaces
  assert.equal(v('"Times New Roman", serif').args.font, "'Times New Roman', Times, serif");   // a stack's first family
  assert.equal(v('Trebuchet MS, Helvetica, sans-serif').args.font, "'Trebuchet MS', sans-serif");
  assert.equal(v('verd').args.font, 'Verdana, Geneva, sans-serif');              // a unique prefix
  const bad = v('Comic Sans');
  assert.equal(bad.ok, false);
  assert.equal(bad.errors[0].startsWith('font must be one of: Arial, Helvetica, Verdana, Times New Roman, Trebuchet MS'), true);
  assert.match(v('Verdanna').errors[0], /closest: Verdana/);
  const s = A.jsonSchema(F).properties.font;                                    // the model sees the labels, not the stacks
  assert.deepEqual(s.enum, ['Arial', 'Helvetica', 'Verdana', 'Times New Roman', 'Trebuchet MS']);
  assert.equal(s.default, 'Arial');
  assert.equal(A.hint(F[0]), 'one of Arial|Helvetica|Verdana|Times New Roman|Trebuchet MS, default Arial');
  const TO = [{ name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download']] }];   // plain values stay
  assert.deepEqual(A.jsonSchema(TO).properties.to.enum, ['drive', 'download']);
  assert.equal(A.validate(TO, { to: 'Slop Drive' }).args.to, 'drive');
  assert.equal(A.validate([{ name: 'f', type: 'enum', values: ['jpeg', 'jpg2'] }], { f: 'jp' }).ok, false);   // a prefix two have is not a guess
});
