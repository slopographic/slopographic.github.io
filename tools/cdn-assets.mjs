// Every file the apps fetch from Slopographic's cdn repository, with its expected size: the list that
// tests/node/cdn-assets.test.mjs checks offline and tools/check-cdn.mjs checks against the real hosts.
// Read from the places that name them: the speech and OCR model lists (aitools/), the Get more packs
// (shared/library/packs.json), the HEIC and camera RAW engines, the 3D decoders and the video engine.
//   allAssets() -> Promise<[{ path, size, from }]>   path: the file's path in the cdn repository (one entry per path)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const at = (p) => path.join(ROOT, p);
export const C = require(at('shared/cdn/assets.js'));

export async function allAssets() {
  const out = new Map();
  const add = (p, size, from) => {
    if (!p) throw new Error(`${from}: not a cdn asset`);
    const had = out.get(p);
    if (had && had.size !== size) throw new Error(`${p}: ${had.from} says ${had.size} bytes, ${from} says ${size}`);
    if (!had) out.set(p, { path: p, size, from });
  };
  const fromUrl = (u, size, from) => add(C.pathOf(u), size, from);

  // the model index families (their non-cdn files are Hugging Face models or bundled with the site)
  for (const file of ['aitools/speech-models.js', 'aitools/ocr-models.js']) {
    for (const m of require(at(file)).MODELS) for (const f of m.files) {
      if (f.parts) for (const p of f.parts) fromUrl(p.url, p.size, `${file} ${m.id}`);
      else if (f.url && C.isCdnUrl(f.url)) fromUrl(f.url, f.size, `${file} ${m.id}`);
    }
  }
  // the Get more packs, through the same validation the installer uses
  const M = require(at('shared/library/manifest.js'));
  const v = M.validate(JSON.parse(readFileSync(at('shared/library/packs.json'), 'utf8')));
  if (v.errors.length) throw new Error('packs.json: ' + v.errors.join('; '));
  for (const p of v.packs) for (const f of p.files) if (f.cdn) add(f.cdn, f.size, `packs.json ${p.id}`);
  // the engines the installer downloads (classic scripts: they set globalThis.SlopHeicEngine and SlopRawEngine)
  for (const [file, name] of [['shared/heic/engine.js', 'SlopHeicEngine'], ['shared/raw/engine.js', 'SlopRawEngine']]) {
    require(at(file));
    for (const f of globalThis[name].PACK.files) add(f.cdn, f.size, file);
  }
  // the ES module engines
  const D = await import(pathToFileURL(at('shared/3d-io/decoders.js')).href);
  for (const e of Object.values(D.ENGINES)) for (const [n, [, size]] of Object.entries(e.files)) add(D.CDN_DIR + e.dir + n, size, 'shared/3d-io/decoders.js');
  const F = await import(pathToFileURL(at('convert/js/core/ffmpeg-engine.js')).href);
  for (const [n, f] of Object.entries(F.CORE_FILES)) add(F.CORE_DIR + n, f.size, 'convert/js/core/ffmpeg-engine.js');
  return [...out.values()];
}
