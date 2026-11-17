#!/usr/bin/env node
// How many tokens the AI panel sends: the exact requests each provider gets on the main app pages (a real page in
// Chromium, the panel's own run, a fake fetch: tests/ai/token-probe.js), with an estimate per part.
//   node tools/ai-tokens.mjs [app ids…] [--json] [--count]   prints the table (--count: also asks Anthropic's
//        count_tokens endpoint with ANTHROPIC_API_KEY from the environment, to calibrate the estimate; never printed)
// tests/node/ai-tokens.test.mjs keeps the first request of each app under BUDGET.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APPS = { photoslop: 'photoslop/', pdf: 'pdf/', slopedit: 'slopcut/', workflows: 'workflows/', convert: 'convert/', slides: 'slides/' };
/** The budgets (estimated input tokens): a cloud model's first request, and a local model's (a much smaller prompt).
 * Measured 2026-10-25 with the deferred tools: about 4,600 and 2,100 on the main apps (before: 9,700–20,700). */
export const BUDGET = { first: 7000, local: 3500 };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };

/** Tokens of a text, estimated: about 2.4 characters a token for this mix of English and JSON (calibrated with
 * Anthropic's count_tokens on Claude Haiku 5.5: see the --count option). */
export const estimate = (s) => Math.ceil(String(s == null ? '' : typeof s === 'string' ? s : JSON.stringify(s)).length / 2.4);

/** The parts of one request, per format: system, tools (each), messages (by kind). */
export function parts(id, body) {
  if (id === 'local') {
    const sys = (body.find((m) => m.role === 'system') || {}).content || '';
    return { system: estimate(sys), tools: 0, messages: estimate(body.filter((m) => m.role !== 'system').map((m) => m.content).join('\n')), each: {} };
  }
  let system = '', tools = [], messages = [];
  if (id === 'anthropic') { system = body.system; tools = body.tools || []; messages = body.messages; }
  else if (id === 'openai') { system = body.instructions || ''; tools = body.tools || []; messages = body.input; }
  else if (id === 'openrouter') { tools = body.tools || []; messages = body.messages.filter((m) => m.role !== 'system'); system = body.messages.filter((m) => m.role === 'system'); }
  else if (id === 'gemini') { system = body.systemInstruction || ''; tools = ((body.tools || [])[0] || {}).functionDeclarations || []; messages = body.contents; }
  const name = (t) => t.name || (t.function && t.function.name) || t.type;
  const deferred = (t) => !!t.defer_loading;
  const each = Object.fromEntries(tools.map((t) => [name(t), deferred(t) ? 0 : estimate(t)]));
  return { system: estimate(system), tools: Object.values(each).reduce((a, b) => a + b, 0), messages: estimate(messages), each, deferred: tools.filter(deferred).length, sent: tools.length };
}
export const total = (p) => p.system + p.tools + p.messages;

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* fall through */ }
  for (const p of [path.join(ROOT, 'node_modules/playwright'), '/mnt/nvme4tb/dev/slopographic/site/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
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
      const body = await readFile(f);   // read first: a missing file answers 404, never a 200 that has already gone out
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }).end(body);
    } catch (e) { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

/** Opens each app and returns { [app]: { requests, parts: { [provider]: [parts of request 1, request 2] } } }; null without Playwright. */
export async function measure(apps = Object.keys(APPS), opts = {}) {
  const pw = await loadPlaywright();
  if (!pw) return null;
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await pw.chromium.launch();
  const out = {};
  try {
    for (const app of apps) {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + APPS[app], { waitUntil: 'load' });
      await page.addScriptTag({ path: path.join(ROOT, 'tests/ai/cloud-util.js') });
      await page.addScriptTag({ path: path.join(ROOT, 'tests/ai/token-probe.js') });
      const r = await page.evaluate((o) => window.TokenProbe.run(o), opts.probe || {});
      r.parts = Object.fromEntries(Object.entries(r.requests).map(([id, list]) => [id, list.map((b) => parts(id, b))]));
      r.errors = errors;
      out[app] = r;
      await page.context().close();
    }
  } finally { await browser.close(); server.close(); }
  return out;
}

/** Anthropic's own count of one Messages body (count_tokens takes the same fields, minus streaming and caching). */
export async function countTokens(body, key) {
  // the fake replies' thinking signatures are not real: their blocks are left out (thinking from earlier turns is not counted anyway)
  const messages = body.messages.map((m) => (Array.isArray(m.content) ? Object.assign({}, m, { content: m.content.filter((c) => c.type !== 'thinking') }) : m));
  const b = { model: body.model, system: body.system, messages, tools: body.tools, context_management: body.context_management };
  const h = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21' };
  if (body.context_management) h['anthropic-beta'] = 'context-management-2025-06-27';
  const r = await fetch('https://api.anthropic.com/v1/messages/count_tokens', { method: 'POST', headers: h, body: JSON.stringify(b) });
  const j = await r.json();
  if (!r.ok) throw new Error(`count_tokens ${r.status}: ${(j.error && j.error.message) || ''}`);
  return j.input_tokens;
}

export function table(res) {
  const rows = [['app', 'provider', 'request', 'system', 'tools', 'messages', 'total', 'tools sent (deferred)']];
  for (const [app, r] of Object.entries(res)) for (const [id, list] of Object.entries(r.parts)) list.forEach((p, i) => rows.push([app, id, String(i + 1), p.system, p.tools, p.messages, total(p), id === 'local' ? '-' : `${p.sent} (${p.deferred})`].map(String)));
  const w = rows[0].map((_, c) => Math.max(...rows.map((x) => x[c].length)));
  return rows.map((x) => x.map((v, c) => (c > 2 ? v.padStart(w[c]) : v.padEnd(w[c]))).join('  ')).join('\n');
}
export function heaviest(p, n = 8) {
  return Object.entries(p.each).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), apps = args.filter((a) => !a.startsWith('--'));
  const res = await measure(apps.length ? apps : undefined);
  if (!res) { console.error('Playwright is not installed'); process.exit(2); }
  if (args.includes('--json')) { console.log(JSON.stringify(res, null, 1)); process.exit(0); }
  console.log(table(res));
  for (const [app, r] of Object.entries(res)) {
    console.log(`\n${app}: heaviest tools (anthropic): ${heaviest(r.parts.anthropic[0])}`);
    if (r.errors.length) console.log(`  page errors: ${r.errors.slice(0, 3).join(' | ')}`);
    if (args.includes('--count') && process.env.ANTHROPIC_API_KEY) {
      for (const [i, b] of r.requests.anthropic.entries()) {
        try { console.log(`  count_tokens request ${i + 1}: ${await countTokens(b, process.env.ANTHROPIC_API_KEY)} (estimate ${total(r.parts.anthropic[i])})`); } catch (e) { console.log('  ' + String(e.message).replace(process.env.ANTHROPIC_API_KEY, '…')); }
      }
    }
  }
}
