#!/usr/bin/env node
// A real WebGPU check of the local models: Chromium with WebGPU on SwiftShader (a software GPU) loads the vendored WebLLM
// (vendor/web-llm) and the smallest model far enough to compile every shader module and pipeline, then generates a few
// tokens. It catches model libraries that the browser's WGSL compiler (Tint) no longer accepts. Heavy: run by
// .github/workflows/webgpu.yml (nightly, by hand, and when vendor/web-llm or shared/ai/catalog.js change), not by `npm test`.
//   node tools/webgpu-check.mjs [--profile=<dir>] [--ids=a,b]   the profile keeps the downloaded model between runs
// Writes a Markdown table to $GITHUB_STEP_SUMMARY when set. Exit 1 when a model the adapter can run fails.
// SwiftShader has no shader-f16, so q4f16 builds are reported as "not testable here" (they need a real GPU).
import http from 'node:http';
import { readFile, stat, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const IDS = ['Qwen2.5-0.5B-Instruct-q4f32_1-MLC', 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'];
export const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-webgpu-adapter=swiftshader'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };

/** One row per model: { id, status: 'ok' | 'failed' | 'untestable', seconds, text, error }. */
export function summarize(adapter, rows) {
  const icon = { ok: '✅', failed: '❌', untestable: '➖' };
  const lines = ['## WebGPU check (vendored WebLLM on SwiftShader)', '',
    `Adapter: ${adapter ? `${adapter.vendor || '?'} ${adapter.architecture || ''}, shader-f16: ${adapter.f16 ? 'yes' : 'no'}` : 'none'}`, '',
    '| Model | Result | Seconds | Output or error |', '|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.id} | ${icon[r.status] || ''} ${r.status} | ${r.seconds == null ? '' : r.seconds} | ${String(r.error || r.text || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 200)} |`);
  return lines.join('\n') + '\n';
}
export const failed = (rows) => rows.some((r) => r.status === 'failed');

function serve() {
  const s = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/__check.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>WebGPU check</title>'); }
      let f = path.join(ROOT, decodeURIComponent(u.pathname));
      if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if ((await stat(f).catch(() => null))?.isDirectory()) f = path.join(f, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
    } catch (e) { res.writeHead(404).end(); }
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

/** In the page: load one model with the vendored WebLLM and generate a few tokens. */
async function loadAndGenerate(id) {
  const w = await import('/vendor/web-llm/web-llm.js');
  const t0 = performance.now();
  const engine = await w.CreateMLCEngine(id, {});
  const r = await engine.chat.completions.create({ messages: [{ role: 'user', content: 'Say hello in three words.' }], max_tokens: 8 });
  await engine.unload();
  return { text: r.choices[0].message.content, seconds: Math.round((performance.now() - t0) / 100) / 10 };
}

async function main() {
  const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
  const ids = arg('ids') ? arg('ids').split(',') : IDS;
  const { chromium } = await import('playwright');
  const server = await serve();
  const ctx = await chromium.launchPersistentContext(arg('profile') || path.join(ROOT, '.webgpu-profile'), { args: ARGS, headless: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${server.address().port}/__check.html`);
  const adapter = await page.evaluate(async () => { const a = navigator.gpu && (await navigator.gpu.requestAdapter()); return a ? Object.assign({ f16: a.features.has('shader-f16') }, { vendor: a.info.vendor, architecture: a.info.architecture }) : null; });
  const rows = [];
  for (const id of ids) {
    if (!adapter) { rows.push({ id, status: 'failed', error: 'No WebGPU adapter' }); continue; }
    if (/q4f16/.test(id) && !adapter.f16) { rows.push({ id, status: 'untestable', error: 'this adapter has no shader-f16 (a real GPU is needed)' }); continue; }
    try {
      const r = await page.evaluate(loadAndGenerate, id);
      rows.push(Object.assign({ id, status: r.text && r.text.trim() ? 'ok' : 'failed' }, r));
    } catch (e) { rows.push({ id, status: 'failed', error: String(e.message || e) }); }
    console.log(rows[rows.length - 1]);
  }
  const md = summarize(adapter, rows);
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
  await ctx.close(); server.close();
  process.exit(failed(rows) ? 1 : 0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
