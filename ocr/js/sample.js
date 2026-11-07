/* Slop OCR: the sample for "Try it with a sample receipt". A till receipt drawn on a canvas in the page (dark text on
 * white paper, a tilt-free scan), so the first visit has text to read. Needs shared/samples/samples.js (SlopSamples). */

const LINES = [
  ['SLOP CAFE', '', 'head'],
  ['12 Market Street', '', 'mid'],
  ['Receipt 2026-0418', '', 'mid'],
  ['', '', 'rule'],
  ['Flat white', '3.80'],
  ['Croissant', '2.90'],
  ['Sparkling water', '2.20'],
  ['Banana bread', '3.10'],
  ['', '', 'rule'],
  ['Total', '12.00', 'bold'],
  ['Paid by card', '12.00'],
  ['', '', 'gap'],
  ['Thank you, see you soon', '', 'mid'],
];

/** The receipt as a PNG file named "Sample receipt.png". */
export async function sampleReceipt() {
  const W = 760, LH = 58, c = document.createElement('canvas');
  c.width = W; c.height = 80 + LINES.length * LH;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#111111'; g.textBaseline = 'middle';
  LINES.forEach(([left, right, kind], i) => {
    const y = 60 + i * LH;
    if (kind === 'rule') { g.fillRect(48, y, W - 96, 3); return; }
    g.font = (kind === 'head' ? '700 46px' : kind === 'bold' ? '700 36px' : '36px') + ' "DejaVu Sans Mono", Menlo, Consolas, monospace';
    if (kind === 'head' || kind === 'mid') { g.textAlign = 'center'; g.fillText(left, W / 2, y); return; }
    g.textAlign = 'left'; g.fillText(left, 48, y);
    g.textAlign = 'right'; g.fillText(right, W - 48, y);
  });
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return window.SlopSamples.file('Sample receipt.png', blob, 'image/png');
}
