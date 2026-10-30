/* The 3D file formats the shared 3D I/O module reads and writes, and how to tell them apart. Pure: no three.js, no
 * DOM, loads in Node. formatOf(name, head, size) names the format of a file from its first bytes and its name.
 * Companion files (an OBJ's .mtl, a glTF's .bin, textures) are not models: they are found by name while a model reads. */

/** Formats read (models). */
export const READ = ['obj', 'stl', 'ply', 'gltf', 'glb', '3mf', 'dae', 'fbx'];
/** Formats written. */
export const WRITE = ['obj', 'stl', 'ply', 'glb', 'gltf', 'usdz'];
/** Files that come with a model and are read by name while it loads. */
export const COMPANIONS = ['mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tga', 'ktx2'];

export const LABEL = {
  obj: 'Wavefront OBJ', stl: 'STL', ply: 'PLY (Stanford)', gltf: 'glTF', glb: 'GLB (binary glTF)', '3mf': '3MF',
  dae: 'Collada (DAE)', fbx: 'FBX', usdz: 'USDZ', mtl: 'OBJ materials (MTL)',
};
export const MIME = {
  obj: 'model/obj', stl: 'model/stl', ply: 'application/x-ply', gltf: 'model/gltf+json', glb: 'model/gltf-binary',
  '3mf': 'model/3mf', dae: 'model/vnd.collada+xml', fbx: 'application/octet-stream', usdz: 'model/vnd.usdz+zip', mtl: 'model/mtl',
};

/** What each written format keeps. false = dropped when the input has it. */
export const KEEPS = {
  obj: { materials: true, textures: true, colors: false, uvs: true, hierarchy: false, animations: false, points: true, lines: true, skinning: false, morphs: false, lights: false, cameras: false },
  stl: { materials: false, textures: false, colors: false, uvs: false, hierarchy: false, animations: false, points: false, lines: false, skinning: false, morphs: false, lights: false, cameras: false },
  ply: { materials: false, textures: false, colors: true, uvs: true, hierarchy: false, animations: false, points: false, lines: false, skinning: false, morphs: false, lights: false, cameras: false },
  glb: { materials: true, textures: true, colors: true, uvs: true, hierarchy: true, animations: true, points: true, lines: true, skinning: true, morphs: true, lights: true, cameras: true },
  gltf: { materials: true, textures: true, colors: true, uvs: true, hierarchy: true, animations: true, points: true, lines: true, skinning: true, morphs: true, lights: true, cameras: true },
  usdz: { materials: true, textures: true, colors: false, uvs: true, hierarchy: true, animations: false, points: false, lines: false, skinning: false, morphs: false, lights: false, cameras: true },
};

const ascii = (head, from, len) => String.fromCharCode(...head.subarray(from, Math.min(head.length, from + len)));
export const extOf = (name) => (/\.([^./\\]+)$/.exec(String(name || '')) || [, ''])[1].toLowerCase();
export const baseOf = (name) => String(name || '').split(/[\\/]/).pop();
export const stemOf = (name) => baseOf(name).replace(/\.[^.]+$/, '') || 'model';

/** True when STL bytes are binary: the triangle count in the header matches the size, or the text is not "solid ...". */
export function stlIsBinary(bytes) {
  if (bytes.length >= 84) {
    const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
    if (84 + n * 50 === bytes.length) return true;
  }
  const t = ascii(bytes, 0, 512).replace(/^\s+/, '');
  return !(t.startsWith('solid') && /facet|endsolid/.test(ascii(bytes, 0, Math.min(bytes.length, 4096))));
}

/** The PLY encoding from its header: 'ascii', 'binary_little_endian' or 'binary_big_endian', or null. */
export function plyEncoding(head) {
  const m = /format\s+(ascii|binary_little_endian|binary_big_endian)/.exec(ascii(head, 0, 512));
  return m ? m[1] : null;
}

/** The model format of a file, or a companion kind ('mtl', 'bin', a picture), or null. head: first bytes (Uint8Array). */
export function formatOf(name = '', head = null) {
  const ext = extOf(name);
  if (head && head.length >= 4) {
    const a4 = ascii(head, 0, 4);
    if (a4 === 'glTF') return 'glb';
    if (ascii(head, 0, 18) === 'Kaydara FBX Binary') return 'fbx';
    if (a4 === 'ply\n' || a4 === 'ply\r') return 'ply';
    const t = ascii(head, 0, Math.min(head.length, 512));
    if (/<COLLADA[\s>]/.test(t)) return 'dae';
    if (/^\s*;\s*FBX\s/.test(t)) return 'fbx';
    if (head[0] === 0x50 && head[1] === 0x4b && (ext === '3mf' || ext === 'usdz')) return ext;
  }
  if (READ.includes(ext) || ext === 'usdz' || COMPANIONS.includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  if (head && head.length) {
    const t = ascii(head, 0, Math.min(head.length, 512)).trimStart();
    if (/^\{[\s\S]*"asset"/.test(t)) return 'gltf';
    if (/^solid\s/.test(t) && /facet/.test(t)) return 'stl';
    if (/^(#.*\n\s*)*(v|vn|vt|o|g|mtllib)\s/m.test(t) && /\n\s*v\s+-?[\d.]/.test('\n' + t)) return 'obj';
  }
  return null;
}

/** The names of the external files a model text points at (OBJ mtllib, MTL maps, glTF buffers and images). */
export function referencedFiles(format, text) {
  const out = new Set();
  if (format === 'obj') for (const m of text.matchAll(/^\s*mtllib\s+(.+?)\s*$/gm)) out.add(baseOf(m[1]));
  if (format === 'mtl') for (const m of text.matchAll(/^\s*(?:map_\w+|bump|disp|norm|refl)\s+(?:-\S+\s+\S+\s+)*(.+?)\s*$/gim)) out.add(baseOf(m[1]));
  if (format === 'gltf') {
    try {
      const j = JSON.parse(text);
      for (const x of [...(j.buffers || []), ...(j.images || [])]) if (x.uri && !/^data:/.test(x.uri)) out.add(baseOf(decodeURIComponent(x.uri)));
    } catch (e) { /* not JSON: the reader says so */ }
  }
  return [...out];
}
