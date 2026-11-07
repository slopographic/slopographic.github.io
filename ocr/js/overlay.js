/* Slop OCR: the page picture with the detected text boxes drawn over it. The canvas keeps the picture's pixel size
 * and CSS scales it to the panel width. The box colour is the theme's accent (--sl-accent). */

function accent() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--sl-accent').trim() || '#4f6c00';
  } catch (e) {
    return '#4f6c00';
  }
}

/** Draws src (a canvas) into target, and the boxes of lines ({ box: { x, y, w, h } }) when showBoxes is set. */
export function drawPage(target, src, lines, showBoxes) {
  target.width = src.width;
  target.height = src.height;
  const g = target.getContext('2d');
  g.drawImage(src, 0, 0);
  if (!showBoxes || !lines.length) return;
  const ink = accent();
  const lw = Math.max(2, Math.round(Math.min(src.width, src.height) / 400));
  g.lineWidth = lw;
  g.strokeStyle = ink;
  g.fillStyle = ink;
  for (const l of lines) {
    const { x, y, w, h } = l.box;
    g.globalAlpha = 0.14;
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
    g.strokeRect(x, y, w, h);
  }
}
