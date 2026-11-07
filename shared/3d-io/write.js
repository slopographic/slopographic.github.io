/* Writes a three.js model with the three.js exporters (vendor/three/addons, three.js 0.170.0, MIT).
 *   writeModel(root, format, opts) → { files: [{ name, blob }], notes: [string] }
 * format: 'obj' (+ an MTL file and PNG textures when the model has materials), 'stl' (binary or ASCII), 'ply' (binary
 * or ASCII), 'glb', 'gltf' (one JSON file with embedded data) or 'usdz'. opts: { name, binary, materials, animations }.
 * OBJ, STL and PLY are written in world space from a baked copy (scene.js), so transforms, poses and mirrored parts
 * come out as they look. Never changes root. */
import * as T from '../../vendor/three/three.module.min.js';
import { OBJExporter } from '../../vendor/three/addons/exporters/OBJExporter.js';
import { STLExporter } from '../../vendor/three/addons/exporters/STLExporter.js';
import { PLYExporter } from '../../vendor/three/addons/exporters/PLYExporter.js';
import { MIME } from './formats.js';
import { bake, standardMaterials } from './scene.js';
/** A word shown to the person (ui.d3.*, shared/i18n/ui/en/misc.js), in the chosen language when it is made. */
const tr = (k, v) => { const I = globalThis.SlopI18n; return I ? I.t(k, v) : k; };
import { writeMtl } from './mtl.js';
import { plainTexture, textureCanvas } from './textures.js';

const safe = (s) => String(s || '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
const blobOf = (data, fmt) => new Blob([data], { type: MIME[fmt] || 'application/octet-stream' });

/** One mesh per material group, each holding only the vertices it uses (OBJ has one material per object). */
function splitByMaterial(group) {
  const out = new T.Group();
  out.name = group.name;
  for (const o of [...group.children]) {   // a copy: adding to out takes o out of group
    if (!o.isMesh || !Array.isArray(o.material) || !o.geometry.groups.length) { out.add(o); continue; }
    const g = o.geometry, ix = g.index ? g.index.array : null;
    o.geometry.groups.forEach((gr, k) => {
      const map = new Map(), idx = [];
      for (let i = gr.start; i < Math.min(gr.start + gr.count, ix ? ix.length : g.attributes.position.count); i++) {
        const v = ix ? ix[i] : i;
        if (!map.has(v)) map.set(v, map.size);
        idx.push(map.get(v));
      }
      const part = new T.BufferGeometry();
      for (const [key, a] of Object.entries(g.attributes)) {
        const arr = new Float32Array(map.size * a.itemSize);
        for (const [v, n] of map) for (let c = 0; c < a.itemSize; c++) arr[n * a.itemSize + c] = a.getComponent(v, c);
        part.setAttribute(key, new T.BufferAttribute(arr, a.itemSize));
      }
      part.setIndex(idx);
      const m = new T.Mesh(part, o.material[gr.materialIndex] || o.material[0]);
      m.name = (o.name || 'Mesh') + (o.geometry.groups.length > 1 ? '_' + (k + 1) : '');
      out.add(m);
    });
  }
  return out;
}

async function writeObj(root, opts, notes) {
  const flat = splitByMaterial(bake(root));
  const files = [];
  const withMtl = opts.materials !== false && flat.children.some((o) => o.isMesh && o.material);
  const names = new Map(), taken = new Set();   // original material → its copy with a unique, plain name
  for (const o of flat.children) {
    const m = o.material;
    if (!m || Array.isArray(m)) continue;
    if (!withMtl) { o.material = { name: '' }; continue; }
    if (!names.has(m)) {
      let n = safe(m.name) || 'material', k = 1;
      while (taken.has(n)) n = `${safe(m.name) || 'material'}_${++k}`;
      taken.add(n);
      const c = m.clone();
      c.name = n;
      names.set(m, c);
    }
    o.material = names.get(m);
  }
  let text = new OBJExporter().parse(flat);
  if (withMtl) {
    const mtlName = `${opts.name}.mtl`;
    const mtl = await writeMtl([...names.values()], opts.name, (tex) => textureCanvas(plainTexture(tex)));
    text = `# Written by Slopographic\nmtllib ${mtlName}\n` + text;
    files.push({ name: mtlName, blob: new Blob([mtl.text], { type: MIME.mtl }) });
    for (const t of mtl.textures) files.push(t);
    if (mtl.skipped) notes.push(tr('ui.d3.tex_skipped', { n: mtl.skipped }));
  }
  files.unshift({ name: `${opts.name}.obj`, blob: blobOf(text, 'obj') });
  return files;
}

function writeStl(root, opts) {
  const flat = bake(root);
  if (!flat.children.some((o) => o.isMesh)) throw new Error(tr('ui.d3.no_stl'));
  const out = new STLExporter().parse(flat, { binary: opts.binary !== false });
  return [{ name: `${opts.name}.stl`, blob: blobOf(opts.binary !== false ? out.buffer : out, 'stl') }];
}

function writePly(root, opts) {
  const flat = bake(root);
  const meshes = flat.children.filter((o) => o.isMesh);
  const keep = new T.Group();
  for (const o of meshes.length ? meshes : flat.children.filter((p) => p.isPoints)) keep.add(o);
  if (!keep.children.length) throw new Error(tr('ui.d3.nothing_to_write'));
  // PLY holds one set of attributes for every vertex: uv and colour only when every part has them
  const drop = ['uv', 'color'].filter((k) => !keep.children.every((o) => o.geometry.attributes[k]));
  if (!keep.children.every((o) => o.geometry.index) && meshes.length) for (const o of keep.children) if (!o.geometry.index) o.geometry.setIndex([...Array(o.geometry.attributes.position.count).keys()]);
  // no callback: the exporter returns the file at once (its callback waits for an animation frame)
  const data = new PLYExporter().parse(keep, null, { binary: opts.binary !== false, littleEndian: true, excludeAttributes: drop });
  if (!data) throw new Error(tr('ui.d3.ply_failed'));
  return [{ name: `${opts.name}.ply`, blob: blobOf(data, 'ply') }];
}

/** The model with exporter-ready materials and textures, as a copy (root is not changed). */
function exportCopy(root, notes) {
  const copy = root.clone(true);
  copy.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material && o.material.clone(); });
  standardMaterials(copy);
  let lost = 0;
  copy.traverse((o) => {
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap']) {
        if (!m[k] || !m[k].isCompressedTexture) continue;
        const p = plainTexture(m[k]);
        if (!p) lost++;
        m[k] = p;
      }
    }
  });
  if (lost) notes.push(tr('ui.d3.tex_lost', { n: lost }));
  return copy;
}

