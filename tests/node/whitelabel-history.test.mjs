// Covers: tools/whitelabel/history.mjs, tools/whitelabel/history-git.mjs, tools/whitelabel/history-message.mjs, tools/whitelabel/history-gate.mjs, tools/whitelabel/cdnpin.mjs
// The mapped history of a white-label copy, on a tiny source repository and the made-up sample profile: one commit per
// source commit, a commit that only touches left-out files dropped, a commit whose files leak folded into the next one,
// messages mapped (trailers gone, talk about the copy left out), the profile's author at the source's time, an
// incremental second run, and the gate over the range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, setup, scrub } from '../../tools/whitelabel/history.mjs';
import { chain, ENV } from '../../tools/whitelabel/history-git.mjs';
import { gate } from '../../tools/whitelabel/history-gate.mjs';
import { cleanMessage, mapMessage, neutral, combine, areas, areaNames } from '../../tools/whitelabel/history-message.mjs';
import { profilesDir } from '../../tools/whitelabel/profile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = profilesDir(ROOT);
const T = setup(ROOT, DIR, 'sample');
const WHO = { name: 'Acme Example', email: 'tools@acme.example' };

const sh = (cwd, args, env = {}) => execFileSync('git', args, { cwd, encoding: 'utf8', env: Object.assign({}, ENV, env) }).trim();
/** A source repository: commit(files, message, time) with files { path: text | Buffer | null (delete) }. */
function source() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wl-src-'));
  sh(dir, ['init', '-q', '-b', 'main']);
  const commit = (files, message, time) => {
    for (const [f, data] of Object.entries(files)) {
      const p = path.join(dir, f);
      if (data === null) { rmSync(p); continue; }
      mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, data);
    }
    sh(dir, ['add', '-A']);
    const date = `${time} +0200`, id = { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
    sh(dir, ['-c', 'user.name=Source Person', '-c', 'user.email=src@example.invalid', 'commit', '-q', '--allow-empty', '-m', message], id);
    return sh(dir, ['rev-parse', 'HEAD']);
  };
  return { dir, commit };
}
const newRepo = () => { const d = mkdtempSync(path.join(os.tmpdir(), 'wl-out-')); sh(d, ['init', '-q', '-b', 'main']); return d; };
const log = (repo, fmt) => sh(repo, ['log', '--reverse', `--format=${fmt}`, 'main']).split('\n');

test('messages: trailers go, names are mapped, talk about the copy is left out', () => {
  const ok = T.ok;
  assert.equal(cleanMessage('Fix it\n\nCo-Authored-By: A <a@b>\nSigned-off-by: B <b@c>\n'), 'Fix it');
  assert.equal(mapMessage('PhotoSlop: brush packs\n\nCo-Authored-By: A <a@b>', T.ctx, ok), 'Image Editor: brush packs');
  assert.equal(mapMessage('Milestone 9: faster PDF, white-label builds, new icons', T.ctx, ok), 'Milestone 9: faster PDF, new icons');
  assert.equal(mapMessage('Mirror workflow: fixed', T.ctx, ok), '');
  assert.equal(mapMessage("Merge remote-tracking branch 'origin/testing' into wip/x", T.ctx, ok), '');
  assert.doesNotMatch(mapMessage('SlopUI grows a sloppy toolbar', T.ctx, ok), /slop/i);
  assert.equal(mapMessage('PhotoSLOP: rulers; shared SlopUI menus', T.ctx, ok), 'Image Editor: rulers; shared UI menus');
  assert.equal(mapMessage('SlopVector: guides', T.ctx, ok), 'Vector Editor: guides');
  assert.equal(mapMessage('Gallery: sort mode (WIP, not yet tested)', T.ctx, ok), 'Gallery: sort mode');
  assert.equal(mapMessage('PDF Editor: objects (move, resize), handoff notes, layers', T.ctx, ok), 'PDF Editor: objects (move, resize), layers');
  for (const m of ['Checkpoint: work in progress', 'WIP from background agents', 'An infinite slop feed', 'Handoff: notes']) assert.equal(mapMessage(m, T.ctx, ok), '', m);
  assert.equal(mapMessage('Docs: a meme feed and tables', T.ctx, ok, [/meme feed/i]), '');
  const names = areaNames(ROOT);
  assert.deepEqual(areas(['photoslop/a.js', 'photoslop/b.js', 'tests/x.html', 'README.md'], names), ['Image Editor', 'Site', 'Tests']);
  assert.equal(areas(['slopcut/a.js'], names, T.fix)[0].toLowerCase().includes('slop'), false);
  assert.equal(scrub('SLOPPY sloppily, Sloppiness; slurp'), 'CARELESS carelessly, Carelessness; gulp');
  assert.equal(neutral(['A', 'B', 'C', 'D', 'E']), 'A, B and 3 more areas: updates');
  const msg = combine([{ message: 'Old thing', areas: [] }, { message: '', areas: ['Tests'] }], ok);
  assert.equal(msg, 'Tests: updates\n\nAlso in this commit:\n- Old thing\n');
});

