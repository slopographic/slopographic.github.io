// The test pages' network: what each page fetched from outside the local server, and a disk cache for the big immutable
// files some pages download (real AI models, wasm, fonts from the model hosts and CDNs). tests/run.mjs uses it:
//   attachNet(context, { dir, route })   routes GET requests to CACHE_HOSTS through tests/.cache/net/ (filled on a miss,
//                                 from the real host) and counts every outside request of the page. route: false only
//                                 counts (run.mjs routes the pages listed in tests/net-urls.txt): once a context has a route,
//                                 Playwright aborts every request whose URL ends in /favicon.ico (its favicon rule), which
//                                 breaks pages that fetch the site's favicon.ico themselves (the offline builders)
// The bytes are the real ones (the pages check models against their SHA-256); only the transfer is saved. CI keeps the
// folder between runs (actions/cache in .github/workflows/rules.yml). SLOPTEST_NET_CACHE=0 turns the cache off.
//   node tests/netcache.mjs --fill    downloads every file in tests/net-urls.txt that the cache lacks (CI's check job does
//                                     this when the list changed, so the browser slices find a full cache)
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNetUrls, NET_URLS } from './results.mjs';

export const NET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache', 'net');

/** Hosts whose files are pinned (a commit, a version or a content hash in the URL), so a stored copy stays right. */
export const CACHE_HOSTS = /^(huggingface\.co|([a-z0-9-]+\.)*hf\.co|cdn\.jsdelivr\.net|unpkg\.com|raw\.githubusercontent\.com|objects\.githubusercontent\.com|cdnjs\.cloudflare\.com)$/;
const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/;
// Headers that described the transfer, not the file: Playwright returns the body decoded and sets its own length.
const DROP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'set-cookie']);

/** The cache file name of a URL. */
export const keyOf = (url) => createHash('sha256').update(url).digest('hex').slice(0, 40);
/** Whether a request may be served from the cache: a plain GET of a whole file on a cached host. */
export function cacheable(method, url, headers = {}) {
  let u; try { u = new URL(url); } catch (e) { return false; }
  return method === 'GET' && u.protocol === 'https:' && CACHE_HOSTS.test(u.hostname) && !headers.range;
}
/** The headers to store and replay for a fetched response. */
export function keptHeaders(h) { return Object.fromEntries(Object.entries(h).filter(([k]) => !DROP.has(k.toLowerCase()))); }

/** A stored response, { meta, body }, or null when it is missing or cut short. */
export async function load(dir, url) {
  const file = path.join(dir, keyOf(url));
  const meta = await readFile(file + '.json', 'utf8').then(JSON.parse).catch(() => null);
  const body = meta && await readFile(file + '.bin').catch(() => null);
  return meta && body && body.length === meta.size && meta.url === url ? { meta, body } : null;
}
/** Stores a 200 response (body first, then its meta, each renamed into place, so a reader never sees half a file). */
export async function store(dir, url, { final = url, headers, body }) {
  const file = path.join(dir, keyOf(url)), tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}`;
  await mkdir(dir, { recursive: true });
  await writeFile(tmp + '.bin', body); await rename(tmp + '.bin', file + '.bin');
  await writeFile(tmp + '.json', JSON.stringify({ url, final, status: 200, size: body.length, headers: keptHeaders(headers) })); await rename(tmp + '.json', file + '.json');
}

/** Routes a browser context's outside requests through the cache. Returns the page's network tally: { hits, misses, bytes,
 *  ms, outside: { host: count } } (bytes and ms: what the misses cost). */
export async function attachNet(ctx, { dir, enabled = process.env.SLOPTEST_NET_CACHE !== '0', route = true } = {}) {
  const tally = { hits: 0, misses: 0, bytes: 0, ms: 0, outside: {}, urls: new Set() };
  ctx.on('request', (r) => {
    let h; try { h = new URL(r.url()).hostname; } catch (e) { return; }
    if (/^https?:$/.test(new URL(r.url()).protocol) && !LOCAL.test(h)) tally.outside[h] = (tally.outside[h] || 0) + 1;
    if (cacheable(r.method(), r.url(), r.headers())) tally.urls.add(r.url());   // listed in net-urls.txt even when not routed
  });
  if (!enabled || !route) return tally;
  await mkdir(dir, { recursive: true });
  await ctx.route((u) => CACHE_HOSTS.test(u.hostname) && u.protocol === 'https:', async (route) => {
    const req = route.request(), url = req.url();
    if (!cacheable(req.method(), url, req.headers())) return route.continue();
    const hit = await load(dir, url);
    if (hit) { tally.hits++; return route.fulfill({ status: hit.meta.status, headers: hit.meta.headers, body: hit.body }); }
    const t0 = Date.now();
    let res;
    try { res = await route.fetch({ timeout: 600000 }); } catch (e) { return route.abort('failed').catch(() => {}); }
    const got = await res.body();
    tally.misses++; tally.bytes += got.length; tally.ms += Date.now() - t0;
    const headers = keptHeaders(res.headers());
    if (res.status() === 200) await store(dir, url, { final: res.url(), headers, body: got });
    return route.fulfill({ status: res.status(), headers, body: got });
  });
  return tally;
}

/** The URLs in the cache folder, sorted (the CI cache key is a hash of this list). */
export async function cachedUrls(dir) {
  const names = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'));
  const urls = await Promise.all(names.map((f) => readFile(path.join(dir, f), 'utf8').then((t) => JSON.parse(t).url).catch(() => null)));
  return urls.filter(Boolean).sort();
}

/** Downloads the listed URLs the cache lacks, a few at a time. */
export async function fill(urls, dir = NET_DIR) {
  const todo = [];
  for (const u of urls) if (!(await load(dir, u))) todo.push(u);
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let u; (u = todo.shift());) {
      const r = await fetch(u);
      if (r.status !== 200) throw new Error(`${u}: HTTP ${r.status}`);
      await store(dir, u, { final: r.url, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
      console.log(`fetched ${u}`);
    }
  }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--fill') {
  const { urls } = parseNetUrls(await readFile(NET_URLS, 'utf8').catch(() => ''));
  await fill(urls);
  console.log(`download cache: ${(await cachedUrls(NET_DIR)).length} files for ${urls.length} listed`);
}
