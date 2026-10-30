// The bridge between the AI app and the Slopographic tab: only loopback, only the allowed origins, nothing before
// pairing, a wrong code refused (and the code gone after 5), a token after pairing that a reload reuses, the tab's
// tools proxied under stable slop_ names, calls into the tab, files in and out in chunks, and the path rules.
// Run: node --test tests/node/bridge-pairing.test.mjs
// Covers: tools/claude-plugin/server/bridge.mjs, tools/claude-plugin/server/tools.mjs, tools/claude-plugin/server/files.mjs, tools/claude-plugin/server/open.mjs, tools/claude-plugin/server/index.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBridge, originAllowed, hostAllowed, normCode, CHUNK, ORIGINS } from '../../tools/claude-plugin/server/bridge.mjs';
import { createTools, proxyName, MAX_NAME } from '../../tools/claude-plugin/server/tools.mjs';
import { resolvePath, workRoot } from '../../tools/claude-plugin/server/files.mjs';
import { command, openUrl } from '../../tools/claude-plugin/server/open.mjs';
import { clientLabel } from '../../tools/claude-plugin/server/index.mjs';
import { wsConnect } from './bridge-env.mjs';

const port0 = 47950 + (process.pid % 20) * 2;
async function start(extra = {}) {
  const bridge = createBridge({ ports: [port0, port0 + 1], clientName: () => 'Claude Code', ...extra });
  const port = await bridge.listen();
  return { bridge, port };
}
const page = async (port, o) => { const c = await wsConnect(port, o); assert.equal(c.status, 101); return c; };

test('origins, hosts and codes: the allow-list and its edges', () => {
  for (const o of ORIGINS) assert.ok(originAllowed(o));
  for (const o of ['https://evil.example', 'http://slopographic.com', 'https://slopographic.com.evil.example', 'https://slopographic.com/', 'null', '', undefined, 'http://localhost:8080'])
    assert.equal(originAllowed(o), false, String(o));
  const dev = [...ORIGINS, 'http://localhost'];
  assert.ok(originAllowed('http://localhost:8080', dev)); assert.ok(originAllowed('http://127.0.0.1:5000', dev));
  assert.equal(originAllowed('http://192.168.1.4:5000', dev), false);
  assert.ok(hostAllowed('127.0.0.1:47821', 47821)); assert.ok(hostAllowed('LOCALHOST:47821', 47821));
  assert.equal(hostAllowed('evil.example:47821', 47821), false); assert.equal(hostAllowed('127.0.0.1:1', 47821), false);
  assert.equal(normCode(' k7q-4mz '), 'K7Q4MZ');
});

