/* The 3D model conversions of File convert. The reading, writing and the drop report are the shared 3D I/O module's
 * (shared/3d-io, built on the three.js loaders and exporters), the same one Slop 3D opens and exports with, loaded
 * only when a 3D conversion runs. Each entry takes the model formats in `from` and, beside them, the files a model
 * can come with (`with`: an OBJ's .mtl, a glTF's .bin, textures), which are found by name and never converted alone.
 * The runs are 'combine': every model among the files gives its own output, with the companions shared. */
import { tr } from './i18n.js';
/** A select choice [value, label] whose label is read in the current language. */
const ch = (v, label) => Object.defineProperty([v], 1, { get: label, enumerable: true });
const IN = ['obj', 'stl', 'ply', 'gltf', 'glb', '3mf', 'dae', 'fbx'];
const WITH = ['mtl', 'bin', 'png', 'jpg', 'webp', 'gif', 'bmp', 'tga', 'ktx2'];
export const MODEL_KINDS = IN;
export const COMPANION_KINDS = WITH;

const UNITS = { key: 'units', type: 'select', get label() { return tr('convert.threed.units'); }, value: '1', options: [
  ch('1', () => tr('convert.threed.keep_the_size')), ch('1000', () => tr('convert.threed.metres_to_millimetres_1000')), ch('0.001', () => tr('convert.threed.millimetres_to_metres_0_001')),
  ch('10', () => tr('convert.threed.centimetres_to_millimetres_10')), ch('0.01', () => tr('convert.threed.centimetres_to_metres_0_01')),
  ch('25.4', () => tr('convert.threed.inches_to_millimetres_25_4')), ch('0.0254', () => tr('convert.threed.inches_to_metres_0_0254'))],
  get hint() { return tr('convert.threed.most_formats_have_no_unit_a'); } };
const SCALE = { key: 'scale', type: 'number', get label() { return tr('convert.threed.extra_scale_factor'); }, min: 0, max: 1000000, placeholder: '1', get hint() { return tr('convert.threed.blank_keeps_1_multiplies_on_top'); } };
const UP = { key: 'up', type: 'select', get label() { return tr('convert.threed.up_axis'); }, value: 'keep', options: [ch('keep', () => tr('convert.threed.keep_as_it_is')), ch('z-to-y', () => tr('convert.threed.z_up_to_y_up_stl')), ch('y-to-z', () => tr('convert.threed.y_up_to_z_up_gltf'))] };
const MERGE = { key: 'merge', type: 'checkbox', get label() { return tr('convert.threed.merge_all_meshes_into_one'); }, value: false, get hint() { return tr('convert.threed.one_mesh_with_each_material_kept'); } };
const ENCODING = { key: 'encoding', type: 'select', get label() { return tr('convert.threed.encoding'); }, value: 'binary', options: [ch('binary', () => tr('convert.threed.binary_small')), ch('ascii', () => tr('convert.threed.ascii_text'))] };
const MATERIALS = { key: 'materials', type: 'checkbox', get label() { return tr('convert.threed.write_materials_an_mtl_file_and'); }, value: true };
const ANIMATIONS = { key: 'animations', type: 'checkbox', get label() { return tr('convert.threed.keep_animations'); }, value: true };

let io = null;
const load = () => (io ??= import('../../../shared/3d-io/convert.js'));

/** One conversion run for every model among the files. A model that fails is reported; all failing throws. */
function to(format) {
  return async (files, o = {}) => {
    const { convertModel } = await load();
    const models = files.filter((f) => IN.includes(f.kind));
    const others = files.filter((f) => !IN.includes(f.kind));
    if (!models.length) throw new Error(tr('convert.threed.add_model'));
    const out = [], info = [], failed = [];
    const scale = (Number(o.units) || 1) * (Number(o.scale) > 0 ? Number(o.scale) : 1);
    for (const m of models) {
      try {
        const r = await convertModel([m, ...others].map((f) => ({ name: f.name, blob: f.file })), format, {
          scale, up: o.up || 'keep', merge: !!o.merge, binary: o.encoding !== 'ascii', materials: o.materials !== false, animations: o.animations !== false });
        out.push(...r.files);
        info.push(models.length > 1 ? `${m.name}: ${r.info}` : r.info);
      } catch (e) {
        failed.push(`${m.name}: ${(e && e.message) || e}`);
      }
    }
    if (!out.length) throw new Error(failed.join(' '));
    out.info = [...info, ...failed.map((f) => tr('convert.threed.not_converted', { what: f }))].join(' ');
    return out;
  };
}

const entry = (format, label, options) => ({ id: `3d-to-${format}`, get label() { return label(); }, group: '3D models', from: IN, with: WITH, ext: format, mode: 'combine', options, run: to(format) }); // i18n-ignore: group is an id

export const THREED = [
  entry('stl', () => tr('convert.threed.to_stl'), [ENCODING, UNITS, SCALE, UP]),
  entry('obj', () => tr('convert.threed.to_obj'), [MATERIALS, MERGE, UNITS, SCALE, UP]),
  entry('glb', () => tr('convert.threed.to_glb'), [ANIMATIONS, MERGE, UNITS, SCALE, UP]),
  entry('gltf', () => tr('convert.threed.to_gltf'), [ANIMATIONS, MERGE, UNITS, SCALE, UP]),
  entry('ply', () => tr('convert.threed.to_ply'), [ENCODING, UNITS, SCALE, UP]),
  entry('usdz', () => tr('convert.threed.to_usdz'), [MERGE, UNITS, SCALE, UP]),
];
