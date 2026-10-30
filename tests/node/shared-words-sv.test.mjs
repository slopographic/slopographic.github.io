// Shared components that spoke English in every language now read shared/i18n/ui/<code>/templates.js and print.js:
// the document templates' colour schemes, the workspace layouts, the motion presets and the PDF password messages.
// Covers: shared/templates/choices.js, shared/layouts/presets.js, shared/layouts/layouts.js, shared/motion/presets.js, shared/pdf-crypto/aes256.js,
// shared/i18n/ui/en/templates.js, shared/i18n/ui/sv/templates.js, shared/i18n/ui/en/print.js, shared/i18n/ui/sv/print.js
import { inSwedish } from './ui-words.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SCHEMES } from '../../shared/templates/choices.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** A fresh vm context with Swedish chosen and the given classic scripts (paths from the repo root) run in order. */
async function swedish(files) {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  const run = async (f) => vm.runInContext(await readFile(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  await run('shared/i18n/i18n.js');
  vm.runInContext("window.SlopI18n = window.SlopI18n.create({ defaultLang: 'sv', profile: null });", ctx);
  for (const c of ['en', 'sv']) for (const p of [c + '.js', c + '/templates.js', c + '/print.js']) await run('shared/i18n/ui/' + p);
  for (const f of files) await run(f);
  return ctx;
}

test('a template colour scheme is named in the chosen language, English by default', () => {
  assert.equal(SCHEMES.find((s) => s.id === 'navy').name, 'Navy');
  assert.equal(inSwedish(() => SCHEMES.find((s) => s.id === 'navy').name), 'Marinblå');
});

test('the workspace layouts and the motion presets are named in Swedish', async () => {
  const ctx = await swedish(['shared/layouts/presets.js', 'shared/layouts/core.js', 'shared/layouts/layouts.js', 'shared/motion/easing.js', 'shared/motion/track.js', 'shared/motion/timeline.js', 'shared/motion/presets.js']);
  assert.equal(ctx.SlopLayouts.PRESETS.find((p) => p.id === 'business-document').name, 'Lista och dokument');
  assert.deepEqual([...ctx.SlopLayouts.menu('crm')].map((i) => i.label || i), ['Lista och detaljer', '-', 'Återställ layout']);
  assert.equal(ctx.SlopLayouts.CATEGORIES.find((c) => c.id === 'video').blurb, 'Förhandsvisningen stor, tidslinjen längs nederkanten.');
  assert.deepEqual([...ctx.SlopMotion.presets.list()].map((p) => p.label), ['Tona in', 'Studsa fram', 'Pulsera', 'Skaka', 'Glid upp', 'Snurra in']);
  assert.equal(ctx.SlopMotion.presets.get('pop').label, 'Studsa fram');
});

test('a PDF password message is Swedish', async () => {
  const ctx = await swedish(['shared/pdf-crypto/legacy.js', 'shared/pdf-crypto/aes256.js']);   // no WebCrypto in this context
  assert.throws(() => ctx.SlopPdfCrypto.importAes(new Uint8Array(16)), /Den här webbläsaren saknar WebCrypto/);
});