async function writeGltf(root, format, opts, notes) {
  const { GLTFExporter } = await import('../../vendor/three/addons/exporters/GLTFExporter.js');
  const copy = exportCopy(root, notes);
  const animations = opts.animations || [];
  const out = await new GLTFExporter().parseAsync(copy, { binary: format === 'glb', onlyVisible: true, animations, maxTextureSize: 4096 });
  const data = format === 'glb' ? out : JSON.stringify(out);
  return [{ name: `${opts.name}.${format}`, blob: blobOf(data, format) }];
}

async function writeUsdz(root, opts, notes) {
  const { USDZExporter } = await import('../../vendor/three/addons/exporters/USDZExporter.js');
  const copy = exportCopy(root, notes);
  const keep = [];
  copy.traverse((o) => { if (o.isPoints || o.isLine) keep.push(o); });
  for (const o of keep) o.removeFromParent();
  if (!bake(copy).children.length) throw new Error(tr('ui.d3.no_usdz'));
  copy.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.attributes.normal) o.geometry = o.geometry.clone(), o.geometry.computeVertexNormals();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.map && !(m.map.image && (m.map.image.width && typeof m.map.image.getContext === 'function' || m.map.image instanceof (globalThis.ImageBitmap || Object) || m.map.image.naturalWidth))) {
        const c = textureCanvas(m.map);
        m.map = c ? Object.assign(new T.CanvasTexture(c), { flipY: m.map.flipY, colorSpace: m.map.colorSpace }) : null;
      }
    }
  });
  const bytes = await new USDZExporter().parseAsync(copy, { quickLookCompatible: true, includeAnchoringProperties: false });
  return [{ name: `${opts.name}.usdz`, blob: blobOf(bytes, 'usdz') }];
}

/** Writes root as format. Returns { files, notes }. */
export async function writeModel(root, format, opts = {}) {
  const o = { ...opts, name: safe(opts.name) || 'model' };
  const notes = [];
  root.updateMatrixWorld(true);
  let files;
  if (format === 'obj') files = await writeObj(root, o, notes);
  else if (format === 'stl') files = writeStl(root, o);
  else if (format === 'ply') files = writePly(root, o);
  else if (format === 'glb' || format === 'gltf') files = await writeGltf(root, format, o, notes);
  else if (format === 'usdz') files = await writeUsdz(root, o, notes);
  else throw new Error(tr('ui.d3.cannot_write', { format }));
  return { files, notes };
}
