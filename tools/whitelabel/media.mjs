// A build without this site's media (profile media: false) must not point at this site's videos either: their ids name
// this site's channel. mediaIds() lists them (the apps' tutorials in shared/apps.js and every YouTube link in the
// homepage); stripMedia() takes them out of a build: the video entries of the registry, the links to them (the whole <a>),
// and any other mention (test fixtures) becomes a neutral made-up id. The build then scans for the ids as forbidden.
// Node only. Tests: tests/node/whitelabel-media.test.mjs.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const YT = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/g;
const TEXT = /\.(js|mjs|cjs|html|json|md|txt|css|xml)$/;

/** The video ids this site owns: its registry's tutorials and the homepage's YouTube links. */
export function mediaIds(root) {
  const ids = new Set();
  const apps = path.join(root, 'shared/apps.js');
  if (existsSync(apps)) for (const m of readFileSync(apps, 'utf8').matchAll(/video:\s*\{\s*id:\s*'([\w-]{6,20})'/g)) ids.add(m[1]);
  const home = path.join(root, 'index.html');
  if (existsSync(home)) for (const m of readFileSync(home, 'utf8').matchAll(YT)) ids.add(m[1]);
  return [...ids].sort();
}

/** One text without the ids: registry video entries dropped, links to them dropped, other mentions made up. */
export function stripText(text, ids) {
  if (!ids.length || !ids.some((id) => text.includes(id))) return text;
  const any = ids.map((i) => i.replace(/[-]/g, '\\-')).join('|');
  let out = text.replace(new RegExp(`,?\\s*video:\\s*\\{\\s*id:\\s*'(?:${any})'[^}]*\\}`, 'g'), '');
  out = out.replace(new RegExp(`[ \\t]*<a\\b[^>]*youtu(?:be\\.com|\\.be)[^>]*(?:${any})[^>]*>[\\s\\S]*?</a>[ \\t]*\\n?`, 'g'), '');
  ids.forEach((id, i) => { out = out.split(id).join(`vid${String(i + 1).padStart(8, '0')}`); });
  return out;
}

/** Strips every text file of a build in place; returns how many changed. */
export function stripMedia(out, ids, dir = out) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const f = path.join(dir, name), st = statSync(f);
    if (st.isDirectory()) { n += stripMedia(out, ids, f); continue; }
    if (!TEXT.test(name) || st.size > 4e6) continue;
    const src = readFileSync(f, 'utf8'), next = stripText(src, ids);
    if (next !== src) { writeFileSync(f, next); n++; }
  }
  return n;
}
