#!/usr/bin/env node
// Checks the real hosts: every cdn file the apps use (tools/cdn-assets.mjs) answers a HEAD request with 200 and its
// expected size, at the first place shared/cdn/assets.js gives it (jsDelivr at the release tag; GitHub for the files
// over jsDelivr's limit). jsDelivr must answer for the release itself (x-jsd-version), and it sends no length for the
// files it compresses (scripts, wasm, fonts): their size is then read from the GitHub copy at the same tag, which
// jsDelivr mirrors. Run in CI (rules.yml, the check job), so a file missing from the tag is found before a person meets it.
//   node tools/check-cdn.mjs          16 requests at a time; exit 1 on any wrong answer
//   --all                             also every fallback place (GitHub for the jsDelivr files)
// Without a network (a laptop offline, a sandbox) it says so and exits 0; in CI (CI=true) no network is a failure.
import https from 'node:https';
import { allAssets, C } from './cdn-assets.mjs';

const ALL = process.argv.includes('--all');
const JOBS = 16;
const JSD = 'https://cdn.jsdelivr.net/', VERSION = C.TAG.replace(/^v/, '');
/** HEAD with up to 3 tries (a cold jsDelivr file can time out once while it is fetched from GitHub). */
async function tries(url) {
  let r = null;
  for (let i = 0; i < 3 && !(r && r.status === 200); i++) r = await head(url).catch((e) => ({ status: e.message, size: -1 }));
  return r;
}

/** HEAD url, following up to 3 redirects. Resolves { status, size, version } (size from content-length, -1 when absent or
 *  compressed; version: jsDelivr's x-jsd-version). */
function head(url, hops = 3) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD', headers: { 'accept-encoding': 'identity', 'user-agent': 'slopographic-check-cdn' }, timeout: 30000 }, (res) => {
      res.resume();
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops > 0) { resolve(head(new URL(res.headers.location, url).href, hops - 1)); return; }
      const h = res.headers, plain = !h['content-encoding'] || h['content-encoding'] === 'identity';
      resolve({ status: res.statusCode, size: h['content-length'] !== undefined && plain ? Number(h['content-length']) : -1, version: h['x-jsd-version'] || null });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end();
  });
}

async function online() {
  try { await head(C.url('README.md')); return true; } catch (e) { return false; }
}

async function main() {
  if (!(await online())) {
    if (process.env.CI) { console.error('check-cdn: no network in CI'); process.exit(1); }
    console.log('check-cdn: no network here, skipped (CI runs it)');
    return;
  }
  const assets = await allAssets();
  const jobs = assets.flatMap((a) => (ALL ? C.urls(a.path) : [C.url(a.path)]).map((url) => ({ ...a, url })));
  const bad = [];
  let next = 0;
  const t0 = Date.now();
  async function worker() {
    while (next < jobs.length) {
      const j = jobs[next++];
      const r = await tries(j.url);
      if (r.status !== 200) { bad.push(`${j.url}: ${r.status} (${j.from})`); continue; }
      if (j.url.startsWith(JSD) && r.version !== VERSION) bad.push(`${j.url}: jsDelivr answered for version ${r.version}, not ${VERSION}`);
      let size = r.size;
      if (size < 0) size = (await tries(C.urls(j.path).at(-1))).size;   // compressed by jsDelivr: the GitHub copy's length
      if (size !== j.size) bad.push(`${j.url}: ${size} bytes, expected ${j.size} (${j.from})`);
    }
  }
  await Promise.all(Array.from({ length: JOBS }, worker));
  const jsd = jobs.filter((j) => j.url.startsWith(JSD)).length;
  console.log(`check-cdn: ${jobs.length} URLs at ${C.TAG} (${jsd} on jsDelivr, ${jobs.length - jsd} on GitHub) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
}
await main();
