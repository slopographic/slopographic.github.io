// Small test models, made here in code: a 2 × 2 × 2 cube (8 corners, 6 square faces, 12 triangles) as Collada, ASCII
// FBX, binary FBX and 3MF, and helpers to split a .gltf into .gltf + .bin + picture. Helper for tests/3d-io and
// tests/convert/threed; not a test itself.
import { writeZip } from '../../shared/office/zip.js';

export const CORNERS = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
/** The six faces, each corner list counter-clockwise seen from outside. */
export const QUADS = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]];

export function dae() {
  const p = QUADS.flat().join(' ');
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>
  <library_geometries><geometry id="cube" name="Cube"><mesh>
    <source id="pos"><float_array id="pos-a" count="24">${CORNERS.join(' ')}</float_array>
      <technique_common><accessor source="#pos-a" count="8" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
    <vertices id="verts"><input semantic="POSITION" source="#pos"/></vertices>
    <polylist count="6"><input semantic="VERTEX" source="#verts" offset="0"/><vcount>4 4 4 4 4 4</vcount><p>${p}</p></polylist>
  </mesh></geometry></library_geometries>
  <library_visual_scenes><visual_scene id="Scene"><node id="n1" name="Cube"><instance_geometry url="#cube"/></node></visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>
`;
}

/** FBX polygon indices: the last corner of each face is stored as -(index + 1). */
const fbxIndex = () => QUADS.flatMap((q) => [q[0], q[1], q[2], -q[3] - 1]);

export function fbxAscii() {
  return `; FBX 7.4.0 project file
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7400
}
Objects:  {
	Geometry: 100, "Geometry::Cube", "Mesh" {
		Vertices: *24 {
			a: ${CORNERS.join(',')}
		}
		PolygonVertexIndex: *24 {
			a: ${fbxIndex().join(',')}
		}
		GeometryVersion: 124
	}
	Model: 200, "Model::Cube", "Mesh" {
		Version: 232
	}
}
Connections:  {
	C: "OO",100,200
	C: "OO",200,0
}
`;
}

/** Binary FBX 7.4: node records (32-bit offsets), a null record, and a zero footer. */
export function fbxBinary() {
  const parts = [];
  let size = 0;
  const push = (u8) => { parts.push(u8); size += u8.length; };
  const enc = new TextEncoder();
  const prop = {
    I: (v) => { const b = new Uint8Array(5); b[0] = 73; new DataView(b.buffer).setInt32(1, v, true); return b; },
    L: (v) => { const b = new Uint8Array(9); b[0] = 76; new DataView(b.buffer).setBigInt64(1, BigInt(v), true); return b; },
    S: (s) => { const t = enc.encode(s), b = new Uint8Array(5 + t.length); b[0] = 83; new DataView(b.buffer).setUint32(1, t.length, true); b.set(t, 5); return b; },
    d: (arr) => { const b = new Uint8Array(13 + arr.length * 8), dv = new DataView(b.buffer); b[0] = 100; dv.setUint32(1, arr.length, true); dv.setUint32(5, 0, true); dv.setUint32(9, arr.length * 8, true); arr.forEach((v, i) => dv.setFloat64(13 + i * 8, v, true)); return b; },
    i: (arr) => { const b = new Uint8Array(13 + arr.length * 4), dv = new DataView(b.buffer); b[0] = 105; dv.setUint32(1, arr.length, true); dv.setUint32(5, 0, true); dv.setUint32(9, arr.length * 4, true); arr.forEach((v, i) => dv.setInt32(13 + i * 4, v, true)); return b; },
  };
  // node: [name, [props], [children]] → bytes, written at absolute offset `at`
  const node = (at, [name, props, kids = []]) => {
    const nm = enc.encode(name), pl = props.reduce((n, p) => n + p.length, 0);
    const head = 13 + nm.length;
    let body = [], off = at + head + pl;
    for (const k of kids) { const b = node(off, k); body.push(b); off += b.length; }
    if (kids.length) { body.push(new Uint8Array(13)); off += 13; }
    const out = new Uint8Array(off - at), dv = new DataView(out.buffer);
    dv.setUint32(0, off, true); dv.setUint32(4, props.length, true); dv.setUint32(8, pl, true); out[12] = nm.length; out.set(nm, 13);
    let p = head;
    for (const x of props) { out.set(x, p); p += x.length; }
    for (const b of body) { out.set(b, p); p += b.length; }
    return out;
  };
  const magic = new Uint8Array(27);
  magic.set(enc.encode('Kaydara FBX Binary  '), 0); magic[20] = 0; magic[21] = 0x1a; magic[22] = 0;
  new DataView(magic.buffer).setUint32(23, 7400, true);
  push(magic);
  const tree = [
    ['Objects', [], [
      ['Geometry', [prop.L(100), prop.S('Cube\u0000\u0001Geometry'), prop.S('Mesh')], [
        ['Vertices', [prop.d(CORNERS)]], ['PolygonVertexIndex', [prop.i(fbxIndex())]], ['GeometryVersion', [prop.I(124)]]]],
      ['Model', [prop.L(200), prop.S('Cube\u0000\u0001Model'), prop.S('Mesh')], [['Version', [prop.I(232)]]]]]],
    ['Connections', [], [['C', [prop.S('OO'), prop.L(100), prop.L(200)]], ['C', [prop.S('OO'), prop.L(200), prop.L(0)]]]],
  ];
  for (const t of tree) push(node(size, t));
  push(new Uint8Array(13 + 176));
  const all = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return all;
}

export async function threeMf() {
  const v = [];
  for (let i = 0; i < 8; i++) v.push(`<vertex x="${CORNERS[i * 3]}" y="${CORNERS[i * 3 + 1]}" z="${CORNERS[i * 3 + 2]}"/>`);
  const t = QUADS.flatMap((q) => [`<triangle v1="${q[0]}" v2="${q[1]}" v3="${q[2]}"/>`, `<triangle v1="${q[0]}" v2="${q[2]}" v3="${q[3]}"/>`]);
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<resources><object id="1" name="Cube" type="model"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object></resources>
<build><item objectid="1"/></build></model>`;
  const types = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  return writeZip([{ path: '[Content_Types].xml', data: types }, { path: '_rels/.rels', data: rels }, { path: '3D/3dmodel.model', data: model }]);
}

