// WebMCP tool generator: SlopCmd commands (through the AI panel's cmdTools.specs) and the operations registry map to valid
// JSON Schema tools; commands flagged ai: false are left out; names are unique and valid; destructive actions are flagged
// and ask first; the workspace tools' schemas are valid too.
// Run: node --test tests/node/agent-tools.test.mjs
// Covers: shared/agent/tools.js, shared/agent/workspace.js, shared/ai/cmdtools.js, shared/ai/apptools.js, shared/ai/optools.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui-i18n-en.mjs';   // the shared components' words (shared/i18n/ui), as a page has them
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../../shared/ops/all.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const T = require('../../shared/agent/tools.js');
const A = require('../../shared/commands/args.js');

async function classic(rels, extra = {}) {
  const win = Object.assign({ SlopCmdArgs: A, SLOP_APPS: [], console, URL, File, Blob, Map, Set, Promise, setTimeout }, extra);
  win.window = win;
  const ctx = vm.createContext(win);
  for (const rel of [].concat(rels)) vm.runInContext(await readFile(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  return win;
}
// SlopI18n with the English words of the questions people read (shared/i18n/ui/en/ai*.js), then the kit
const KIT = ['shared/i18n/i18n.js', 'shared/i18n/ui/en/ai.js', 'shared/i18n/ui/en/ai2.js', 'shared/ai/apptools.js', 'shared/ai/cmdtools.js', 'shared/ai/optools.js'];
/** The one tool list, as WebMCP takes it: appTools.build (with the operations and the page's commands), cmdTools.neutral. */
const oneList = (w, env) => w.SlopAIKit.appTools.build(Object.assign({ ops: true, hub: null }, env)).map(w.SlopAIKit.cmdTools.neutral);

function fakeCmd() {
  const ran = [];
  const cmds = [
    { id: 'ps.ai.blur', tool: 'gaussian_blur', title: 'Gaussian blur', args: [{ name: 'radius', type: 'number', min: 0.1, max: 250, default: 4 }], destructive: false },
    { id: 'ps.delete-layer', title: 'Delete layer', args: [{ name: 'layer', type: 'string', required: true }] },
    { id: 'ps.ai.secret', title: 'Internal', args: [{ name: 'x', type: 'number' }], ai: false },
    { id: 'ps.fill', title: 'Fill', args: [{ name: 'colour', type: 'color', default: '#ffffff' }, { name: 'mode', type: 'enum', values: ['normal', 'multiply'] }, { name: 'soft', type: 'boolean' }] },
    { id: 'ps.ai.blur2', tool: 'gaussian blur!', title: 'Blur again', args: [{ name: 'r', type: 'number' }] },
    { id: 'edit.trimIn', title: 'Ripple trim start to playhead', group: 'Edit' },
  ];
  return {
    ran,
    list: () => cmds.map((c) => Object.assign({ enabled: true, group: '', keys: [] }, c)),
    exec: async (id, args) => { ran.push([id, args]); const c = cmds.find((x) => x.id === id); const v = c.args ? A.validate(c.args, args) : { ok: true, args, notes: [] }; return v.ok ? { ok: true, value: 'done', args: v.args, notes: v.notes } : { ok: false, error: v.errors.join('; ') }; },
    run: () => true,
    state: () => ({ document: 'poster.psd' }),
  };
}

test('SlopCmd commands become tools: the panel\'s schemas, ai: false left out, names unique and valid', async () => {
  const w = await classic(KIT);
  const cmd = fakeCmd();
  const defs = T.unique(oneList(w, { cmd }));
  const names = defs.map((d) => d.name);
  assert.deepEqual(names.slice().sort(), ['app_state', 'delete_layer', 'fill', 'gaussian_blur', 'gaussian_blur_2', 'list_commands', 'run_command',
    'list_apps', 'open_app', 'save_to_drive', 'list_files', 'read_file', 'list_operations', 'run_operation', 'run_workflow'].sort());
  assert.ok(!defs.some((d) => d.cmdId === 'ps.ai.secret'), 'ai: false is not a tool');
  assert.equal(new Set(names).size, names.length);
  for (const d of defs) {
    assert.match(d.name, T.NAME_RE);
    const tool = T.toWebMCP(d);
    assert.deepEqual(T.checkSchema(tool.inputSchema), [], d.name);
    assert.equal(typeof tool.execute, 'function');
    assert.ok(tool.description.length > 3);
  }
  const fill = defs.find((d) => d.name === 'fill').inputSchema;
  assert.equal(fill.properties.colour.pattern, '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$');
  assert.deepEqual(fill.properties.mode.enum, ['normal', 'multiply']);
  assert.equal(fill.properties.soft.type, 'boolean');
  // the same schema the panel's definitions() gives
  const panel = w.SlopAIKit.cmdTools.definitions(cmd).find((x) => x.function.name === 'fill');
  assert.deepEqual(panel.function.parameters, fill);
  assert.ok(defs.find((d) => d.name === 'app_state').readOnly && defs.find((d) => d.name === 'list_commands').readOnly);
});

test('destructive tools are flagged and ask first; read-only tools say so', async () => {
  const w = await classic(KIT);
  const cmd = fakeCmd();
  const defs = T.unique(oneList(w, { cmd }));
  const tool = (n, o) => T.toWebMCP(defs.find((d) => d.name === n), o);
  assert.equal(tool('delete_layer').annotations.destructiveHint, true);
  assert.equal(tool('delete_layer').annotations.consequentialHint, true);
  assert.equal(tool('gaussian_blur').annotations.destructiveHint, undefined);
  assert.equal(tool('gaussian_blur').annotations.readOnlyHint, false);
  assert.equal(tool('app_state').annotations.readOnlyHint, true);
  assert.equal(tool('app_state').annotations.untrustedContentHint, true);
  assert.equal(tool('run_command').annotations.destructiveHint, true, 'run_command may run anything');

  const asked = [];
  let r = await tool('delete_layer', { confirm: async (t) => { asked.push(t); return false; } }).execute({ layer: 'Sky' });
  assert.equal(r.isError, true);
  assert.equal(cmd.ran.length, 0, 'refused: nothing ran');
  assert.match(asked[0], /Delete layer/);
  r = await tool('delete_layer', { confirm: async () => true }).execute({ layer: 'Sky' });
  assert.ok(!r.isError);
  assert.deepEqual(cmd.ran[0], ['ps.delete-layer', { layer: 'Sky' }]);
  // a harmless command does not ask; run_command asks only for a destructive id
  r = await tool('gaussian_blur', { confirm: async () => { throw new Error('asked'); } }).execute({ radius: '900px' });
  assert.match(r.content[0].text, /250/);
  r = await tool('run_command', { confirm: async () => { throw new Error('asked'); } }).execute({ id: 'edit.trimIn' });
  assert.ok(!r.isError, r.content[0].text);
  assert.deepEqual(cmd.ran.at(-1)[0], 'edit.trimIn');
  // an error comes back as a text result
  r = await tool('delete_layer', { confirm: async () => true }).execute({});
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /layer/);
});

test('every registry operation\'s options map to a valid JSON Schema', () => {
  const ops = R.all();
  assert.ok(ops.length > 100, 'the registry is loaded: ' + ops.length);
  for (const op of ops) {
    const s = A.jsonSchema(R.argsOf(op));
    assert.deepEqual(T.checkSchema(s), [], op.id);
  }
});

test('the file and operations tools of the one list, and the page\'s own two: valid schemas and names, read-only where they only read', async () => {
  const doc = { currentScript: null, querySelectorAll: () => [] };
  const w = await classic(KIT.concat('shared/agent/workspace.js'), { document: doc, location: { href: 'http://localhost/photoslop/' } });
  const defs = T.unique(oneList(w, {}).concat(w.SlopAgentWorkspace.defs({ app: 'PhotoSlop' })));
  const names = defs.map((d) => d.name);
  for (const n of ['list_files', 'read_file', 'save_to_drive', 'download', 'list_operations', 'run_operation', 'run_workflow']) assert.ok(names.includes(n), n);
  assert.ok(!names.includes('open_file'), 'no open_file without an app that takes files');
  for (const d of defs) {
    assert.match(d.name, T.NAME_RE);
    const t = T.toWebMCP(d);
    assert.deepEqual(T.checkSchema(t.inputSchema), [], d.name);
    assert.equal(!!t.annotations.destructiveHint, false, d.name);
  }
  const tool = (n) => T.toWebMCP(defs.find((d) => d.name === n));
  for (const n of ['list_files', 'read_file', 'list_operations', 'list_apps']) assert.equal(tool(n).annotations.readOnlyHint, true, n);
  assert.equal(tool('list_files').annotations.untrustedContentHint, true);
  assert.equal(tool('run_workflow').annotations.readOnlyHint, false);
  assert.deepEqual([...tool('run_operation').inputSchema.required], ['operation']);
  // with an app that takes files, open_file is offered
  const w2 = await classic(KIT.concat('shared/agent/workspace.js'), { document: doc, location: { href: 'http://localhost/' }, SlopIntake: { take: () => {}, spec: () => ({ id: 'x' }) } });
  assert.ok(w2.SlopAgentWorkspace.defs({}).some((d) => d.name === 'open_file'));
  // a command named like another tool gets its own name
  const both = T.unique(defs.concat([{ name: 'download', description: 'the app\'s own', inputSchema: { type: 'object', properties: {} }, run: () => 1 }]));
  assert.deepEqual(both.filter((d) => /^download/.test(d.name)).map((d) => d.name), ['download', 'download_2']);
});

test('names are cleaned to the WebMCP rule', () => {
  assert.equal(T.cleanName('Gaussian blur (fast)!'), 'gaussian_blur_fast');
  assert.equal(T.cleanName(''), 'tool');
  assert.ok(T.cleanName('x'.repeat(300)).length <= 64);
  assert.match(T.cleanName('ünïcode ✓ name'), T.NAME_RE);
  assert.deepEqual(T.checkSchema({ type: 'string' }), ['inputSchema.type must be "object"']);
  assert.equal(T.checkSchema({ type: 'object', properties: { a: { type: 'strin' } } }).length, 1);
  assert.equal(T.checkSchema({ type: 'object', properties: {}, required: ['b'] }).length, 1);
});

test('a picture a tool hands back (look_at_canvas, app snapshots) reaches the agent as MCP image content', async () => {
  const tool = T.toWebMCP({ name: 'look_at_canvas', description: 'x', inputSchema: { type: 'object', properties: {} }, readOnly: true, run: async () => ({ text: 'A 4 × 3 picture.', media: [{ mime: 'image/jpeg', data: 'AAAA', name: 'work' }] }) });
  const r = await tool.execute({});
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { content: [{ type: 'text', text: 'A 4 × 3 picture.' }, { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' }] });
  assert.deepEqual(T.result('plain'), { content: [{ type: 'text', text: 'plain' }] });
});
