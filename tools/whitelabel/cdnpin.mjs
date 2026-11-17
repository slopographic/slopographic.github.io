// Pins a build's raw links to its own file host. This repository's tests (tests/net-urls.txt, test helpers) and notes link
// raw files of the cdn repository at a commit of it; a build's cdn repository is made fresh (cdn.mjs: one commit of its
// own, tagged with the site's TAG), so those commits do not exist there. Every such link is pointed at the build's TAG,
// which holds the same files. Named refs stay: the tests use made-up ones ("test") on purpose, answered by mocks.
// Node only. Tests: tests/node/whitelabel-cdnpin.test.mjs.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const TEXT = /\.(txt|js|mjs|cjs|md|html|json|css|yml)$/;

/** The text with raw.githubusercontent.com/<account>/cdn/<commit>/ links pointed at <tag>. */
export function pinCdn(text, account, tag) {
  const re = new RegExp(`(raw\\.githubusercontent\\.com/${account.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/cdn/)[0-9a-f]{40}/`, 'gi');
  return text.replace(re, (all, head) => `${head}${tag}/`);
}

/** Rewrites every text file of the build in place; returns how many files changed. */
export function pinBuild(out, account, tag, dir = out) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const f = path.join(dir, name), st = statSync(f);
    if (st.isDirectory()) { n += pinBuild(out, account, tag, f); continue; }
    if (!TEXT.test(name) || st.size > 4e6) continue;
    const src = readFileSync(f, 'utf8'), next = pinCdn(src, account, tag);
    if (next !== src) { writeFileSync(f, next); n++; }
  }
  return n;
}
