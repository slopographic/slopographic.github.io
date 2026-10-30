// End to end: the real Slopographic MCP server as a child process (MCP over its stdio, as Claude Code runs it) and the
// real site in Playwright's Chromium. connect gives a code and the address; the page (?connect=1) shows the dialog, the
// code pairs it, the indicator shows, the page's tools arrive (tools/list_changed); a generated picture goes from a
// local file into Slop Drive, Slop Workflows resizes it through slop_run_workflow, and save_result writes the result
// back to a local file; Disconnect ends it. The help page renders every AI app's setup.
// Run: node --test tests/node/bridge-e2e.test.mjs
// Covers: shared/agent/bridge.js, shared/agent/bridge-ui.js, shared/agent/toolset.js, shared/agent/boot.js, shared/agent/about.js, shared/agent/clients-help.js, shared/agent/webmcp.js, tools/claude-plugin/server/index.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat, mkdtemp, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32 } from '../../tools/claude-plugin/build/zip.mjs';
import { mcpClient } from './bridge-env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* fall through */ }
  for (const p of ['/opt/node22/lib/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
    try { return createRequire(import.meta.url)(p); } catch (e) { /* try next */ }
  }
  return null;
}
function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if ((await stat(f).catch(() => null))?.isDirectory()) f = path.join(f, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }).end(await readFile(f));
    } catch (e) { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}