const fromDataUri = (uri) => { const b = atob(uri.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
/** A .gltf with embedded data split into name.gltf + name.bin + textures/<picture>.png, as exporters often write it. */
export async function splitGltf(gltfBlob, name) {
  const j = JSON.parse(await gltfBlob.text());
  const files = [];
  j.buffers.forEach((b, i) => { const bin = fromDataUri(b.uri); b.uri = `${name}${i || ''}.bin`; files.push(new File([bin], b.uri)); });
  (j.images || []).forEach((im, i) => { if (!im.uri) return; const png = fromDataUri(im.uri); im.uri = `textures/pic%20${i}.png`; files.push(new File([png], `pic ${i}.png`, { type: 'image/png' })); });
  files.unshift(new File([JSON.stringify(j)], `${name}.gltf`, { type: 'model/gltf+json' }));
  return files;
}

/** The parts of a GLB: { magic, version, length, json, bin, chunks: [{ type, length }] }. */
export function glbParts(buf) {
  const dv = new DataView(buf), chunks = [];
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.byteLength) {
    const length = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    chunks.push({ type, length, offset: off + 8 });
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, length)));
    if (type === 0x004e4942) bin = new Uint8Array(buf, off + 8, length);
    off += 8 + length;
  }
  return { magic: dv.getUint32(0, true), version: dv.getUint32(4, true), length: dv.getUint32(8, true), json, bin, chunks, end: off };
}
