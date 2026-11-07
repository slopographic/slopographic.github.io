/* Reads a 3D model with the three.js loaders (vendor/three/addons, three.js 0.170.0, MIT) into a three.js Group.
 *   readModel(files, { ask }) → { root, format, name, animations, warnings }
 * files: [{ name, blob }]. The first file that is a model is read; the others are its companions (.mtl, .bin,
 * textures), found by file name. Formats: OBJ (+MTL), STL (ASCII and binary), PLY (ASCII and binary), glTF (embedded
 * or separate buffers and pictures), GLB, 3MF, Collada (DAE) and FBX (binary and ASCII). Compressed glTF (Draco,
 * meshoptimizer, KTX2) loads its decoder from the cdn first (decoders.js). Throws an Error with a readable message. */
import * as T from '../../vendor/three/three.module.min.js';
import { OBJLoader } from '../../vendor/three/addons/loaders/OBJLoader.js';
import { MTLLoader } from '../../vendor/three/addons/loaders/MTLLoader.js';
import { STLLoader } from '../../vendor/three/addons/loaders/STLLoader.js';
import { PLYLoader } from '../../vendor/three/addons/loaders/PLYLoader.js';
import { formatOf, READ, LABEL, stemOf, referencedFiles, plyEncoding } from './formats.js';
import { Resources } from './resources.js';
import * as decoders from './decoders.js';

/** Larger files are refused before any work: the whole model must fit in the browser's memory. */
export const MAX_BYTES = 512 * 1024 * 1024;
/** A word shown to the person (ui.d3.*, shared/i18n/ui/en/misc.js), in the chosen language when it is made. */
const tr = (k, v) => { const I = globalThis.SlopI18n; return I ? I.t(k, v) : k; };
/** An error whose message is already written for the person (the catch in readModel passes it on as it is). */
const fail = (k, v) => Object.assign(new Error(tr('ui.d3.' + k, v)), { shown: true });
const lazy = (p) => () => import(p);
const LOADERS = {
  gltf: lazy('../../vendor/three/addons/loaders/GLTFLoader.js'), draco: lazy('../../vendor/three/addons/loaders/DRACOLoader.js'),
  ktx2: lazy('../../vendor/three/addons/loaders/KTX2Loader.js'), '3mf': lazy('../../vendor/three/addons/loaders/3MFLoader.js'),
  dae: lazy('../../vendor/three/addons/loaders/ColladaLoader.js'), fbx: lazy('../../vendor/three/addons/loaders/FBXLoader.js'),
};
/** The bytes of a file as an ArrayBuffer of this page (a Blob from another frame gives that frame's ArrayBuffer, which the
 *  loaders' instanceof checks would not accept). */
const bytesOf = (blob) => new Response(blob).arrayBuffer();
const material = (geo) => new T.MeshStandardMaterial({ color: 0xc9c3b6, roughness: 0.6, metalness: 0, vertexColors: !!geo.attributes.color, side: T.DoubleSide });

/** The model among the files: the first one whose bytes or name say it is a model format. */
export async function pickModel(files) {
  for (const f of files) {
    const head = new Uint8Array(await f.blob.slice(0, 512).arrayBuffer());
    const fmt = formatOf(f.name, head);
    if (READ.includes(fmt)) return { file: f, format: fmt, head };
  }
  return null;
}

async function readObj(f, res, warnings) {
  const text = await f.blob.text();
  const loader = new OBJLoader(res.manager);
  const libs = referencedFiles('obj', text);
  const mtlName = libs.find((n) => res.has(n)) || [...res.byName.keys()].find((n) => n.endsWith('.mtl'));
  if (mtlName) {
    const mtlText = await res.text(mtlName);
    const mc = new MTLLoader(res.manager).parse(mtlText, '');
    mc.preload();
    loader.setMaterials(mc);
    for (const n of referencedFiles('mtl', mtlText)) if (!res.has(n)) res.missing.add(n);
  } else if (libs.length) warnings.push(tr('ui.d3.no_mtl', { names: libs.join(', ') }));
  const root = loader.parse(text);
  if (!root.children.length) throw fail('obj_empty');
  return { root };
}

