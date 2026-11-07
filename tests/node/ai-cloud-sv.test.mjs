// The own-key AI providers in Swedish (shared/i18n/ui/sv/ai5-8.js): the catalog's words come from the ui tables by id
// (getters cloud/providers.js adds), so a provider read once follows a language change; the free tiers, the usage line,
// the rate-limit message, the local server diagnosis and the picture price question in Swedish, and back to English.
// Covers: shared/ai/cloud/providers.js, shared/ai/cloud/free.js, shared/ai/cloud/meter.js, shared/ai/cloud/net.js,
//   shared/ai/cloud/local.js, shared/ai/cloud/catalog/main.js, shared/ai/cloud/catalog/local.js,
//   shared/ai/cloud/catalog/cloud.js, shared/ai/imagegen/core.js, shared/ai/imagegen/tools.js
//   shared/i18n/ui/en/ai5.js, shared/i18n/ui/en/ai6.js, shared/i18n/ui/en/ai7.js, shared/i18n/ui/en/ai8.js,
//   shared/i18n/ui/sv/ai5.js, shared/i18n/ui/sv/ai6.js, shared/i18n/ui/sv/ai7.js, shared/i18n/ui/sv/ai8.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { kit } from './ai-cloud-env.mjs';

const w = kit(), C = w.SlopAIKit.cloud;
// a SlopI18n whose language can change (the kit's has no profile to store a choice in), with the English and Swedish parts
let lang = 'en';
const I = (w.SlopI18n = w.SlopI18n.create({ defaultLang: 'en', profile: { get: () => lang, set: (a, b, code) => { lang = code; return { ok: true }; } } }));
for (const code of ['en', 'sv']) {
  const dir = new URL(`../../shared/i18n/ui/${code}/`, import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) vm.runInContext(readFileSync(new URL(f, dir), 'utf8'), w, { filename: f });
}
for (const f of ['shared/ai/cloud/keys.js', 'shared/ai/imagegen/core.js', 'shared/ai/imagegen/run.js', 'shared/ai/imagegen/tools.js'])
  vm.runInContext(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'), w, { filename: f });

test('the catalog, free tiers and meter follow a switch to Swedish and back', () => {
  const gemini = C.byId('gemini'), ollama = C.byId('ollama'), azure = C.byId('azure-classic');
  assert.equal(gemini.free.reset, 'at midnight Pacific time');
  assert.equal(ollama.name, 'Ollama on this computer');
  I.set('sv');
  try {
    assert.equal(I.get(), 'sv');
    assert.equal(gemini.free.reset, 'vid midnatt Stillahavstid');
    assert.equal(ollama.name, 'Ollama på den här datorn'); assert.equal(ollama.short, 'Ollama');
    assert.match(ollama.free.note, /^Gratis: den körs på din egen dator/);
    assert.match(ollama.setup[0], /OLLAMA_ORIGINS till \{site\}/);
    assert.equal(azure.fields[0].label, 'Resursnamn'); assert.equal(azure.models[0].name, 'Din driftsättning'); assert.equal(azure.models[0].note, 'anges av adressen');
    assert.equal(C.byId('openai').models[0].note, 'rekommenderas av OpenAI');
    assert.equal(C.GROUPS[0].name, 'Huvudval');
    assert.deepEqual(['gemini', 'openrouter', 'cerebras'].map((id) => C.free.label(C.byId(id))), ['Gratis', 'Gratismodeller', 'Gratis provperiod']);
    assert.equal(C.meter.line({ input: 40000, output: 2898, cacheRead: 35314, cost: 0.03 }), '42 898 token (35 314 från cache) · ungefär 0,03 $');
    assert.match(C.plain('key', 'Groq'), /^Groq godtog inte nyckeln\./);
    assert.match(C.free.rate(C.byId('groq'), 'x', 40), /På gratisnivån tillåter Groq ungefär 30 förfrågningar.*Försök igen om ungefär 40 sekunder\./);
    assert.match(C.checkBase('http://10.0.0.3:8000/v1'), /blandat innehåll/);
    assert.match(w.SlopAIKit.imageTools.confirmText({ provider: 'ollama', model: '', n: 2, aspect: '1:1', resolution: '1K' }), /^Gör 2 bilder med Ollama .*inget lämnar den här datorn\.$/);
  } finally { I.set('en'); }
  assert.equal(gemini.free.reset, 'at midnight Pacific time');
  assert.equal(C.GROUPS[0].name, 'Main');
  assert.equal(C.free.label(gemini), 'Free');
});