test('git runs in the repository it is given, even inside a git hook that exports GIT_DIR', () => {
  // A pre-push hook exports GIT_DIR; once the builder (and this test's own git) followed it into the pushing clone.
  const a = source(), b = source();
  b.commit({ 'x.txt': 'x' }, 'x', '2026-01-01 08:00:00');
  const probe = `import { git } from ${JSON.stringify(path.join(ROOT, 'tools/whitelabel/history-git.mjs'))};
    process.stdout.write(git(process.argv[1], ['rev-parse', '--show-toplevel']).trim());`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', probe, a.dir], { encoding: 'utf8',
    env: Object.assign({}, process.env, { GIT_DIR: path.join(b.dir, '.git'), GIT_WORK_TREE: b.dir }) });
  assert.equal(realpathSync(out), realpathSync(a.dir));
  assert.equal(sh(b.dir, ['rev-list', '--count', 'HEAD']), '1');
});

test('the chain follows a merge that takes a branch as it is', () => {
  const s = source();
  const a = s.commit({ 'a.txt': '1' }, 'one', '2026-01-01T10:00:00');
  sh(s.dir, ['checkout', '-q', '-b', 'side']);
  const b = s.commit({ 'a.txt': '2' }, 'two', '2026-01-01T11:00:00');
  const c = s.commit({ 'b.txt': '3' }, 'three', '2026-01-01T12:00:00');
  sh(s.dir, ['checkout', '-q', 'main']);
  sh(s.dir, ['-c', 'user.name=x', '-c', 'user.email=x@x', 'merge', '-q', '--no-ff', '-m', 'Milestone', 'side']);
  const m = sh(s.dir, ['rev-parse', 'HEAD']);
  assert.deepEqual(chain(s.dir, 'main'), [a, b, c, m]);
  assert.deepEqual(chain(s.dir, 'main', new Set([b])), [c, m]);
  assert.throws(() => chain(s.dir, 'main', new Set(['0'.repeat(40)])), /rewritten/);
});

