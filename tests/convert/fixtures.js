/* Shared test helper: a small PNG with a coloured block, made on a canvas. */
export async function pngOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#3b82f6';
  x.fillRect(0, 0, w, h);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
