// Attribution guard: commits are by Slopographic alone, with no co-author or tool trailers.
// The hooks in .githooks enforce it on each commit; this test checks they are switched on and that the commits since the
// attribution change are by Slopographic. Run with: node --test tests/node/attribution.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
// The commit that set the repo identity to Slopographic; every commit after it must be by Slopographic.
const ATTRIBUTION_COMMIT = '57253f2';
const IDENTITY = { name: 'slopographic', email: '340656300+slopographic@users.noreply.github.com' };

test('the repo identity is Slopographic', () => {
  assert.equal(git('config', 'user.name'), IDENTITY.name);
  assert.equal(git('config', 'user.email'), IDENTITY.email);
});

test('the pre-commit and commit-msg hooks are switched on and executable', () => {
  assert.equal(git('config', 'core.hooksPath'), '.githooks');
  for (const h of ['pre-commit', 'commit-msg']) {
    const f = path.join(ROOT, '.githooks', h);
    assert.ok(existsSync(f), `${h} is missing`);
    assert.ok(statSync(f).mode & 0o111, `${h} is not executable`);
  }
});

test('every commit since the attribution change is by Slopographic and has no co-author or tool trailer', () => {
  const log = git('log', `${ATTRIBUTION_COMMIT}..HEAD`, '--format=%H%x09%an <%ae>%x09%B%x1e');
  const bad = log.split('\x1e').map((r) => r.trim()).filter(Boolean).filter((r) => {
    const [, author, body] = r.split('\t');
    return author !== `${IDENTITY.name} <${IDENTITY.email}>` || /^co-authored-by:(?!\s*none\s*$)|^[\w-]+-session:|generated with \[/im.test(body || '');
  });
  assert.deepEqual(bad.map((r) => r.split('\t')[0].slice(0, 9)), []);
});
