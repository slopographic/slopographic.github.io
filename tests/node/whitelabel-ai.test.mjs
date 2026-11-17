// Covers: tools/whitelabel/ai.mjs, tools/whitelabel/profile.mjs, tools/whitelabel/emit.mjs
// A profile's "ai" field (which AI models a site offers): validation names each bad value, the build writes it into the
// makers.js marker, and the written file hides what the profile says (end to end, in a vm). No field: nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { aiProblems, aiModels, makers, providerIds, AI_KEYS } from '../../tools/whitelabel/ai.mjs';
import { validate, loadProfile, profilesDir, allProfiles } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers } from '../../tools/whitelabel/emit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(path.join(ROOT, 'shared', 'ai', 'makers.js'), 'utf8');
const run = (src) => { const win = {}; vm.runInNewContext(src, { window: win }); return win.SlopAIKit.makers; };

test('the profiles here are valid and hide nothing; the sample shows the field, empty', () => {
  for (const p of allProfiles(profilesDir(ROOT))) { assert.deepEqual(aiProblems(p.ai), [], p.id); assert.deepEqual(aiModels(p), {}, p.id); }
  assert.deepEqual(loadProfile(profilesDir(ROOT), 'sample').ai, {});
  assert.equal(applyMarkers(SRC, markerValues(loadProfile(profilesDir(ROOT), 'slopographic'))), SRC, 'this site: makers.js as it is');
});

test('validation names each bad value', () => {
  assert.deepEqual(aiProblems(undefined), []);
  assert.deepEqual(aiProblems({ hideOrigins: ['CN'], hideMakers: ['deepseek'], hideModels: ['*-preview'], hideProviders: ['qwen'] }), []);
  assert.match(aiProblems(['CN'])[0], /^ai: an object/);
  const errs = aiProblems({ hideOrigins: ['cn', 'China'], hideMakers: ['nope'], onlyMakers: 'openai', hideModels: ['a b'], hideProviders: ['zz'], hide: [] }).join('\n');
  for (const k of ['ai.hide:', 'ai.hideOrigins: "cn"', 'ai.hideOrigins: "China"', 'ai.hideMakers: "nope"', 'ai.onlyMakers: a list', 'ai.hideModels: "a b"', 'ai.hideProviders: "zz"']) assert.ok(errs.includes(k), k + '\n' + errs);
  assert.match(aiProblems({ onlyMakers: ['openai'], hideMakers: ['openai'] }).join(), /both/);
  // the profile's validate() reports them
  const p = Object.assign({}, loadProfile(profilesDir(ROOT), 'sample'), { ai: { hideMakers: ['nope'] } });
  assert.match(validate(p).join('\n'), /^ai\.hideMakers:/m);
  // the ids it checks against are the code's
  assert.ok(makers().some((m) => m.id === 'qwen' && m.origin === 'CN' && m.providers.includes('qwen')));
  assert.ok(providerIds().includes('openrouter') && providerIds().includes('deepseek'));
  assert.deepEqual(AI_KEYS.slice().sort(), ['hideMakers', 'hideModels', 'hideOrigins', 'hideProviders', 'onlyMakers']);
});

test('the build writes the rules into makers.js, and the written file hides what the profile says', () => {
  const p = { ai: { hideOrigins: ['CN'], hideMakers: [], hideModels: ['*-preview'] } };
  assert.deepEqual(aiModels(p), { hideOrigins: ['CN'], hideModels: ['*-preview'] }, 'only the lists it sets');
  const out = applyMarkers(SRC, { aiModels: aiModels(p) });
  assert.match(out, /\/\*profile:aiModels\*\/\{"hideOrigins":\["CN"\],"hideModels":\["\*-preview"\]\}/);
  assert.equal(out.split('\n').length, SRC.split('\n').length);
  const M = run(out);
  assert.equal(M.active(), true);
  assert.deepEqual([M.allowed('qwen/qwen3-8b'), M.allowed('deepseek-r1'), M.allowed('gemini-3-flash-preview'), M.allowed('claude-opus-5-5')], [false, false, false, true]);
  assert.equal(run(SRC).active(), false, 'the source hides nothing');
});