test('a wrong origin or host is refused at the handshake; nothing is offered before pairing', async () => {
  const { bridge, port } = await start();
  try {
    assert.equal((await wsConnect(port, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await wsConnect(port, { origin: null })).status, 403);
    assert.equal((await wsConnect(port, { host: `rebind.example:${port}` })).status, 403);
    const tools = createTools({ bridge, root: tmpdir() });
    const c = await page(port);
    c.send({ t: 'hello', app: 'photoslop', appName: 'PhotoSlop' });
    await c.next('need-pair');
    c.send({ t: 'tools', tools: [{ name: 'blur', description: 'x', inputSchema: { type: 'object' } }] });
    assert.match((await c.next('refused')).data.reason, /Pair first/);
    assert.equal(bridge.tabs().length, 0);
    assert.deepEqual(tools.list().map((t) => t.name), ['connect', 'status', 'use_tab', 'send_file_to_app', 'save_result', 'disconnect']);
    await assert.rejects(tools.call('send_file_to_app', { path: 'x' }), /No Slopographic tab/);
  } finally { bridge.close(); }
});

test('pairing: no code waiting, a wrong code, 5 wrong codes, then the right one; the token is reused after a reload', async () => {
  const { bridge, port } = await start();
  try {
    const a = await page(port);
    a.send({ t: 'hello', app: 'workflows' }); await a.next('need-pair');
    a.send({ t: 'pair', code: 'AAAAAA' });
    assert.match((await a.next('refused')).data.reason, /No pairing code/);
    let code = bridge.newCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
    const b = await page(port);
    b.send({ t: 'hello', app: 'workflows' }); await b.next('need-pair');
    const wrong = normCode(code) === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    for (let left = 4; left >= 1; left--) { b.send({ t: 'pair', code: wrong }); assert.equal((await b.next('pair-wrong')).data.left, left); }
    b.send({ t: 'pair', code: wrong });
    assert.match((await b.next('refused')).data.reason, /Too many wrong codes/);
    assert.equal(bridge.codeWaiting(), false, 'the code is gone');
    code = bridge.newCode();
    const c = await page(port);
    c.send({ t: 'hello', app: 'workflows', appName: 'Slop Workflows' }); await c.next('need-pair');
    c.send({ t: 'pair', code: code.toLowerCase() });
    const ok = (await c.next('paired')).data;
    assert.match(ok.token, /^[0-9a-f]{64}$/); assert.equal(ok.client, 'Claude Code');
    assert.equal(bridge.codeWaiting(), false, 'single use');
    assert.equal(bridge.tabs()[0].appName, 'Slop Workflows');
    c.close();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(bridge.tabs().length, 0);
    const again = await page(port);
    again.send({ t: 'hello', app: 'photoslop', token: ok.token });
    assert.equal((await again.next('paired')).data.tab, ok.tab, 'a reload keeps its tab id');
    const forged = await page(port);
    forged.send({ t: 'hello', token: 'f'.repeat(64) });
    await forged.next('need-pair');
  } finally { bridge.close(); }
});

test('the tab\'s tools under slop_ names, calls, list changes, files in and out in chunks, two tabs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'slop-bridge-'));
  const { bridge, port } = await start();
  const tools = createTools({ bridge, root });
  let changes = 0;
  bridge.on('change', () => { if (tools.changed()) changes++; });
  try {
    bridge.newCode();
    const code = bridge.newCode();
    const c = await page(port);
    c.send({ t: 'hello', app: 'photoslop', appName: 'PhotoSlop' }); await c.next('need-pair');
    c.send({ t: 'pair', code }); await c.next('paired');
    c.send({ t: 'tools', tools: [{ name: 'app_state', description: 'state', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
      { name: 'gaussian.blur', description: 'blur', inputSchema: { type: 'object', properties: { radius: { type: 'number' } } }, annotations: { destructiveHint: false } },
      { name: 'x'.repeat(80), description: 'long', inputSchema: { type: 'object' } }] });
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(changes >= 1, 'a list change for the AI app');
    const names = tools.list().map((t) => t.name);
    assert.ok(names.includes('slop_app_state') && names.includes('slop_gaussian_blur'), names.join());
    assert.ok(names.every((n) => /^[a-z0-9_-]+$/i.test(n) && n.length <= MAX_NAME), 'names fit model APIs');
    assert.equal(tools.list().find((t) => t.name === 'slop_app_state').annotations.readOnlyHint, true);
    // a call goes to the page and its result comes back
    const call = tools.call('slop_gaussian_blur', { radius: 8 });
    const m = (await c.next('call')).data;
    assert.deepEqual([m.name, m.args], ['gaussian.blur', { radius: 8 }]);
    c.send({ t: 'result', id: m.id, result: { content: [{ type: 'text', text: 'Done: blur 8' }] } });
    assert.equal((await call).content[0].text, 'Done: blur 8');
    // a file in: chunks, then @receive
    const bytes = Buffer.alloc(CHUNK * 2 + 1234); for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) & 255;
    await writeFile(path.join(root, 'in.bin'), bytes);
    const sent = tools.call('send_file_to_app', { path: 'in.bin', into: 'drive' });
    const parts = [];
    for (let i = 0; i < 3; i++) parts.push((await c.next('chunk')).data);
    const rec = (await c.next('call')).data;
    assert.equal(rec.name, '@receive'); assert.deepEqual([rec.args.size, rec.args.chunks, rec.args.into], [bytes.length, 3, 'drive']);
    assert.ok(Buffer.concat(parts.sort((x, y) => x.i - y.i).map((p) => Buffer.from(p.data, 'base64'))).equals(bytes));
    c.send({ t: 'result', id: rec.id, result: { content: [{ type: 'text', text: 'Put in.bin in Slop Drive' }] } });
    assert.match((await sent).content[0].text, /Slop Drive/);
    // a file out: the page sends chunks, then the result names them
    const saved = tools.call('save_result', { file: 'out.bin', path: 'out/' });
    const ex = (await c.next('call')).data;
    assert.equal(ex.name, '@export');
    for (let i = 0; i < 3; i++) c.send({ t: 'chunk', id: ex.id, i, data: bytes.subarray(i * CHUNK, (i + 1) * CHUNK).toString('base64') });
    c.send({ t: 'result', id: ex.id, result: { name: 'out.bin', type: 'application/octet-stream', size: bytes.length, chunks: 3 } });
    assert.match(await saved, /Saved out\.bin/);
    assert.ok((await readFile(path.join(root, 'out', 'out.bin'))).equals(bytes));
    // the same again does not overwrite
    const again = tools.call('save_result', { file: 'out.bin', path: 'out/out.bin' });
    const ex2 = (await c.next('call')).data;
    c.send({ t: 'chunk', id: ex2.id, i: 0, data: 'AA==' });
    c.send({ t: 'result', id: ex2.id, result: { name: 'out.bin', size: 1, chunks: 1 } });
    await assert.rejects(again, /already exists/);
    // a second tab becomes active; use_tab switches back
    const code2 = bridge.newCode();
    const d = await page(port);
    d.send({ t: 'hello', app: 'pdf', appName: 'Slop PDF' }); await d.next('need-pair');
    d.send({ t: 'pair', code: code2 }); await d.next('paired');
    const st = await tools.call('status', {}, {});
    assert.equal(st.tabs.length, 2); assert.equal(st.tabs.find((t) => t.active).appName, 'Slop PDF');
    assert.ok(!tools.list().some((t) => t.name === 'slop_gaussian_blur'), 'the active tab\'s tools only');
    tools.call('use_tab', { tab: st.tabs.find((t) => t.appName === 'PhotoSlop').id });
    assert.ok(tools.list().some((t) => t.name === 'slop_gaussian_blur'));
    // a closed tab fails its pending call
    const pending = tools.call('slop_app_state', {});
    await c.next('call');
    c.close();
    await assert.rejects(pending, /closed or left/);
    // disconnect ends the rest
    tools.call('disconnect', {});
    await d.next((x) => x.type === 8 || x.type === 'eof');
  } finally { bridge.close(); }
});

