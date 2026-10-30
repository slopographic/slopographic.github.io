// Loads the pure Slop 3D core (3d/js/core/*.js, no DOM, no three.js) into a vm context, in order.
// Helper for the 3d-*.test.mjs files. Not a test file itself.
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CORE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '3d', 'js', 'core');
export const FILES = ['xform.js', 'snap.js', 'geometry.js', 'blob.js', 'model.js', 'ops.js', 'history.js', 'format.js',
  'mesh.js', 'meshrender.js', 'meshsel.js', 'meshops.js', 'meshxf.js', 'config.js'];

/** Returns window.Slop3D from a fresh context with every core file loaded in order. */
export async function load() {
  const ctx = { TextDecoder, atob: globalThis.atob, btoa: globalThis.btoa };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(await readFile(path.join(CORE, f), 'utf8'), ctx, { filename: f });
  return ctx.Slop3D;
}

/** A plain copy of a value, so objects made in the vm context compare equal to host objects. */
export const plain = (v) => JSON.parse(JSON.stringify(v));
