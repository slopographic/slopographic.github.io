/* One 3D conversion: read a model (read.js), change its size, axis or parts if asked (scene.js), write it in another
 * format (write.js), and say in plain words what the new format could not keep.
 *   convertModel(files, to, opts) → { files: [{ name, blob }], info: string, stats, bounds }
 * opts: { scale (a factor, 1 keeps the size), up ('keep' | 'z-to-y' | 'y-to-z'), merge (one mesh), binary (STL, PLY),
 *         materials (OBJ: write the MTL file), animations (glTF, GLB: keep them), ask (the decoder notice) }
 * dropped(stats, to, opts) lists what is lost, e.g. ['3 materials', '2 animations']. */
import { readModel } from './read.js';
import { writeModel } from './write.js';
import { stats as statsOf, bounds as boundsOf, transform, bake, merge } from './scene.js';
import { KEEPS, LABEL } from './formats.js';

/** A word shown to the person (ui.d3.*, shared/i18n/ui/en/misc.js), in the chosen language when it is made. */
const tr = (k, v) => { const I = globalThis.SlopI18n; return I ? I.t(k, v) : k; };
/** A count with its noun, in the chosen language (ui.d3.n_<what> and its #one form). */
const n = (k, what) => tr('ui.d3.n_' + what, { n: k });

/** What the target format drops from a model with these stats. */
export function dropped(s, to, opts = {}) {
  const keep = KEEPS[to] || {};
  const out = [];
  if (s.materials && !keep.materials) out.push(n(s.materials, 'material'));
  else if (s.materials && to === 'obj' && opts.materials === false) out.push(n(s.materials, 'material'));
  if (s.textures && (!keep.textures || (to === 'obj' && opts.materials === false))) out.push(n(s.textures, 'texture'));
  if (s.colors && !keep.colors) out.push(tr('ui.d3.vertex_colours'));
  if (s.uvs && !keep.uvs) out.push(tr('ui.d3.uvs'));
  const anim = s.animations && (!keep.animations || opts.merge || opts.animations === false);
  if (anim) out.push(n(s.animations, 'animation'));
  if (s.skinning && (!keep.skinning || opts.merge)) out.push(tr('ui.d3.skeleton'));
  if (s.morphs && (!keep.morphs || opts.merge)) out.push(tr('ui.d3.morphs'));
  if (s.points && !keep.points) out.push(n(s.points, 'point_cloud'));
  if (s.lines && !keep.lines) out.push(n(s.lines, 'line_object'));
  if (s.lights && !keep.lights) out.push(n(s.lights, 'light'));
  if (s.cameras && !keep.cameras) out.push(n(s.cameras, 'camera'));
  return out;
}

const fmtSize = (v) => +Number(v).toPrecision(4);

/** The status line: what was made, the size, and what was left out. */
function summary(s, b, from, to, lost, notes, warnings) {
  const parts = [tr('ui.d3.read', { format: LABEL[from], meshes: n(s.meshes, 'mesh'), triangles: n(s.triangles, 'triangle'), vertices: n(s.vertices, 'vertex') })];
  if (b) parts.push(tr('ui.d3.size', { size: b.size.map(fmtSize).join(' × ') }));
  if (lost.length) parts.push(tr('ui.d3.cannot_hold', { format: LABEL[to], list: lost.join(', '), n: lost.length }));
  if (s.meshes > 1 && (to === 'stl' || to === 'ply')) parts.push(tr(to === 'stl' ? 'ui.d3.joined_solid' : 'ui.d3.joined_mesh', { n: s.meshes }));
  return [...parts, ...warnings, ...notes].join(' ');
}

export async function convertModel(files, to, opts = {}) {
  const read = await readModel(files, { ask: opts.ask !== false });
  const before = statsOf(read.root, read.animations);
  let root = transform(read.root, { scale: opts.scale, up: opts.up });
  if (opts.merge) {
    const { mergeGeometries } = await import('../../vendor/three/addons/utils/BufferGeometryUtils.js');
    root = merge(bake(root), mergeGeometries);
  }
  const keepAnim = opts.animations !== false && !opts.merge && (to === 'glb' || to === 'gltf');
  const out = await writeModel(root, to, { name: read.name, binary: opts.binary, materials: opts.materials, animations: keepAnim ? read.animations : [] });
  const lost = dropped(before, to, opts);
  const b = boundsOf(root);
  return { files: out.files, info: summary(before, b, read.format, to, lost, out.notes, read.warnings), stats: before, bounds: b, dropped: lost, format: read.format };
}
