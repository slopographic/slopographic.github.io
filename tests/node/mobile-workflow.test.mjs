// The store apps' workflow (.github/workflows/mobile.yml): run by hand only (never on a push, so the normal CI never
// builds the apps), nothing released unless asked, a read-only token except the release job, signing only from secrets,
// and the build outputs as artifacts (never committed: mobile/.gitignore). Repo-only (tests/repo-only.json): a white-label
// build does not get this repository's workflows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const wf = read('.github/workflows/mobile.yml');
const job = (name) => (wf.split(/\n(?= {2}[\w-]+:\n)/).find((b) => b.startsWith(`  ${name}:\n`)) || '');

test('run by hand only, with the platform and an off-by-default release', () => {
  const on = wf.match(/^on:\n((?: {2,}.*\n)+)/m)[1];
  assert.match(on, /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(on, /^ {2}(push|pull_request|schedule|workflow_run):/m);
  assert.match(on, /platform:[\s\S]*?options: \[both, android, ios\][\s\S]*?default: both/);
  assert.match(on, /release:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.doesNotMatch(read('.github/workflows/rules.yml'), /mobile\/(android|ios)|gradlew|xcodebuild/, 'the normal CI never builds the apps');
});

test('a read-only token; only the release job may write, and only when release is ticked', () => {
  assert.match(wf, /^permissions:\n {2}contents: read\n/m);
  const writers = wf.split(/\n(?= {2}[\w-]+:\n)/).filter((b) => /contents: write/.test(b)).map((b) => b.trim().split(':')[0]);
  assert.deepEqual(writers, ['release']);
  assert.match(job('release'), /if: \$\{\{ always\(\) && inputs\.release && /);
  assert.match(job('release'), /--draft/);
});

test('each platform builds when chosen; Android on Linux, iOS on macOS', () => {
  assert.match(job('android'), /if: inputs\.platform != 'ios'/);
  assert.match(job('ios'), /if: inputs\.platform != 'android'/);
  assert.match(job('android'), /runs-on: ubuntu-/);
  assert.match(job('ios'), /runs-on: macos-/);
  assert.match(job('android'), /node mobile\/android\/assetlinks\.mjs --check/);
  assert.match(job('android'), /node generate\.mjs/);
  assert.match(job('ios'), /node mobile\/ios\/bundle\.mjs/);
  assert.match(job('ios'), /node capacitor\.mjs patch/);
  assert.match(job('ios'), /CODE_SIGNING_ALLOWED=NO/, 'the simulator build needs no signing');
  for (const n of ['android', 'ios']) assert.match(job(n), new RegExp(`uses: actions/upload-artifact@v\\d+\\n\\s+with:\\n\\s+name: ${n}\\n\\s+path: dist/`));
});

test('signing comes only from secrets, is skipped without them, and never prints or keeps a key', () => {
  for (const s of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD', 'APPLE_TEAM_ID', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64']) {
    assert.match(wf, new RegExp(`\\$\\{\\{ secrets\\.${s} \\}\\}`), s);
  }
  assert.match(job('android'), /if \[ -z "\$KEYSTORE" \]; then[\s\S]*?exit 0/);
  assert.match(job('ios'), /if \[ -z "\$KEY_P8" \] \|\| \[ -z "\$TEAM" \]; then[\s\S]*?exit 0/);
  assert.match(job('android'), /rm -f "\$RUNNER_TEMP\/upload\.jks"/);
  assert.match(job('ios'), /rm -f "\$key"/);
  assert.doesNotMatch(wf, /echo "\$(KEYSTORE|KEY_P8|STORE_PASS|KEY_PASS)"\s*$/m, 'a secret is only ever piped into base64 -d');
  const ignore = read('mobile/.gitignore');
  for (const p of ['android/build/', 'ios/www/', 'ios/ios/', '*.jks', '*.keystore', '*.p8', 'node_modules/']) assert.ok(ignore.includes(p), p);
});
