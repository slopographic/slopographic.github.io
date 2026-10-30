// Covers: tools/whitelabel/cdnpin.mjs
// A build's raw links to its file host name its own release tag, never a commit or branch of the source's cdn repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pinCdn, pinBuild } from '../../tools/whitelabel/cdnpin.mjs';

const SHA = '0cd1e199373a327108ba91702e597d767fbfc3f9';

test('commit links become the tag; named refs, the tag, other accounts and page links stay', () => {
  const t = (s) => pinCdn(s, 'acme', 'v2026.10.24');
  assert.equal(t(`https://raw.githubusercontent.com/acme/cdn/${SHA}/engines/x.js`), 'https://raw.githubusercontent.com/acme/cdn/v2026.10.24/engines/x.js');
  assert.equal(t('https://raw.githubusercontent.com/acme/cdn/test/packs/'), 'https://raw.githubusercontent.com/acme/cdn/test/packs/');   // made up on purpose (mocked)
  assert.equal(t('https://raw.githubusercontent.com/acme/cdn/v2026.10.24/a.js'), 'https://raw.githubusercontent.com/acme/cdn/v2026.10.24/a.js');
  assert.equal(t(`https://raw.githubusercontent.com/other/cdn/${SHA}/a.js`), `https://raw.githubusercontent.com/other/cdn/${SHA}/a.js`);
  assert.equal(t('https://cdn.jsdelivr.net/gh/acme/cdn@v2026.10.24/a.js'), 'https://cdn.jsdelivr.net/gh/acme/cdn@v2026.10.24/a.js');
});

test('a build is rewritten in place, text files only', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'pin-'));
  mkdirSync(path.join(out, 'tests'));
  writeFileSync(path.join(out, 'tests/net-urls.txt'), `https://raw.githubusercontent.com/acme/cdn/${SHA}/a.js\n`);
  writeFileSync(path.join(out, 'tests/pic.png'), `raw.githubusercontent.com/acme/cdn/${SHA}/`);
  assert.equal(pinBuild(out, 'acme', 'v1.2.3'), 1);
  assert.match(readFileSync(path.join(out, 'tests/net-urls.txt'), 'utf8'), /acme\/cdn\/v1\.2\.3\/a\.js/);
  assert.match(readFileSync(path.join(out, 'tests/pic.png'), 'utf8'), new RegExp(SHA));
});
