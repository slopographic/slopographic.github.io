// The WebMCP origin trial tokens (shared/agent/trial-tokens.json): each is for its own origin and the WebMCP feature,
// its expiry is written next to it, the SEO writer puts every token in the page heads, and renewal is not forgotten:
// a warning within 30 days of expiry, a failure after it (renew at developer.chrome.com/origintrials, see
// shared/agent/HANDOFF.md).
// Run: node --test tests/node/agent-trial.test.mjs
// Covers: tools/seo/write.mjs, shared/agent/boot.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cfg = JSON.parse(await readFile(path.join(ROOT, 'shared/agent/trial-tokens.json'), 'utf8'));
const DAY = 864e5;

/** The signed payload at the end of a token: { origin, feature, expiry } (version byte, 64-byte signature, length, JSON). */
function payload(token) {
  const bytes = Buffer.from(token, 'base64');
  const len = bytes.readUInt32BE(65);
  return JSON.parse(bytes.subarray(69, 69 + len).toString('utf8'));
}

test('each token is for its origin and the WebMCP feature, and its expiry is written next to it', () => {
  assert.equal(cfg.feature, 'WebMCP');
  assert.ok(Array.isArray(cfg.tokens));
  const origins = new Set();
  for (const t of cfg.tokens) {
    const p = payload(t.token);
    assert.equal(p.feature, 'WebMCP', t.origin);
    assert.equal(p.origin.replace(/:443$/, ''), t.origin, 'the token was made for ' + p.origin);
    assert.equal(new Date(p.expiry * 1000).toISOString().slice(0, 10), t.expires, t.origin + ': the expiry next to it');
    assert.ok(!origins.has(t.origin), 'one token per origin');
    origins.add(t.origin);
  }
});

test('the tokens are renewed in time (a warning 30 days before, a failure after expiry)', (t) => {
  for (const tok of cfg.tokens) {
    const left = (payload(tok.token).expiry * 1000 - Date.now()) / DAY;
    assert.ok(left > 0, `The WebMCP origin trial token for ${tok.origin} expired on ${tok.expires}. Renew it (shared/agent/HANDOFF.md).`);
    if (left < 30) {
      const msg = `The WebMCP origin trial token for ${tok.origin} expires in ${Math.ceil(left)} days (${tok.expires}). Renew it (shared/agent/HANDOFF.md).`;
      t.diagnostic(msg);
      console.warn('WARNING: ' + msg);
    }
  }
});

test('the page heads carry every token, on one line in the SEO block', async () => {
  for (const rel of ['photoslop/index.html', 'pdf/index.html', 'slopcut/index.html', 'workflows/index.html', 'convert/index.html', 'index.html']) {
    const html = await readFile(path.join(ROOT, rel), 'utf8');
    const block = html.slice(html.indexOf('<!-- seo:start'), html.indexOf('<!-- seo:end -->'));
    for (const t of cfg.tokens) assert.ok(block.includes(`<meta http-equiv="origin-trial" content="${t.token}">`), `${rel}: the ${t.origin} token`);
    assert.equal(block.split('\n').filter((l) => l.includes('origin-trial')).length, cfg.tokens.length ? 1 : 0, rel + ': one line (none in a build without tokens)');
  }
});

test('the runtime fallback adds only the token of the page\'s own origin', async () => {
  const src = await readFile(path.join(ROOT, 'shared/agent/boot.js'), 'utf8');
  assert.match(src, /t\.origin !== location\.origin/);
  assert.match(src, /meta\[http-equiv="origin-trial"\]/);
});
