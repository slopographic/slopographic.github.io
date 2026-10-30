// A profile's "ocr" field (which text recognition engines a site offers, shared/ocr/engines.js): validation names each bad
// value and an ai field that leaves no engine, and the build writes the field into the engines.js marker. No field: nothing
// changes. The engines on a site with these fields: tests/node/ocr-engines.test.mjs.
// Covers: tools/whitelabel/ai.mjs, tools/whitelabel/emit.mjs, tools/whitelabel/profile.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ocrProblems, ocrRules, OCR_KEYS } from '../../tools/whitelabel/ai.mjs';
import { validate, loadProfile, profilesDir, allProfiles } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers } from '../../tools/whitelabel/emit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const eq = assert.deepEqual;

test('the profile\'s ocr field: validation, the marker the build writes, and every profile here valid', () => {
  for (const p of allProfiles(profilesDir(ROOT))) eq(ocrProblems(p), [], p.id);
  eq(OCR_KEYS, ['engines', 'default']);
  eq(ocrProblems({ ocr: { engines: ['tesseract'], default: 'tesseract' } }), []);
  eq(ocrProblems({ ai: { hideOrigins: ['CN'] } }), [], 'Tesseract is left');
  assert.match(ocrProblems({ ocr: [] })[0], /^ocr: an object/);
  const errs = ocrProblems({ ocr: { engines: ['nope'], default: 'x', more: 1 } }).join('\n');
  for (const k of ['ocr.more: unknown', 'ocr.engines: "nope"', 'ocr.default: "x"']) assert.ok(errs.includes(k), k + '\n' + errs);
  assert.match(ocrProblems({ ocr: { engines: ['tesseract'], default: 'paddle' } }).join(), /not one of ocr.engines/);
  assert.match(ocrProblems({ ai: { onlyMakers: ['openai'] } }).join(), /hide every OCR engine/);
  assert.match(ocrProblems({ ai: { hideOrigins: ['CN'] }, ocr: { default: 'paddle' } }).join(), /paddle is hidden by the ai field/);
  const sample = loadProfile(profilesDir(ROOT), 'sample');
  assert.match(validate(Object.assign({}, sample, { ocr: { engines: ['nope'] } })).join('\n'), /^ocr\.engines:/m);
  eq(ocrRules({}), {});
  eq(ocrRules({ ocr: { engines: ['tesseract'], default: 'tesseract' } }), { engines: ['tesseract'], default: 'tesseract' });
  // the build: this site's engines.js as it is; a profile's rules in the marker
  const src = read('shared/ocr/engines.js');
  assert.equal(applyMarkers(src, markerValues(loadProfile(profilesDir(ROOT), 'slopographic'))), src);
  assert.match(applyMarkers(src, markerValues({ ocr: { default: 'tesseract' } })), /\/\*profile:ocrEngines\*\/\{"default":"tesseract"\}/);
});
