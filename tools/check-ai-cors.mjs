#!/usr/bin/env node
// Re-checks whether each AI provider in the catalog (shared/ai/cloud/catalog/*.js) lets a web page call it: sends the
// browser's CORS preflight (OPTIONS with Origin https://slopographic.com, the method and the headers that provider's
// request uses) and prints a table: the catalog's cors value, what the preflight said, and a mark where they differ.
// Run by hand, not in CI (it calls the providers' servers; no key is sent):
//   node tools/check-ai-cors.mjs [--origin https://slopographic.com] [id …]
// Local servers are skipped (they answer only on your computer, depending on how they were started).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const oi = args.indexOf('--origin');
const ORIGIN = oi >= 0 ? args.splice(oi, 2)[1] : 'https://slopographic.com';
const only = new Set(args);
const root = new URL('../', import.meta.url);

/** The catalog, loaded as the browser would (classic scripts in a vm with a pretend window). */
export function catalog(origin = ORIGIN) {
  const w = { location: { origin }, console, URL };
  w.window = w;
  const ctx = vm.createContext(w);
  for (const f of ['net', ...['main', 'open', 'cloud', 'more', 'local', 'images'].map((g) => 'catalog/' + g), 'providers'])
    vm.runInContext(readFileSync(new URL(`shared/ai/cloud/${f}.js`, root), 'utf8'), ctx, { filename: f });
  return w.SlopAIKit.cloud;
}
const C = catalog();

/** The address and headers of the request this provider's format sends (the path the preflight is about). */
const PATH = { anthropic: '/v1/messages', 'openai-responses': '/responses', 'openai-chat': '/chat/completions', gemini: '/v1beta/models/x:streamGenerateContent',
  'openai-images': '/images/generations', fal: '/fal-ai/flux/schnell', stability: '/core', replicate: '/predictions', bfl: '/flux-pro-1.1',
  ideogram: '/v1/ideogram-v3/generate', 'runpod-sync': '/runsync' };
export function probe(p) {
  const vals = Object.fromEntries((p.fields || []).map((f) => [f.id, f.default || f.sample || 'probe1']));
  const url = C.endpoint(C.resolve(p, vals).url, PATH[p.format] || '/');
  const auth = p.auth && typeof p.auth === 'object' ? p.auth.header.toLowerCase() : 'authorization';
  const extra = p.format === 'anthropic' ? ['anthropic-dangerous-direct-browser-access', 'anthropic-version'] : p.format === 'stability' ? ['accept'] : [];
  const headers = [...new Set([auth, 'content-type', ...extra, ...Object.keys(p.headers || {}).map((h) => h.toLowerCase())])].sort();
  return { url, headers };
}

export async function preflight(p) {
  const { url, headers } = probe(p);
  try {
    const res = await fetch(url, { method: 'OPTIONS', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': headers.join(',') } });
    const allow = res.headers.get('access-control-allow-origin') || '';
    const ah = (res.headers.get('access-control-allow-headers') || '').toLowerCase().split(/\s*,\s*/);
    const originOk = allow === '*' || allow === ORIGIN;
    const headersOk = ah.includes('*') || headers.every((h) => ah.includes(h));
    return { status: res.status, allow, ok: res.status < 300 && originOk && headersOk, why: !originOk ? 'origin not allowed' : !headersOk ? 'headers not allowed' : res.status >= 300 ? 'status ' + res.status : '' };
  } catch (e) { return { status: 0, allow: '', ok: false, why: e.name === 'TimeoutError' ? 'timeout' : String(e.cause && e.cause.code || e.message) }; }
}

async function main() {
  const list = C.providers.filter((p) => !p.local && !p.anyAddress && p.base && (!only.size || only.has(p.id)));
  const rows = await Promise.all(list.map(async (p) => [p, await preflight(p)]));
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(pad('provider', 18), pad('group', 12), pad('format', 17), pad('catalog', 12), pad('preflight', 10), pad('allow-origin', 26), 'note');
  let differ = 0;
  for (const [p, r] of rows) {
    const now = r.ok ? 'allowed' : 'refused';
    const same = (p.cors === 'verified') === r.ok || p.cors === 'unknown' || p.blocker === 'auth';
    if (p.blocker === 'auth' && r.ok) r.why = 'CORS allows it; its sign-in needs a server';
    if (!same) differ++;
    console.log(pad(p.id, 18), pad(p.group, 12), pad(p.format, 17), pad(p.cors, 12), pad(now, 10), pad(r.allow || '-', 26), (same ? '' : 'DIFFERS: ') + (r.why || ''));
  }
  console.log(`\n${rows.length} providers checked from ${ORIGIN}; ${differ} differ from the catalog.`);
  process.exitCode = differ ? 1 : 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
