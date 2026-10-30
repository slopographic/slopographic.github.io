// WebMCP against the browser's real API: Chromium (Playwright's, 156 in CI) with --enable-features=WebMCP has
// document.modelContext (registerTool, getTools, executeTool). The apps register their generated tools there; the browser
// lists them with their schemas, runs one through executeTool, and turning the setting off withdraws them (the abort signal).
// Run: node --test tests/node/agent-real.test.mjs
// Covers: shared/agent/boot.js, shared/agent/webmcp.js, shared/agent/tools.js, shared/agent/workspace.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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
      const body = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }).end(body);
    } catch (e) { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const pw = await loadPlaywright();

test('the real WebMCP API: the tools are registered, listed, run and withdrawn', { skip: !pw && 'Playwright is not installed', timeout: 120000 }, async () => {
  const server = await serve();
  const browser = await pw.chromium.launch({ args: ['--enable-features=WebMCP', '--host-resolver-rules=MAP *.googlesyndication.com ~NOTFOUND, MAP *.googletagmanager.com ~NOTFOUND'] });
  try {
    const page = await browser.newPage();
    const warnings = [];
    page.on('console', (m) => { if (/WebMCP/.test(m.text())) warnings.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/convert/`);
    assert.equal(await page.evaluate(() => typeof document.modelContext), 'object', 'this Chromium has document.modelContext with the flag');
    await page.waitForFunction(() => window.SlopWebMCP && window.SlopWebMCP.tools().length >= 6, null, { timeout: 60000 });
    const listed = await page.evaluate(async () => (await document.modelContext.getTools()).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })));
    const names = listed.map((t) => t.name);
    for (const n of ['list_files', 'save_to_drive', 'download', 'list_operations', 'run_operation', 'run_workflow']) assert.ok(names.includes(n), n + ' in ' + names.join(', '));
    assert.deepEqual(warnings, [], 'every tool was accepted');
    const ops = listed.find((t) => t.name === 'run_operation');
    const schema = typeof ops.inputSchema === 'string' ? JSON.parse(ops.inputSchema) : ops.inputSchema;
    assert.deepEqual(schema.required, ['operation']);   // files or a written input (ai-permissions: input: { name, text | json })

    const out = await page.evaluate(async () => {
      const mc = document.modelContext, tool = (await mc.getTools()).find((t) => t.name === 'list_operations');
      return mc.executeTool(tool, { query: 'resize' });
    });
    const res = typeof out === 'string' ? JSON.parse(out) : out;
    const body = JSON.parse(res.content[0].text);
    assert.ok(body.operations.some((o) => o.id === 'resize.image'), 'list_operations ran in the page');

    await page.evaluate(() => window.SlopAgents.set(false));
    await page.waitForFunction(async () => !(await document.modelContext.getTools()).some((t) => t.name === 'list_files'), null, { timeout: 10000 });
    await page.evaluate(() => window.SlopAgents.set(true));
    await page.waitForFunction(async () => (await document.modelContext.getTools()).some((t) => t.name === 'list_files'), null, { timeout: 20000 });
    assert.deepEqual(warnings, [], 'registered again without a clash of names');
  } finally {
    await browser.close();
    server.close();
  }
});
