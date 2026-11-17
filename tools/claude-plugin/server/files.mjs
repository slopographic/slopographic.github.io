// Local files for the bridge: paths are checked against the working folder, files read whole (the bridge chunks them)
// and written without overwriting unless asked. No dependencies.
//   workRoot(env)                       → the folder relative paths resolve in: SLOPOGRAPHIC_ROOT (the plugin passes
//                                         ${CLAUDE_PROJECT_DIR}) when it is a real path, else the process's cwd
//   resolvePath(p, { root, outside })   → an absolute path; refuses one outside root unless outside is true (the person
//                                         named it explicitly); symlinks are followed for the check
//   readLocal(abs) → { name, type, bytes }      writeLocal(abs, bytes, { overwrite, name }) → the path written
//   typeOf(name) → a MIME type from the extension
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const MAX_READ = 512 * 1024 * 1024;
const TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
  bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif', psd: 'image/vnd.adobe.photoshop', ico: 'image/x-icon',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json',
  html: 'text/html', htm: 'text/html', xml: 'application/xml', js: 'text/javascript', css: 'text/css',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
  zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', eml: 'message/rfc822',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', stl: 'model/stl', obj: 'model/obj', ttf: 'font/ttf', otf: 'font/otf', woff2: 'font/woff2',
};
export const typeOf = (name) => TYPES[String(name).toLowerCase().split('.').pop()] || 'application/octet-stream';

export function workRoot(env = process.env) {
  const r = env.SLOPOGRAPHIC_ROOT;
  return r && !r.includes('${') && path.isAbsolute(r) ? path.resolve(r) : process.cwd();
}

const inside = (root, p) => { const rel = path.relative(root, p); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
async function real(p) {
  // the deepest existing parent, made real, plus the rest (a file that does not exist yet)
  let cur = p, rest = [];
  for (;;) {
    try { return path.join(await fs.realpath(cur), ...rest); } catch (e) {
      const up = path.dirname(cur);
      if (up === cur) return p;
      rest.unshift(path.basename(cur)); cur = up;
    }
  }
}

export async function resolvePath(p, { root = workRoot(), outside = false } = {}) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('Give a file path.');
  if (p.includes('\0')) throw new Error('That path is not valid.');
  const expanded = p.startsWith('~/') && process.env.HOME ? path.join(process.env.HOME, p.slice(2)) : p;
  const abs = path.resolve(root, expanded);
  if (!outside && !(inside(root, abs) && inside(await real(root), await real(abs)))) {
    throw new Error(`${abs} is outside the working folder (${root}). Only use a path outside it when the person named it; then pass allow_outside: true.`);
  }
  return abs;
}

export async function readLocal(abs) {
  const st = await fs.stat(abs).catch(() => null);
  if (!st) throw new Error(`There is no file at ${abs}.`);
  if (!st.isFile()) throw new Error(`${abs} is not a file.`);
  if (st.size > MAX_READ) throw new Error(`${path.basename(abs)} is ${Math.round(st.size / 1048576)} MB; the limit is ${MAX_READ / 1048576} MB.`);
  const name = path.basename(abs);
  return { name, type: typeOf(name), bytes: await fs.readFile(abs) };
}

export async function writeLocal(abs, bytes, { overwrite = false, name = 'result' } = {}) {
  let target = abs;
  const st = await fs.stat(target).catch(() => null);
  if (st && st.isDirectory()) target = path.join(target, path.basename(String(name)).replace(/[\\/:*?"<>|\0]+/g, '-') || 'result');
  else if (/[\\/]$/.test(abs)) { await fs.mkdir(abs, { recursive: true }); target = path.join(abs, path.basename(String(name)) || 'result'); }
  await fs.mkdir(path.dirname(target), { recursive: true });
  try { await fs.writeFile(target, bytes, { flag: overwrite ? 'w' : 'wx' }); } catch (e) {
    if (e.code === 'EEXIST') throw new Error(`${target} already exists. Pass overwrite: true to replace it, or choose another path.`);
    throw e;
  }
  return target;
}
