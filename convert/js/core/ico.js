/* ICO container with PNG-compressed images (the Windows Vista+ form). Pure.
 * encodeIcoImages([{ png, width, height }]) → Uint8Array: one icon with several sizes (a favicon.ico with 16, 32 and 48).
 * encodeIco(pngBytes, width, height) → Uint8Array: one image. Sizes are 1-256 px; 256 is stored as 0 per the format. */
export function encodeIcoImages(images) {
  if (!images.length) throw new Error('An icon needs at least one image');
  for (const { width, height } of images) if (!(width >= 1 && width <= 256 && height >= 1 && height <= 256)) throw new Error('ICO images are 1 to 256 px');
  const head = 6 + 16 * images.length;
  const out = new Uint8Array(head + images.reduce((n, i) => n + i.png.length, 0));
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true);                // reserved
  dv.setUint16(2, 1, true);                // type 1 = icon
  dv.setUint16(4, images.length, true);    // number of images
  let at = head;
  images.forEach(({ png, width, height }, i) => {
    const e = 6 + 16 * i;
    out[e] = width === 256 ? 0 : width;
    out[e + 1] = height === 256 ? 0 : height;
    out[e + 2] = 0;                        // colour count (0 = more than 256)
    out[e + 3] = 0;
    dv.setUint16(e + 4, 1, true);          // colour planes
    dv.setUint16(e + 6, 32, true);         // bits per pixel
    dv.setUint32(e + 8, png.length, true); // image size
    dv.setUint32(e + 12, at, true);        // offset of the image data
    out.set(png, at);
    at += png.length;
  });
  return out;
}

export function encodeIco(pngBytes, width, height) {
  return encodeIcoImages([{ png: pngBytes, width, height }]);
}
