#!/usr/bin/env node
// The leak gate over a range of commits of a white-label copy, before it is pushed: every commit object (author,
// committer, their dates and zones, any extra header, the message) and every file each commit adds or changes (its path
// and its bytes, through the build's scan). A message must pass the history's message rules (history-message.mjs: no
// forbidden term, no talk about how the copy or the work was made, not the rename map's target stem); author and
// committer must be the profile's publish identity; no commit may carry a path of the profile's history.forbidPaths.
//   node tools/whitelabel/history-gate.mjs <profile id> <repo> <range> [--profiles=<dir>] [--name=..] [--email=..] [--forbid=..]
// range: "a..b", or one commit for its whole history. Exit 1 with the problems listed.
// Node only. Tests: tests/node/whitelabel-history.test.mjs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { profilesDir } from './profile.mjs';
import { findTerms } from './scan.mjs';
import { setup, scanFiles } from './history.mjs';
import { git, readBlobs } from './history-git.mjs';
import { TALK } from './history-message.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The files a commit adds or changes: [{ path, sha }] (the root commit: all of them). */
function newFiles(repo, c) {
  const raw = git(repo, ['diff-tree', '-r', '-z', '--root', '--no-renames', '--no-commit-id', c]).split('\0');
  const out = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const m = /^:\d+ (\d+) [0-9a-f]+ ([0-9a-f]+) (\w)/.exec(raw[i]);
    if (m && m[3] !== 'D' && m[1] !== '160000') out.push({ path: raw[i + 1], sha: m[2] });
  }
  return out;
}

/** Problems in the commits of range, as readable lines (empty when the range is clean). */
export function gate(T, repo, range, who, scratch) {
  const problems = [];
  const list = git(repo, ['rev-list', '--reverse', range]).split('\n').filter(Boolean);
  const seen = new Set();
  for (const c of list) {
    const obj = git(repo, ['cat-file', 'commit', c]);
    const [head, ...msg] = obj.split('\n\n'), message = msg.join('\n\n');
    for (const line of head.split('\n')) {
      const [key] = line.split(' ');
      if (!['tree', 'parent', 'author', 'committer'].includes(key)) problems.push(`${c.slice(0, 10)}: extra header '${key}'`);
      if ((key === 'author' || key === 'committer') && !line.startsWith(`${key} ${who.name} <${who.email}> `)) problems.push(`${c.slice(0, 10)}: ${key} is not ${who.name} <${who.email}>`);
    }
    if (findTerms(obj, T.terms, { account: T.account }).length) problems.push(`${c.slice(0, 10)}: a forbidden word in the commit: ${message.split('\n')[0]}`);
    if (TALK.test(message)) problems.push(`${c.slice(0, 10)}: the message talks about how the copy is made: ${message.split('\n')[0]}`);
    else if (!T.ok(message)) problems.push(`${c.slice(0, 10)}: the message breaks the message rules (process talk, the rename stem, a forbidden word): ${message.split('\n')[0]}`);
    const all = newFiles(repo, c);
    for (const f of all.filter((x) => T.gone.some((re) => re.test(x.path)))) problems.push(`${c.slice(0, 10)}: ${f.path} is a path no commit may carry (history.forbidPaths)`);
    const files = all.filter((f) => !seen.has(f.sha + f.path));
    files.forEach((f) => seen.add(f.sha + f.path));
    const blobs = readBlobs(repo, files.map((f) => f.sha));
    for (const f of files) {                                   // history.forbidWords: never in a file line
      const b = blobs.get(f.sha);
      if (T.drop.length && !b.subarray(0, 8192).includes(0)) { const t = b.toString('utf8'); const re = T.drop.find((x) => x.test(t)); if (re) problems.push(`${c.slice(0, 10)}: ${f.path} holds /${re.source}/ (history.forbidWords)`); }
    }
    const res = scanFiles(T, files.map((f) => ({ path: f.path, data: blobs.get(f.sha) })), scratch);
    for (const h of res.found.slice(0, 20)) problems.push(`${c.slice(0, 10)}: ${h.file}${h.line > 0 ? ':' + h.line : ''} [${h.term}] ${h.text}`);
  }
  return { commits: list.length, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--'));
  const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  if (pos.length !== 3) { console.error('usage: history-gate.mjs <profile id> <repo> <range> [--profiles=<dir>] [--name=..] [--email=..] [--forbid=..]'); process.exit(2); }
  try {
    const dir = opt('profiles') ? path.resolve(opt('profiles')) : profilesDir(ROOT);
    const T = setup(ROOT, dir, pos[0], { forbid: (opt('forbid') || '').split(',').filter(Boolean) });
    const repo = path.resolve(pos[1]);
    const r = gate(T, repo, pos[2], { name: opt('name') || T.p.publish.author, email: opt('email') || T.p.publish.email }, path.join(repo, '.git', 'gate-scan'));
    console.log(`history gate: ${r.commits} commit(s), ${r.problems.length} problem(s)`);
    for (const p of r.problems.slice(0, 200)) console.log('  ' + p);
    process.exit(r.problems.length ? 1 : 0);
  } catch (e) { console.error(String(e.stack || e)); process.exit(1); }
}
