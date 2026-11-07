/* Slop PDF: colours survive upload, render and save. The fixture is built byte by byte: a 2x2 RGB image in an
   ICC-based colour space and a function-based (ShadingType 1) fill. pdf.js versions without function shadings paint
   that fill hot pink, and the image pixels must not change either way. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;

  // Page is 300 x 200 pt. The image covers x 0..100, y 50..150 (canvas y 50..150 at scale 1), so each 2x2 cell's centre
  // is at x 25/75 and y 75/125. The shading fills x 150..250, y 50..150, so its centre is (200, 100).
  const IMAGE = [[200, 40, 30], [30, 160, 60], [20, 60, 200], [240, 240, 240]]; // row-major: top-left, top-right, bottom-left, bottom-right
  const SHADE = [64, 128, 191]; // the PostScript function below returns this colour everywhere
  const CENTRES = [[25, 75, 0], [75, 75, 1], [25, 125, 2], [75, 125, 3]];

  const enc = new TextEncoder();
  const cat = (...parts) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  };
  const txt = (s) => enc.encode(s);
  const stream = (dict, data) => cat(txt(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, txt('\nendstream'));

  /** A minimal ICC profile: 128-byte header declaring an RGB colour space with an XYZ connection space. */
  function iccStub() {
    const b = new Uint8Array(128), dv = new DataView(b.buffer);
    dv.setUint32(0, 128); b.set(txt('mntr'), 12); b.set(txt('RGB '), 16); b.set(txt('XYZ '), 20); b.set(txt('acsp'), 36);
    return b;
  }

  /** Object bodies (1-based numbering) to a complete PDF with a cross-reference table. */
  function buildPdf(bodies) {
    const parts = [txt('%PDF-1.7\n')], offs = []; let len = parts[0].length;
    bodies.forEach((body, i) => {
      offs.push(len);
      const chunk = cat(txt(`${i + 1} 0 obj\n`), body, txt('\nendobj\n'));
      parts.push(chunk); len += chunk.length;
    });
    let xref = `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    xref += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`;
    parts.push(txt(xref));
    return cat(...parts);
  }

  function colourFixture() {
    const pixels = new Uint8Array(IMAGE.flat());
    const content = txt('q 100 0 0 100 0 50 cm /Im1 Do Q\n/Pattern cs /P1 scn 150 50 100 100 re f\n');
    return buildPdf([
      txt('<< /Type /Catalog /Pages 2 0 R >>'),
      txt('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      txt('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> /Pattern << /P1 7 0 R >> >> >>'),
      stream('', content),
      stream('/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace [/ICCBased 6 0 R] /BitsPerComponent 8', pixels),
      stream('/N 3', iccStub()),
      txt('<< /PatternType 2 /Shading 8 0 R /Matrix [100 0 0 100 150 50] >>'),
      txt('<< /ShadingType 1 /ColorSpace /DeviceRGB /Domain [0 1 0 1] /Function 9 0 R >>'),
      stream('/FunctionType 4 /Domain [0 1 0 1] /Range [0 1 0 1 0 1]', txt('{ pop pop .25 .5 .75 }')),
    ]);
  }

  /** Samples the fixture's pixels from a rendered canvas. Returns the first mismatch or null. */
  function mismatch(canvas) {
    for (const [x, y, k] of CENTRES) {
      const got = PT.px(canvas, x, y), want = IMAGE[k];
      if (got.some((v, i) => Math.abs(v - want[i]) > 6)) return `image cell ${k} at (${x},${y}) is ${got}, want ${want}`;
    }
    const shade = PT.px(canvas, 200, 100);
    if (shade.some((v, i) => Math.abs(v - SHADE[i]) > 6)) return `function fill at (200,100) is ${shade}, want ${SHADE}`;
    return null;
  }

  describe('colours', () => {
    it('an ICC-based RGB image and a function-based fill keep their colours on upload and after save', async () => {
      PT.reset();
      const bytes = colourFixture();
      const f = await PT.open(new PT.win.Uint8Array(bytes), 'colour.pdf');
      expect(f).toBeTruthy();
      expect(mismatch(await PT.render(bytes, 0, 1))).toBe(null);
      const saved = await PT.E.build();
      expect(mismatch(await PT.render(saved, 0, 1))).toBe(null);
    });
  });
})();
