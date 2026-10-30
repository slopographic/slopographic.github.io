#!/usr/bin/env node
// The CI slices' results (tests/run.mjs --results=<file>, uploaded as the "browser-results-<n>" artifacts) turned into the
// two files the next runs use:
//   tests/timings.json    every page's seconds, which balance the slices (tests/shard.mjs)
//   tests/net-urls.txt    "<page> <url>" for every file a page fetched through the download cache (tests/netcache.mjs):
//                         a slice restores CI's cache only when one of its pages is listed, and the cache key is its hash
//   node tests/results.mjs <results.json or folder>...     rewrites both files (pages not in the results keep their times;
//                                                          pages that are gone are dropped)
//   node tests/results.mjs --top=20 <...>                  prints the slowest pages and their slowest tests instead
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TIMINGS = path.join(ROOT, 'tests', 'timings.json'), NET_URLS = path.join(ROOT, 'tests', 'net-urls.txt');

/** The pages of several results files as one { page: { secs, net, tests } } (a page in several files: its slowest run). */
export function mergeResults(list) {
  const out = {};
  for (const r of list) for (const [p, v] of Object.entries(r.pages || {})) if (!out[p] || v.secs > out[p].secs) out[p] = v;
  return out;
}
/** The new timings: the old ones, this run's seconds in place, pages that no longer exist dropped, keys in order. */
export function newTimings(old, pages, exists = () => true) {
  const all = { ...old };
  for (const [p, v] of Object.entries(pages)) all[p] = Math.round(v.secs * 10) / 10;
  return Object.fromEntries(Object.keys(all).filter(exists).sort().map((k) => [k, all[k]]));
}
/** The net-urls.txt lines: "<page> <url>", sorted. */
export function netLines(pages) {
  return Object.entries(pages).flatMap(([p, v]) => (v.net?.urls || []).map((u) => `${p} ${u}`)).sort();
}
/** net-urls.txt read back as { pages: Set, urls: [unique urls] }. */
export function parseNetUrls(text) {
  const rows = String(text || '').split('\n').map((l) => l.trim().split(/\s+/)).filter((r) => r.length === 2);
  return { pages: new Set(rows.map((r) => r[0])), urls: [...new Set(rows.map((r) => r[1]))].sort() };
}

async function readAll(args) {
  const files = [];
  for (const a of args) {
    if ((await stat(a)).isDirectory()) { for (const e of await readdir(a, { recursive: true })) if (e.endsWith('.json')) files.push(path.join(a, e)); }
    else files.push(a);
  }
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(f, 'utf8'))));
}
async function main(argv) {
  const top = Number((argv.find((a) => a.startsWith('--top=')) || '').slice(6)) || 0;
  const pages = mergeResults(await readAll(argv.filter((a) => !a.startsWith('--'))));
  if (top) {
    for (const [p, v] of Object.entries(pages).sort((a, b) => b[1].secs - a[1].secs).slice(0, top)) {
      const n = v.net || {};
      console.log(`${v.secs.toFixed(1).padStart(6)} s  ${p}${n.misses || n.hits ? `  (net: ${n.hits} cached, ${n.misses} fetched, ${(n.bytes / 1e6).toFixed(0)} MB, ${(n.ms / 1000).toFixed(1)} s)` : ''}`);
      for (const t of [...v.tests].sort((a, b) => b.ms - a.ms).slice(0, 3)) console.log(`         ${String(t.ms).padStart(6)} ms  ${t.name.slice(0, 100)}`);
    }
    return;
  }
  const old = JSON.parse(await readFile(TIMINGS, 'utf8').catch(() => '{}'));
  await writeFile(TIMINGS, JSON.stringify(newTimings(old, pages, (p) => existsSync(path.join(ROOT, p))), null, 1) + '\n');
  await writeFile(NET_URLS, netLines(pages).join('\n') + '\n');
  console.log(`${Object.keys(pages).length} pages: tests/timings.json and tests/net-urls.txt written`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
