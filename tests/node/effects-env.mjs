// Loads the real Slop Effects model, the shared motion engine, the shared video seed and the shared config
// validator into one vm context (no DOM). Helper for the effects-*.test.mjs files. Not a test file itself.
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MODEL = ['effects/js/model/defs.js', 'effects/js/model/core.js', 'effects/js/model/values.js', 'effects/js/model/layers.js',
  'effects/js/model/keys.js', 'effects/js/model/motion.js', 'effects/js/model/history.js', 'effects/js/model/project.js'];
export const MOTION = ['shared/motion/easing.js', 'shared/motion/track.js', 'shared/motion/timeline.js', 'shared/motion/presets.js'];
export const CONFIG = ['shared/config/schema.js', 'shared/config/validate.js'];

/** Runs the files (relative to the repo root) in one context and returns it. extra is copied onto the global first. */
export async function loadEffects({ files = [...MOTION, 'shared/video/seed.js', ...CONFIG, ...MODEL], extra = {} } = {}) {
  const ctx = { SLOP_APPS: [{ id: 'effects' }, { id: 'tables' }], ...extra };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(await readFile(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}

/** Plain copy of a value, so objects made inside the vm context compare equal to host objects. */
export const plain = (v) => JSON.parse(JSON.stringify(v));
