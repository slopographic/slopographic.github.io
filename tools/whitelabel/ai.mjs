// A profile's "ai" field: which AI models the site offers (brand/README.md, "Profiles"). The maker table is the one in
// shared/ai/makers.js (read here in a vm, so the ids a profile may name are the ones the code knows); the build writes the
// field into its /*profile:aiModels*/ marker. Also the "ocr" field (which text recognition engines, shared/ocr/engines.js),
// written into its /*profile:ocrEngines*/ marker. Node only. Tests: tests/node/whitelabel-ai.test.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const AI_KEYS = ['hideOrigins', 'hideMakers', 'onlyMakers', 'hideModels', 'hideProviders'];

/** The maker table as the code has it: [{ id, name, origin, providers }]. */
export function makers(root = ROOT) {
  const win = {};
  vm.runInNewContext(readFileSync(path.join(root, 'shared', 'ai', 'makers.js'), 'utf8'), { window: win });
  return win.SlopAIKit.makers.MAKERS.map(({ id, name, origin, providers }) => ({ id, name, origin, providers }));
}

/** The provider ids of the catalog (shared/ai/cloud/catalog/*.js). */
export function providerIds(root = ROOT) {
  const win = { location: { origin: 'https://example.com' } };
  win.window = win;
  const dir = path.join(root, 'shared', 'ai', 'cloud', 'catalog');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) vm.runInNewContext(readFileSync(path.join(dir, f), 'utf8'), win);
  return win.SlopAIKit.cloud.catalog.map((p) => p.id);
}

/** Every problem with a profile's "ai" field, as readable lines (none when it is missing). */
export function aiProblems(ai, root = ROOT) {
  if (ai === undefined) return [];
  if (!ai || typeof ai !== 'object' || Array.isArray(ai)) return ['ai: an object, like { "hideOrigins": ["CN"] }'];
  const errs = [], ids = makers(root).map((m) => m.id), pids = providerIds(root);
  for (const k of Object.keys(ai)) if (!AI_KEYS.includes(k)) errs.push(`ai.${k}: unknown (${AI_KEYS.join(', ')})`);
  const each = (k, ok, what) => {
    const v = ai[k];
    if (v === undefined) return;
    if (!Array.isArray(v)) { errs.push(`ai.${k}: a list`); return; }
    for (const x of v) if (typeof x !== 'string' || !ok(x)) errs.push(`ai.${k}: ${JSON.stringify(x)} is not ${what}`);
  };
  each('hideOrigins', (x) => /^[A-Z]{2}$/.test(x), 'a country code (ISO 3166, upper case: "CN")');
  each('hideMakers', (x) => ids.includes(x), 'a maker id (shared/ai/makers.js)');
  each('onlyMakers', (x) => ids.includes(x), 'a maker id (shared/ai/makers.js)');
  each('hideModels', (x) => /^[\w.:/@*-]+$/.test(x), 'a model id pattern (letters, digits, . : / @ - and * for any text)');
  each('hideProviders', (x) => pids.includes(x), 'a provider id (shared/ai/cloud/catalog)');
  if (ai.onlyMakers && ai.onlyMakers.length && ai.hideMakers && ai.hideMakers.some((x) => ai.onlyMakers.includes(x))) errs.push('ai: a maker both in onlyMakers and hideMakers');
  return errs;
}

/** The marker's value: the profile's rules, only the lists it sets ({} hides nothing, the source's own). */
export function aiModels(p) {
  const out = {};
  for (const k of AI_KEYS) if (p.ai && Array.isArray(p.ai[k]) && p.ai[k].length) out[k] = p.ai[k].slice();
  return out;
}

/** The OCR engines as the code has them (shared/ocr/engines.js, read in a vm with the maker table): [{ id, name, maker }],
 *  and which of them a profile offers (its ai rules and its ocr field). */
function ocrEngines(root = ROOT, p = null) {
  const win = {};
  vm.runInNewContext(readFileSync(path.join(root, 'shared', 'ai', 'makers.js'), 'utf8'), { window: win });
  vm.runInNewContext(readFileSync(path.join(root, 'shared', 'ocr', 'engines.js'), 'utf8'), { window: win });
  const E = win.SlopOcrEngines;
  if (p) { win.SlopAIKit.makers.configure(aiModels(p)); E.configure(ocrRules(p)); }
  return { all: E.ENGINES.map(({ id, name, maker }) => ({ id, name, maker })), offered: p ? E.offered().map((e) => e.id) : null };
}
export const OCR_KEYS = ['engines', 'default'];

/** Every problem with a profile's "ocr" field (none when it is missing), and an ai field that hides every OCR engine. */
export function ocrProblems(p, root = ROOT) {
  const ocr = p.ocr, errs = [];
  const ids = ocrEngines(root).all.map((e) => e.id);
  if (ocr !== undefined) {
    if (!ocr || typeof ocr !== 'object' || Array.isArray(ocr)) return ['ocr: an object, like { "engines": ["tesseract"], "default": "tesseract" }'];
    for (const k of Object.keys(ocr)) if (!OCR_KEYS.includes(k)) errs.push(`ocr.${k}: unknown (${OCR_KEYS.join(', ')})`);
    if (ocr.engines !== undefined) {
      if (!Array.isArray(ocr.engines)) errs.push('ocr.engines: a list of engine ids');
      else for (const x of ocr.engines) if (!ids.includes(x)) errs.push(`ocr.engines: ${JSON.stringify(x)} is not an OCR engine (${ids.join(', ')})`);
    }
    if (ocr.default !== undefined && !ids.includes(ocr.default)) errs.push(`ocr.default: ${JSON.stringify(ocr.default)} is not an OCR engine (${ids.join(', ')})`);
    else if (ocr.default !== undefined && Array.isArray(ocr.engines) && ocr.engines.length && !ocr.engines.includes(ocr.default)) errs.push('ocr.default: not one of ocr.engines');
  }
  if (errs.length) return errs;
  const { offered } = ocrEngines(root, p);
  if (!offered.length) errs.push('ocr: the ai and ocr fields hide every OCR engine (PaddleOCR is made by Baidu, Tesseract by its open-source project: "tesseract")');
  else if (ocr && ocr.default && !offered.includes(ocr.default)) errs.push(`ocr.default: ${ocr.default} is hidden by the ai field`);
  return errs;
}

/** The ocrEngines marker's value (shared/ocr/engines.js): the profile's ocr field, only what it sets ({}: every engine, Auto). */
export function ocrRules(p) {
  const out = {}, o = p.ocr || {};
  if (Array.isArray(o.engines) && o.engines.length) out.engines = o.engines.slice();
  if (typeof o.default === 'string') out.default = o.default;
  return out;
}
