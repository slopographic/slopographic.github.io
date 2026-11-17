/* The MTL file for an OBJ: one newmtl block per material, with its colour, shininess, opacity and emission, and a
 * map_Kd picture (PNG, written next to the OBJ) for a colour texture. three.js has an MTL reader but no writer.
 *   writeMtl(materials, stem, canvasOf) → { text, textures: [{ name, blob }], skipped }
 * materials: three.js materials whose names are unique and plain. canvasOf(texture) → a canvas, or null where pictures
 * cannot be drawn (Node); those textures are counted in skipped. */
const f = (v) => +Number(v).toFixed(6);
/** A linear working-space colour as the sRGB triple MTL files hold (three.js' MTLLoader reads them back as sRGB). */
const rgb = (c) => { const s = c.clone().convertLinearToSRGB(); return `${f(s.r)} ${f(s.g)} ${f(s.b)}`; };

async function pngOf(canvas) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((r) => canvas.toBlob(r, 'image/png'));
}

export async function writeMtl(materials, stem, canvasOf) {
  const lines = ['# Written by Slopographic'];
  const textures = [], done = new Map();
  let skipped = 0;
  for (const m of materials) {
    lines.push('', `newmtl ${m.name}`);
    lines.push(`Kd ${m.color ? rgb(m.color) : '0.8 0.8 0.8'}`, 'Ka 0 0 0');
    const rough = m.roughness ?? (m.shininess !== undefined ? 1 - Math.sqrt(m.shininess / 100) : 0.6);
    const metal = m.metalness ?? 0;
    lines.push(`Ks ${f(0.04 + 0.5 * metal)} ${f(0.04 + 0.5 * metal)} ${f(0.04 + 0.5 * metal)}`);
    lines.push(`Ns ${f(Math.max(1, Math.min(1000, (1 - rough) * (1 - rough) * 1000)))}`);
    if (m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)) lines.push(`Ke ${rgb(m.emissive)}`);
    const d = m.transparent ? m.opacity ?? 1 : 1;
    lines.push(`d ${f(d)}`, `illum ${d < 1 ? 4 : 2}`);
    if (m.map) {
      let name = done.get(m.map);
      if (name === undefined) {
        const c = canvasOf(m.map);
        if (c) {
          name = `${stem}_${m.name}.png`;
          textures.push({ name, blob: await pngOf(c) });
        } else { name = null; skipped++; }
        done.set(m.map, name);
      }
      if (name) lines.push(`map_Kd ${name}`);
    }
  }
  return { text: lines.join('\n') + '\n', textures, skipped };
}
