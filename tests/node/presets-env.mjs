// Loads the classic browser scripts of shared/presets (with shared/config and shared/motion they depend on) into one vm
// context. Helper for presets*.test.mjs. Not a test file itself. Host Blob is passed in, so exportFile works here.
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { useLang } from './ui-tables-env.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = [
  ['shared/config', ['schema.js', 'validate.js', 'io.js']],
  ['shared/motion', ['easing.js', 'track.js', 'timeline.js', 'transitions.js', 'playback.js', 'presets.js']],
  ['shared/presets', ['core.js', 'builtins-effect.js', 'builtins-motion.js', 'io.js', 'motion.js']],
];

/** Returns { SlopPresets, SlopConfig, SlopMotion } from a fresh context with the files loaded in order. */
export async function load() {
  const ctx = { Blob: globalThis.Blob, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  useLang(ctx, 'en', { parts: ['presets', 'config', 'motion', 'templates'] });   // the words a page has (shared/i18n/ui/en/<part>.js)
  for (const [dir, files] of FILES) {
    for (const f of files) vm.runInContext(await readFile(path.join(ROOT, dir, f), 'utf8'), ctx, { filename: `${dir}/${f}` });
  }
  return { SlopPresets: ctx.SlopPresets, SlopConfig: ctx.SlopConfig, SlopMotion: ctx.SlopMotion };
}

/** Plain copy of a value, so objects made inside the vm context compare equal to host objects. */
export const plain = (v) => JSON.parse(JSON.stringify(v));
