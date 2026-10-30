/* BMP encoder: 24-bit uncompressed Windows bitmap from RGBA pixels (alpha is dropped, so flatten first).
 * encodeBmp({ width, height, data }) → Uint8Array. data is RGBA, row-major, top row first. */
export function encodeBmp({ width, height, data }) {
  if (!(width > 0 && height > 0) || data.length < width * height * 4) throw new Error('encodeBmp: bad pixel buffer');
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const out = new Uint8Array(54 + pixelBytes);
  const dv = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;                       // "BM"
  dv.setUint32(2, out.length, true);
  dv.setUint32(10, 54, true);                         // pixel data offset
  dv.setUint32(14, 40, true);                         // BITMAPINFOHEADER size
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true);                      // positive: rows stored bottom-up
  dv.setUint16(26, 1, true);                          // planes
  dv.setUint16(28, 24, true);                         // bits per pixel
  dv.setUint32(34, pixelBytes, true);
  dv.setInt32(38, 2835, true);                        // 72 dpi
  dv.setInt32(42, 2835, true);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    let o = 54 + y * rowSize;
    for (let x = 0; x < width; x++, o += 3) {
      const s = src + x * 4;
      out[o] = data[s + 2]; out[o + 1] = data[s + 1]; out[o + 2] = data[s];
    }
  }
  return out;
}
