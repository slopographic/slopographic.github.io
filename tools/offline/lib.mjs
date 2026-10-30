// Node side of the offline builder: the shared builder and manifest (shared/offline/), the sources read from the
// repo, and the embed-mode boot read out of the app's own build file (run in a stub window, no browser needed).
// Used by tools/offline/build-all.mjs and the tests in tests/node/offline-*.test.mjs.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
export const SlopOffline = require(path.join(ROOT, 'shared', 'offline', 'build.js'));
export const OFFLINE_APPS = require(path.join(ROOT, 'shared', 'offline', 'manifest.js'));

/** A site-root path: text, or bytes when binary (null if a binary file is missing). */
export async function readSource(rel, binary) {
  const file = path.join(ROOT, rel);
  if (binary) return readFile(file).then((b) => new Uint8Array(b), () => null);
  return readFile(file, 'utf8').catch(() => { throw new Error(`Could not read ${rel}`); });
}

/** The embed-mode boot function of an app, taken from its build file. */
export async function bootOf(M) {
  if (!M.boot) return undefined;
  const win = {};
  vm.runInNewContext(await readFile(path.join(ROOT, M.boot.file), 'utf8'), { window: win, document: { currentScript: null } }, { filename: M.boot.file });
  return M.boot.name.split('.').reduce((o, k) => o[k], win);
}

/** The single-file offline HTML of one app, from its manifest entry. Throws for an app with no shared build. */
export async function buildApp(id) {
  const M = OFFLINE_APPS[id];
  if (!M || M.offline === false) throw new Error(`${id}: no shared offline build`);
  return SlopOffline.make(M, readSource, { boot: await bootOf(M) });
}