/** A small PNG (RGB, two colours) made here, so the test needs no image library. */
function png(w, h) {
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows.set(x < w / 2 ? [32, 192, 240] : [224, 48, 106], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const text = (r) => { assert.ok(r.result, JSON.stringify(r.error)); assert.ok(!r.result.isError, r.result.content[0].text); return r.result.content[0].text; };

const pw = await loadPlaywright();

test('Claude Code ↔ bridge ↔ the Workflows tab: pair, tools, a file in, a workflow, a result out, disconnect', { skip: !pw && 'Playwright is not installed', timeout: 180000 }, async () => {
  const site = await serve(), S = site.address().port, P = 48200 + (process.pid % 40) * 2;
  const work = await mkdtemp(path.join(tmpdir(), 'slop-e2e-'));
  await writeFile(path.join(work, 'pic.png'), png(120, 80));
  const child = spawn(process.execPath, [path.join(ROOT, 'tools/claude-plugin/server/index.mjs')], { stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, SLOPOGRAPHIC_PORT: String(P), SLOPOGRAPHIC_ORIGINS: 'http://localhost', SLOPOGRAPHIC_NO_OPEN: '1', SLOPOGRAPHIC_ROOT: work, SLOPOGRAPHIC_SITE: `http://127.0.0.1:${S}` } });
  let log = '';
  child.stderr.on('data', (d) => { log += d; });
  const browser = await pw.chromium.launch({ args: ['--host-resolver-rules=MAP *.googlesyndication.com ~NOTFOUND, MAP *.googletagmanager.com ~NOTFOUND'] });
  try {
    const mcp = mcpClient(child.stdin, child.stdout);
    const init = await mcp.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1' } });
    assert.equal(init.result.serverInfo.name, 'slopographic');
    mcp.notify('notifications/initialized');
    const said = text(await mcp.request('tools/call', { name: 'connect', arguments: { app: 'workflows' } }));
    const code = /Pairing code: ([A-Z0-9]{3}-[A-Z0-9]{3})/.exec(said)[1];
    const url = /(http:\/\/127\.0\.0\.1:\d+\/workflows\/\?connect=1&port=\d+)/.exec(said)[1];

    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    // the checks read the English copy: a visitor who chose English (a build may start in another language, as SlopTest.english)
    await page.addInitScript(() => { try { localStorage.setItem('slop-profile', JSON.stringify({ v: 1, data: { lang: { mode: 'en' } } })); } catch (e) { /* storage blocked */ } });
    await page.goto(url);
    await page.waitForSelector('.sbr-dialog .sbr-code', { timeout: 60000 });
    await page.waitForFunction(() => /Claude Code is there/.test(document.querySelector('.sbr-status').textContent), null, { timeout: 30000 });
    await page.fill('.sbr-code', 'WRO-NGG');
    await page.click('.sbr-dialog .sui-primary');
    await page.waitForFunction(() => /not right\. 4 tries left/.test(document.querySelector('.sbr-status').textContent), null, { timeout: 10000 });
    await page.fill('.sbr-code', code.toLowerCase());
    await page.click('.sbr-dialog .sui-primary');
    await page.waitForSelector('.sbr-pill', { timeout: 15000 });
    assert.match(await page.textContent('.sbr-pill'), /Claude Code is connected/);
    const st = JSON.parse(text(await mcp.request('tools/call', { name: 'status', arguments: { wait_seconds: 20 } })));
    assert.equal(st.connected, true); assert.equal(st.tabs[0].app, 'workflows');
    await mcp.next((m) => m.method === 'notifications/tools/list_changed', 30000);
    let names = [];
    for (let i = 0; i < 40 && !names.includes('slop_run_workflow'); i++) {
      names = (await mcp.request('tools/list')).result.tools.map((t) => t.name);
      if (!names.includes('slop_run_workflow')) await new Promise((r) => setTimeout(r, 500));
    }
    for (const n of ['slop_list_files', 'slop_run_workflow', 'slop_run_operation', 'slop_download', 'send_file_to_app', 'save_result']) assert.ok(names.includes(n), n + ' in ' + names.join(', '));

    // a local file in (Slop Drive), a workflow on it, the result out to a local file
    const put = text(await mcp.request('tools/call', { name: 'send_file_to_app', arguments: { path: 'pic.png', into: 'drive' } }));
    const id = /id ([^)]+)\)/.exec(put)[1];
    const flow = { kind: 'slopflow', v: 1, name: 'Bridge test', steps: [{ kind: 'op', id: 'resize.image', options: { mode: 'size', width: 60, height: 40, fit: 'stretch', format: 'png' } },
      { kind: 'op', id: 'files.rename', options: { pattern: 'small-{n}', digits: 1 } }] };
    const ran = JSON.parse(text(await mcp.request('tools/call', { name: 'slop_run_workflow', arguments: { workflow: flow, files: [id] } }, 90000)));
    assert.deepEqual(ran.errors, []);
    const made = ran.files[0].name;
    const saved = text(await mcp.request('tools/call', { name: 'save_result', arguments: { file: made, path: 'out/' } }, 30000));
    assert.match(saved, /Saved small-1\.png/);
    const res = await readFile(path.join(work, 'out', made));
    assert.equal(res.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual([res.readUInt32BE(16), res.readUInt32BE(20)], [60, 40]);
    const outside = await mcp.request('tools/call', { name: 'save_result', arguments: { file: made, path: '/etc/x.png' } });
    assert.equal(outside.result.isError, true);

    // a reload stays paired; Disconnect in the page ends it for the AI app
    await page.reload();
    await page.waitForSelector('.sbr-pill', { timeout: 60000 });
    await page.click('.sbr-pill .sui-btn');
    await page.waitForFunction(() => !document.querySelector('.sbr-pill'), null, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(JSON.parse(text(await mcp.request('tools/call', { name: 'status', arguments: {} }))).connected, false);
    assert.ok(!(await mcp.request('tools/list')).result.tools.some((t) => t.name.startsWith('slop_')), 'no page tools after Disconnect');

    // the help page: every AI app's setup, from shared/agent/clients.js
    const help = await browser.newPage();
    await help.goto(`http://127.0.0.1:${S}/how-it-works/#ai-apps`);
    await help.waitForSelector('.sac-client', { timeout: 20000 });
    const count = await help.evaluate(() => document.querySelectorAll('.sac-client').length);
    assert.equal(count, createRequire(import.meta.url)('../../shared/agent/clients.js').list.length);
  } catch (e) { e.message += '\nbridge log:\n' + log; throw e; } finally {
    await browser.close();
    child.kill();
    site.close();
  }
});
