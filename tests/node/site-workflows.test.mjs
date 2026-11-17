// This repository's own workflows, which a white-label build does not get (it writes its one rules.yml,
// tools/whitelabel/workflow.mjs). Repo-only (tests/repo-only.json). The checks every workflow needs (read-only token
// permissions, the Playwright image, the plan and its slices) run in every build: tests/node/ci-config.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

test('this repository has its workflows: the rules, the preview, the deploy, the commit authors, page speed, IndexNow, the WebGPU check', () => {
  const files = readdirSync(path.join(ROOT, '.github/workflows'));
  for (const f of ['rules.yml', 'preview.yml', 'pages.yml', 'commit-authors.yml', 'speed.yml', 'indexnow.yml', 'webgpu.yml']) assert.ok(files.includes(f), f);
});

test('the preview copy is the only place that adds noindex to every page', () => {
  const wf = read('.github/workflows/preview.yml');
  assert.match(wf, /branches: \[testing\]/, 'the preview is made from the testing branch only');
  assert.match(wf, /noindex, nofollow/);
  assert.match(wf, /rm -rf CNAME/, 'the preview never takes the live domain');
  // the language pages are written before the noindex pass, so it covers them too
  assert.ok(wf.indexOf('node tools/seo/write.mjs --langs') > 0 && wf.indexOf('node tools/seo/write.mjs --langs') < wf.indexOf('noindex, nofollow">'));
  // Regression: the copy is committed with git add -A, and the repository's .gitignore ignores the language folders,
  // so the copy must drop it first or the preview publishes no language page (every /sv/, /de/ … was a 404).
  assert.match(wf, /rm -rf [^\n]*\.gitignore/, 'the preview copy drops .gitignore before it is committed');
  assert.ok(wf.indexOf('.gitignore') < wf.indexOf('git add -A'));
});

// Covers: .github/workflows/pages.yml, .github/workflows/indexnow.yml
test('the production deploy: main as it is plus the language pages, deployed only once Pages deploys from Actions', () => {
  const wf = read('.github/workflows/pages.yml');
  assert.match(wf, /push:\n    branches: \[main\]/);
  assert.match(wf, /git archive HEAD \| tar -x -C \.\.\/site\n\s+cd \.\.\/site\n\s+node tools\/seo\/write\.mjs --langs/, 'the tracked files, then the language pages');
  assert.match(wf, /^permissions:\n  contents: read$/m, 'the workflow token reads only');
  assert.match(wf, /pages: write\n      id-token: write/, 'the deploy job has only what deploy-pages needs');
  assert.match(wf, /include-hidden-files: true/, 'CNAME, .nojekyll and the other dot files, as the branch deploy serves them');
  assert.match(wf, /build_type/);
  assert.match(wf, /if: \$\{\{ needs\.build\.outputs\.deploy == 'yes' \}\}/, 'no deploy while Pages deploys from the branch');
  for (const m of wf.matchAll(/uses: ([^\s]+)/g)) assert.match(m[1], /^actions\/[\w-]+@v\d+$/, `${m[1]}: a pinned major version`);
  assert.match(wf, /cancel-in-progress: false/, 'a deploy is never cut off');
  // IndexNow pings after whichever deploy published: the push (branch deploy) or this workflow's run (Actions)
  const ping = read('.github/workflows/indexnow.yml');
  assert.match(ping, /workflow_run:\n    workflows: \[Pages\]\n    types: \[completed\]/);
  assert.match(wf, /^name: Pages$/m);
  // a fork's copy is not indexed: every page says noindex, no sitemap; and a fork never pings IndexNow
  const fork = wf.slice(wf.indexOf("if: ${{ github.repository != 'slopographic/apps' }}"));
  assert.ok(wf.includes("if: ${{ github.repository != 'slopographic/apps' }}") && fork.indexOf('upload-pages-artifact') > 0);
  assert.match(fork, /<head><meta name="robots" content="noindex">/);
  assert.match(fork, /rm -f sitemap\*\.xml/);
  assert.match(fork, /printf 'User-agent: \*\\nAllow: \/\\n' > robots\.txt/);
  assert.match(ping, /if: \$\{\{ github\.repository == 'slopographic\/apps' && /);
});
