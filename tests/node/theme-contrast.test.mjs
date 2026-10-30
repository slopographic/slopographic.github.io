// SlopTheme: the --sl-border token of every theme reaches WCAG 3:1 against its surface (non-text UI boundaries that
// identify an input, a button or a panel edge). Covers: shared/color/contrast.js. Run: node --test tests/node/theme-contrast.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadInto, plain } from './fx-env.mjs';

// the WCAG maths is the site's one copy (shared/color/contrast.js)
const require = createRequire(import.meta.url);
const ratio = require('../../shared/color/contrast.js').ratioHex;

test('every theme border reaches 3:1 against its surface (WCAG 1.4.11)', async () => {
  const ctx = await loadInto(['profile/profile.js', 'theme/theme.js'], {
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  });
  for (const t of plain(ctx.SlopTheme.THEMES)) {
    const r = ratio(t.tokens.border, t.tokens.surface);
    assert.ok(r >= 3, `${t.id}: border ${t.tokens.border} on surface ${t.tokens.surface} is ${r.toFixed(2)}:1, need 3:1`);
  }
});

test('the contrast helper matches known values (black on white is 21:1)', () => {
  assert.equal(Math.round(ratio('#000000', '#ffffff')), 21);
  assert.equal(ratio('#777777', '#777777'), 1);
});
