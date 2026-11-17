#!/usr/bin/env node
// Brings a change made in a mirror back here: the mirror's diff between two of its commits, with every path and line
// turned back through the profile's rename map (transform.mjs backLine), applied to the source as it was when the
// mirror's first commit was built. The rule is "edit here, publish there"; this is for the change that was made there.
//   node tools/whitelabel/import.mjs <profile> --mirror=<mirror checkout> --from=<mirror commit> [--to=<mirror commit>]
//        --base=<source commit the --from commit was built from> [--profiles=<dir>] [--into=<dir>] [--branch=<name>]
// Without --into it adds a worktree on a new branch (default wip/import-<profile>-<short to>) next to the repository,
// writes the result there and stages it. It never commits. It prints what it could not turn back for sure: lines whose
// forward step does not give the mirror line again, lines that hold the profile's own words (they must not reach this
// public repository as they are), regenerated files and binary files. Tests: tests/node/whitelabel-import.test.mjs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfile, loadMap, profilesDir } from './profile.mjs';
import { context, forward, backPath, backLine, profileWords } from './transform.mjs';
import { matches, hunks } from './linediff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Files the build writes from the profile: a change to them in a mirror is reported, never imported. */
export const GENERATED = /^(brand\/brand\.json|brand\/mascot\/.*|CNAME|LICENSE|LICENSE-ART|NOTICE\.md|TRADEMARKS\.md|SECURITY\.md|README\.md|brand\/(mark|logo)\.svg|favicon\.(svg|ico)|og-share\.png|assets\/icons\/.*|manifest\.webmanifest|\.github\/.*|\.nojekyll|sitemap\.xml|sw-precache[\w-]*\.js|shared\/agent\/trial-tokens\.json)$/;

/** One modified text file: S (source at base), MA and MB (the mirror before and after). Returns { text, notes }. */
export function backFile(S, MA, MB, ctx, mirrorPath) {
  const s = S.split('\n'), a = MA.split('\n'), b = MB.split('\n');
  const f = forward(S, ctx, mirrorPath).split('\n');
  const toSource = new Map(matches(f, a).map(([fi, ai]) => [ai, fi]));    // mirror line -> source line, where unchanged by the build
  const notes = [], out = s.slice();
  const words = profileWords(ctx);
  for (const h of hunks(a, b).reverse()) {
    const [i0, i1] = h.a;
    let s0, s1;
    if (i1 > i0) {
      const idx = []; for (let i = i0; i < i1; i++) idx.push(toSource.get(i));
      if (idx.some((x) => x === undefined) || idx[idx.length - 1] - idx[0] !== i1 - i0 - 1) { notes.push(`${mirrorPath}:${i0 + 1}: the change touches text the build regenerated; make it here by hand`); continue; }
      [s0, s1] = [idx[0], idx[idx.length - 1] + 1];
    } else {
      const prev = i0 > 0 ? toSource.get(i0 - 1) : -1, next = toSource.get(i0);
      if (prev === undefined && next === undefined) { notes.push(`${mirrorPath}:${i0 + 1}: an insertion inside regenerated text; make it here by hand`); continue; }
      s0 = s1 = prev !== undefined ? prev + 1 : next;
    }
    const old = s.slice(s0, s1);
    const lines = b.slice(h.b[0], h.b[1]).map((ln, k) => {
      const r = backLine(ln, old, ctx, mirrorPath);
      if (!r.sure) notes.push(`${mirrorPath}:${h.b[0] + k + 1}: check this line (its forward step differs from the mirror's)`);
      if (words.some((w) => r.line.includes(w))) notes.push(`${mirrorPath}:${h.b[0] + k + 1}: holds the profile's own words; rewrite it before committing`);
      return r.line;
    });
    out.splice(s0, s1 - s0, ...lines);
  }
  return { text: out.join('\n'), notes };
}

/** A new file in the mirror: every line turned back on its own. */
export function backNewFile(MB, ctx, mirrorPath) {
  const notes = [], words = profileWords(ctx);
  const text = MB.split('\n').map((ln, k) => {
    const r = backLine(ln, [], ctx, mirrorPath);
    if (!r.sure) notes.push(`${mirrorPath}:${k + 1}: check this line`);
    if (words.some((w) => r.line.includes(w))) notes.push(`${mirrorPath}:${k + 1}: holds the profile's own words; rewrite it before committing`);
    return r.line;
  }).join('\n');
  return { text, notes };
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
const show = (cwd, rev, file) => { try { return git(cwd, 'show', `${rev}:${file}`); } catch (e) { return null; } };

export function importChange(id, o) {
  const dir = o.profiles || profilesDir(ROOT);
  const ctx = context(ROOT, loadProfile(dir, id), loadMap(dir, id));
  const to = o.to || 'HEAD';
  const list = git(o.mirror, 'diff', '--no-renames', '--name-status', '-z', o.from, to).split('\0').filter(Boolean);
  const into = o.into, notes = [], done = [];
  for (let i = 0; i < list.length; i += 2) {
    const st = list[i][0], mp = list[i + 1], sp = backPath(mp, ctx);
    if (GENERATED.test(mp)) { notes.push(`${mp}: written by the build from the profile; change it here by hand`); continue; }
    const dest = path.join(into, sp);
    if (st === 'D') { rmSync(dest, { force: true }); done.push(`deleted ${sp}`); continue; }
    const MB = show(o.mirror, to, mp);
    if (MB === null || MB.includes('\0')) { notes.push(`${mp}: binary; copy it here by hand`); continue; }
    const S = st === 'M' ? show(ROOT, o.base, sp) : null;
    const MA = st === 'M' ? show(o.mirror, o.from, mp) : null;
    const r = S === null || MA === null ? backNewFile(MB, ctx, mp) : backFile(S, MA, MB, ctx, mp);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, r.text);
    notes.push(...r.notes);
    done.push(`${st === 'M' ? 'changed' : 'added'} ${sp}`);
  }
  return { done, notes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), id = args.find((a) => !a.startsWith('--'));
  const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  if (!id || !opt('mirror') || !opt('from') || !opt('base')) { console.error('usage: import.mjs <profile> --mirror=<dir> --from=<rev> [--to=<rev>] --base=<source rev> [--profiles=<dir>] [--into=<dir>] [--branch=<name>]'); process.exit(2); }
  const to = opt('to') || 'HEAD';
  let into = opt('into');
  if (!into) {
    const short = git(opt('mirror'), 'rev-parse', '--short', to).trim();
    const branch = opt('branch') || `wip/import-${id}-${short}`;
    into = path.resolve(ROOT, '..', `import-${id}-${short}`);
    if (existsSync(into)) { console.error(`${into} exists; remove it or pass --into`); process.exit(1); }
    git(ROOT, 'worktree', 'add', '-b', branch, into, opt('base'));
    console.log(`worktree ${into} on ${branch}`);
  }
  const r = importChange(id, { mirror: path.resolve(opt('mirror')), from: opt('from'), to, base: opt('base'), into: path.resolve(into), profiles: opt('profiles') && path.resolve(opt('profiles')) });
  try { git(path.resolve(into), 'add', '-A'); } catch (e) { /* --into a plain folder: nothing to stage */ }
  console.log(r.done.map((d) => '  ' + d).join('\n') || '  nothing to import');
  if (r.notes.length) console.log('Review:\n' + r.notes.map((n) => '  ' + n).join('\n'));
  console.log('Staged, not committed. Check the diff (git diff --cached), then commit and push a wip/ branch.');
}