test('a history: folded start, mapped, dropped, coalesced, collapsed, incremental, and gated', async () => {
  const s = source(), out = newRepo();
  const gen = mkdtempSync(path.join(os.tmpdir(), 'wl-gen-'));
  writeFileSync(path.join(gen, 'LICENSE'), 'MIT License, Acme Example\n');
  writeFileSync(path.join(gen, 'old.js'), 'an old file the build no longer has\n');
  const H = { since: 'main~5', forbidPaths: ['^old\\.js$', '^feed/'], forbidWords: ['meme feed'], forbidMessages: ['\\bpicture\\b'] };
  const c0 = s.commit({ 'feed/a.txt': 'the feed\n', 'old.js': 'x\n' }, 'A meme feed', '2026-01-01T08:00:00');
  const c1 = s.commit({ 'index.html': '<p>Open Slop Drive</p>\n<p>See the meme feed</p>\n', 'shared/a.js': 'window.SlopUI = {};\n', 'notes.txt': 'A Sloppy draft\n' }, 'Start the Slop Drive page', '2026-01-02T08:00:00');
  const c2 = s.commit({ 'tools/whitelabel/x.mjs': 'export {};\n' }, 'Tooling only', '2026-01-02T09:00:00');
  const c3 = s.commit({ 'assets/p.bin': Buffer.from([0, 1, 2, ...Buffer.from('sloppo'), 0]) }, 'A picture', '2026-01-02T10:00:00');
  const c4 = s.commit({ 'assets/p.bin': null, 'photoslop/notes.md': 'PhotoSlop notes\n' }, 'PHOTOSLOP: notes, meme feed link (WIP, not yet tested)\n\nCo-Authored-By: Bot <bot@example.invalid>', '2026-01-02T11:00:00');
  const c5 = s.commit({ 'shared/a.js': 'window.SlopUI = { on: 1 };\n' }, 'Mirror sync for the white-label copy', '2026-01-02T12:00:00');
  const c5b = s.commit({ 'shared/b.js': 'b();\n' }, 'Checkpoint: work in progress', '2026-01-02T13:00:00');
  const r = await run({ id: 'sample', out, source: s.dir, ref: 'main', profiles: DIR, rebuild: true, generated: gen, history: H });
  assert.deepEqual(r.stats, { source: 7, commits: 3, folded: 1, coalesced: 1, dropped: 1, collapsed: 1, pending: 0 });
  assert.equal(new Set(log(out, '%an <%ae>|%cn <%ce>')).size, 1);
  assert.equal(log(out, '%an <%ae>')[0], `${WHO.name} <${WHO.email}>`);
  assert.deepEqual(log(out, '%at'), [c1, c4, c5b].map((c) => sh(s.dir, ['log', '-1', '--format=%at', c])));
  assert.deepEqual(log(out, '%ad').map((d) => d.slice(-5)), ['+0000', '+0000', '+0000']);
  assert.deepEqual(log(out, '%s'), ['Initial version', 'Image Editor: notes', 'Shared components: updates']);
  assert.match(sh(out, ['log', '-1', '--format=%B', 'main~1']), /Also in this commit:\n- Assets: updates/);   // a message-only word
  assert.doesNotMatch(sh(out, ['log', '--format=%B', 'main']), /Co-Authored|Bot|meme|WIP|tested/i);
  assert.deepEqual(sh(out, ['ls-tree', '-r', '--name-only', 'main']).split('\n').sort(), ['LICENSE', 'imageeditor/notes.md', 'index.html', 'notes.txt', 'shared/a.js', 'shared/b.js']);
  assert.equal(sh(out, ['show', 'main:index.html']), '<p>Open Files</p>');           // the line with a forbidden word left out
  assert.equal(sh(out, ['show', 'main:notes.txt']), 'A Careless draft');   // a word the scan refuses, said another way
  assert.equal(sh(out, ['show', 'main:shared/a.js']), 'window.TlbxUI = { on: 1 };');
  assert.equal(sh(out, ['show', 'main~2:LICENSE']), 'MIT License, Acme Example');
  const brand = log(out, '%H');
  assert.equal(r.state.map[c0], brand[0]); assert.equal(r.state.map[c1], brand[0]); assert.equal(r.state.map[c2], brand[0]);
  assert.equal(r.state.map[c3], brand[1]); assert.equal(r.state.map[c4], brand[1]);
  assert.equal(r.state.map[c5], brand[2]); assert.equal(r.state.map[c5b], brand[2]);
  const TH = setup(ROOT, DIR, 'sample', { history: H });
  assert.deepEqual(gate(TH, out, 'main', WHO, path.join(out, '.git', 'g')).problems, []);

  // the next run maps only what is new, on top of the copy's head (here a release commit)
  sh(out, ['-c', `user.name=${WHO.name}`, '-c', `user.email=${WHO.email}`, 'commit', '-q', '--allow-empty', '-m', 'Release 2026-01-03']);
  const head = sh(out, ['rev-parse', 'main']);
  const c6 = s.commit({ 'index.html': '<p>Open Slop Drive now</p>\n' }, 'Slop Drive: a shorter page', '2026-01-04T08:00:00');
  const r2 = await run({ id: 'sample', out, source: s.dir, ref: 'main', profiles: DIR, state: JSON.parse(JSON.stringify(r.state)), history: H });
  assert.deepEqual(r2.stats, { source: 1, commits: 1, folded: 0, coalesced: 0, dropped: 0, collapsed: 0, pending: 0 });
  assert.equal(sh(out, ['rev-parse', 'main~1']), head);
  assert.equal(sh(out, ['log', '-1', '--format=%s', 'main']), 'Files: a shorter page');
  assert.equal(sh(out, ['show', 'main:index.html']), '<p>Open Files now</p>');
  assert.equal(r2.state.map[c6], sh(out, ['rev-parse', 'main']));
  assert.deepEqual(gate(TH, out, `${head}..main`, WHO, path.join(out, '.git', 'g')).problems, []);

  // the gate: a message or a file with a forbidden word, a foreign author
  writeFileSync(path.join(out, 'x.txt'), 'made by sloppo\n'); writeFileSync(path.join(out, 'old.js'), 'a meme feed\n');
  sh(out, ['add', 'x.txt', 'old.js']);
  sh(out, ['-c', 'user.name=Someone', '-c', 'user.email=s@example.invalid', 'commit', '-q', '-m', 'Mirror of slopographic']);
  const bad = gate(TH, out, 'main~1..main', WHO, path.join(out, '.git', 'g')).problems.join('\n');
  assert.match(bad, /author is not/); assert.match(bad, /forbidden word in the commit/); assert.match(bad, /talks about/); assert.match(bad, /x\.txt:1 \[slop\]/);
  assert.match(bad, /old\.js is a path no commit may carry/); assert.match(bad, /old\.js holds \/meme feed\//);
  writeFileSync(path.join(out, 'y.txt'), 'y\n'); sh(out, ['add', 'y.txt']);
  sh(out, ['-c', `user.name=${WHO.name}`, '-c', `user.email=${WHO.email}`, 'commit', '-q', '-m', 'Tlbx feed: background agents, not yet tested']);
  assert.match(gate(TH, out, 'main~1..main', WHO, path.join(out, '.git', 'g')).problems.join('\n'), /message rules/);
  for (const d of [s.dir, out, gen]) rmSync(d, { recursive: true, force: true });
});