async function readGltf(f, format, res, opts) {
  const buf = await bytesOf(f.blob);
  let json;
  if (format === 'glb') {
    const dv = new DataView(buf);
    if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw fail('not_glb');
    if (dv.getUint32(4, true) !== 2) throw fail('gltf1');
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, dv.getUint32(12, true))));
  } else {
    try { json = JSON.parse(new TextDecoder().decode(buf)); } catch (e) { throw fail('gltf_json'); }
  }
  if (!json.asset || String(json.asset.version).split('.')[0] !== '2') throw fail('gltf2_only');
  const lost = (json.buffers || []).filter((b) => b.uri && !/^data:/.test(b.uri) && !res.has(decodeURIComponent(b.uri))).map((b) => b.uri);
  if (lost.length) throw fail('gltf_buffers', { names: lost.join(', '), n: lost.length });
  const { GLTFLoader } = await LOADERS.gltf();
  const loader = new GLTFLoader(res.manager);
  const ids = decoders.needed(json);
  if (ids.length) {
    const urls = await decoders.prepare(ids, opts);
    const L = { DRACOLoader: ids.includes('draco') ? (await LOADERS.draco()).DRACOLoader : null, KTX2Loader: ids.includes('basis') ? (await LOADERS.ktx2()).KTX2Loader : null };
    await decoders.attach(loader, ids, urls, T, L);
  }
  const gltf = await new Promise((resolve, reject) => loader.parse(buf, '', resolve, (e) => reject(fail('gltf_bad', { error: (e && e.message) || String(e) }))));
  return { root: gltf.scene || gltf.scenes[0], animations: gltf.animations || [], cameras: gltf.cameras };
}

async function readOther(f, format, res) {
  if (format === 'stl') {
    const geo = new STLLoader().parse(await bytesOf(f.blob));
    if (!geo.attributes.position || !geo.attributes.position.count) throw fail('stl_empty');
    const g = new T.Group();
    g.add(new T.Mesh(geo, material(geo)));
    return { root: g };
  }
  if (format === 'ply') {
    const buf = await bytesOf(f.blob);
    if (!plyEncoding(new Uint8Array(buf, 0, Math.min(512, buf.byteLength)))) throw fail('ply_header');
    const geo = new PLYLoader().parse(buf);
    if (!geo.attributes.position || !geo.attributes.position.count) throw fail('ply_empty');
    const g = new T.Group();
    g.add(geo.index ? new T.Mesh(geo, material(geo)) : new T.Points(geo, new T.PointsMaterial({ size: 0.01, vertexColors: !!geo.attributes.color })));
    return { root: g };
  }
  if (format === '3mf') {
    const { ThreeMFLoader } = await LOADERS['3mf']();
    const root = new ThreeMFLoader(res.manager).parse(await bytesOf(f.blob));
    return { root };
  }
  if (format === 'dae') {
    const { ColladaLoader } = await LOADERS.dae();
    const r = new ColladaLoader(res.manager).parse(await f.blob.text(), '');
    if (!r || !r.scene) throw fail('dae_bad');
    return { root: r.scene, animations: r.scene.animations || [] };
  }
  const { FBXLoader } = await LOADERS.fbx();
  const root = new FBXLoader(res.manager).parse(await bytesOf(f.blob), '');
  return { root, animations: root.animations || [] };
}

/** Reads the model among files. Returns { root, format, name, animations, warnings }. */
export async function readModel(files, opts = {}) {
  const list = files.map((f) => ({ name: f.name, blob: f.blob || f.file }));
  const pick = await pickModel(list);
  if (!pick) throw fail('no_model', { formats: 'OBJ, STL, PLY, glTF, GLB, 3MF, DAE, FBX' });
  const { file, format } = pick;
  if (file.blob.size > MAX_BYTES) throw fail('too_big', { size: '512 MB' });
  const res = new Resources(T, list);
  const warnings = [];
  let out;
  try {
    if (format === 'obj') out = await readObj(file, res, warnings);
    else if (format === 'gltf' || format === 'glb') out = await readGltf(file, format, res, opts);
    else out = await readOther(file, format, res);
    await res.idle();
  } catch (e) {
    res.dispose();
    const msg = (e && e.message) || String(e);
    throw e && e.shown ? e : fail('unreadable', { format: LABEL[format], error: msg });
  }
  res.dispose();
  if (res.missing.size) {
    const names = [...res.missing].slice(0, 6).join(', ');
    warnings.push(tr('ui.d3.not_found', { names: res.missing.size > 6 ? tr('ui.d3.and_more', { names }) : names }));
  }
  const root = out.root;
  root.updateMatrixWorld(true);
  return { root, format, name: stemOf(file.name), animations: out.animations || [], warnings, file: file.name };
}

export { T as THREE };
