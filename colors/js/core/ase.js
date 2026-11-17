/* Slop Colors: Adobe Swatch Exchange (.ase) files, written and read (Photoshop, Illustrator, InDesign and many other
 * tools open them). Pure; the factory takes the convert module.
 * The format (big-endian): "ASEF", version 1.0, the block count; then blocks, each a type (0xC001 group start, 0xC002
 * group end, 0x0001 colour), a byte length and the body. A colour's body: the name (UTF-16 with its length in units,
 * the terminating zero included), the model ("RGB ", "CMYK", "LAB ", "Gray") as four characters, its values as 32-bit
 * floats, and a type (0 global, 1 spot, 2 normal). Lab is L 0-1 (×100) with a and b as they are, D50, as Adobe writes it.
 *   write(palette) → Uint8Array   one group named after the palette, RGB colours, type global
 *   read(bytes) → palette         RGB, CMYK, Lab and Gray colours; groups are flattened in order; the first group's name
 *                                 is the palette's */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else (root.SlopColors = root.SlopColors || {}).ase = factory(root.SlopColors.convert);
})(typeof window !== 'undefined' ? window : globalThis, function (C) {
  'use strict';
  const units = (s) => [...String(s)].flatMap((ch) => { const c = ch.codePointAt(0); if (c < 0x10000) return [c]; const v = c - 0x10000; return [0xd800 + (v >> 10), 0xdc00 + (v & 1023)]; });
  function nameBytes(s) {
    const u = units(s).concat([0]), b = new Uint8Array(2 + u.length * 2), dv = new DataView(b.buffer);
    dv.setUint16(0, u.length); u.forEach((x, i) => dv.setUint16(2 + i * 2, x));
    return b;
  }
  function block(type, body) {
    const b = new Uint8Array(6 + body.length), dv = new DataView(b.buffer);
    dv.setUint16(0, type); dv.setUint32(2, body.length); b.set(body, 6);
    return b;
  }
  function colorBody(hex, name) {
    const n = nameBytes(name), b = new Uint8Array(n.length + 4 + 12 + 2), dv = new DataView(b.buffer);
    b.set(n, 0); b.set([82, 71, 66, 32], n.length);   // "RGB "
    C.rgbOf(hex).forEach((v, i) => dv.setFloat32(n.length + 4 + i * 4, v / 255));
    dv.setUint16(n.length + 16, 0);
    return b;
  }
  function write(p) {
    const blocks = [block(0xc001, nameBytes(p.name || 'Palette'))];
    for (const c of p.colors) blocks.push(block(0x0001, colorBody(c.hex, c.name || c.hex)));
    blocks.push(block(0xc002, new Uint8Array(0)));
    const size = 12 + blocks.reduce((s, b) => s + b.length, 0), out = new Uint8Array(size), dv = new DataView(out.buffer);
    out.set([65, 83, 69, 70]); dv.setUint16(4, 1); dv.setUint16(6, 0); dv.setUint32(8, blocks.length);
    let at = 12;
    for (const b of blocks) { out.set(b, at); at += b.length; }
    return out;
  }
  /** CIE Lab (D50) → sRGB through XYZ, with the Bradford D50 → D65 adaptation. */
  function labToRgb(L, a, b) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200, e = 216 / 24389, k = 24389 / 27;
    const inv = (f) => (f ** 3 > e ? f ** 3 : (116 * f - 16) / k);
    const X = 0.96422 * inv(fx), Y = L > k * e ? fy ** 3 : L / k, Z = 0.82521 * inv(fz);
    const x = 0.9555766 * X - 0.0230393 * Y + 0.0631636 * Z, y = -0.0282895 * X + 1.0099416 * Y + 0.0210077 * Z, z = 0.0122982 * X - 0.0204830 * Y + 1.3299098 * Z;
    const lin = [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.9692660 * x + 1.8760108 * y + 0.0415560 * z, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z];
    return lin.map((v) => { v = Math.min(1, Math.max(0, v)); return (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255; });
  }
  function read(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b.length < 12 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'ASEF') throw new Error('This is not an Adobe Swatch Exchange file (no "ASEF" at its start)');
    const count = dv.getUint32(8), colors = [];
    let at = 12, name = '';
    const readName = (o) => { const n = dv.getUint16(o), u = []; for (let i = 0; i < n; i++) u.push(dv.getUint16(o + 2 + i * 2)); return { text: String.fromCharCode(...u).replace(/\0+$/, ''), end: o + 2 + n * 2 }; };
    for (let i = 0; i < count && at + 6 <= b.length; i++) {
      const type = dv.getUint16(at), len = dv.getUint32(at + 2), body = at + 6;
      if (body + len > b.length) throw new Error('The file is cut short');
      if (type === 0xc001 && !name && len) name = readName(body).text;
      if (type === 0x0001) {
        const nm = readName(body), model = String.fromCharCode(...b.slice(nm.end, nm.end + 4)), f = (k) => dv.getFloat32(nm.end + 4 + k * 4);
        let rgb = null;
        if (model === 'RGB ') rgb = [f(0) * 255, f(1) * 255, f(2) * 255];
        else if (model === 'CMYK') rgb = C.cmykToRgb(f(0) * 100, f(1) * 100, f(2) * 100, f(3) * 100);
        else if (model === 'LAB ') rgb = labToRgb(f(0) * 100, f(1), f(2));
        else if (model === 'Gray') rgb = [f(0) * 255, f(0) * 255, f(0) * 255];
        if (rgb) { const hex = C.hexOf(rgb); colors.push(nm.text && nm.text.toLowerCase() !== hex ? { hex, name: nm.text } : { hex }); }
      }
      at = body + len;
    }
    if (!colors.length) throw new Error('No colours were found in the file');
    return { name: name || 'Palette', colors };
  }
  return { write, read, labToRgb };
});