test('paths stay in the working folder unless named; the browser opener; client names', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'slop-root-'));
  assert.equal(await resolvePath('a/b.png', { root }), path.join(root, 'a/b.png'));
  await assert.rejects(resolvePath('../x.png', { root }), /outside the working folder/);
  await assert.rejects(resolvePath('/etc/passwd', { root }), /allow_outside/);
  assert.equal(await resolvePath('/etc/passwd', { root, outside: true }), '/etc/passwd');
  await symlink(tmpdir(), path.join(root, 'link')).catch(() => null);
  await assert.rejects(resolvePath('link/escape.txt', { root }), /outside/, 'a symlink out of the folder is outside');
  assert.equal(workRoot({ SLOPOGRAPHIC_ROOT: '${CLAUDE_PROJECT_DIR}' }), process.cwd());
  assert.equal(workRoot({ SLOPOGRAPHIC_ROOT: root }), root);
  assert.deepEqual(command('https://slopographic.com/?connect=1&port=1', 'win32'), ['rundll32', ['url.dll,FileProtocolHandler', 'https://slopographic.com/?connect=1&port=1']]);
  assert.equal(command('https://x.y', 'darwin')[0], 'open'); assert.equal(command('https://x.y', 'linux')[0], 'xdg-open');
  assert.equal(await openUrl('https://slopographic.com', { env: { SLOPOGRAPHIC_NO_OPEN: '1' } }), false);
  assert.equal(await openUrl('javascript:alert(1)', { env: {} }), false);
  assert.equal(proxyName('connect'), 'slop_connect');
  assert.equal(clientLabel({ name: 'claude-code' }), 'Claude Code'); assert.equal(clientLabel({ name: 'codex-mcp-client' }), 'Codex');
  assert.equal(clientLabel({ name: 'Visual Studio Code' }), 'VS Code'); assert.equal(clientLabel(null), 'your AI app');
});
