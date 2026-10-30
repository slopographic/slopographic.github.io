/* Text items of a PDF page from its operator list (pdf.js getOperatorList), one item per text show operation (Tj, TJ and
 * the ' and " forms, which pdf.js splits into their parts). pdf.js getTextContent joins text on one baseline into a single
 * item, so cells drawn as separate show operations would read as one cell; here each keeps its own x, y and width.
 * opItems(page, OPS) → [{ str, transform, width, height }] in content order, the getTextContent item shape, so linesOf
 * (pdf-layout.js) takes them unchanged. Text state follows PDF 9.3 (Tc, Tw, Tz, TL, Tf, Ts, Tm, Tlm, saved with q/Q).
 * Browser only: OPS is the pdf.js table (pdfjs.OPS). Classic ES module. */

const ID = [1, 0, 0, 1, 0, 0];
const GAP_EM = 0.2;   // inside a TJ array, a gap wider than a fifth of an em reads as a space

/** Matrix product m × n (apply m, then n), PDF order: [a b c d e f]. */
const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const six = (a) => [0, 1, 2, 3, 4, 5].map((k) => +a[k] || 0);

/** The items of one page. Throws if pdf.js cannot give an operator list (the caller then falls back to getTextContent). */
export async function opItems(page, OPS) {
  const { fnArray, argsArray } = await page.getOperatorList();
  const items = [];
  let g = { ctm: ID, fs: 0, tc: 0, tw: 0, th: 1, tl: 0, rise: 0 };   // graphics state with its text parameters
  let tm = ID, tlm = ID;
  const stack = [];

  /** One show operation: its glyphs (and TJ numbers) drawn from the current text position, then the position advances. */
  const show = (glyphs) => {
    const M = mul(tm, g.ctm), fs = g.fs, th = g.th;
    let str = '', adv = 0;                          // adv: advance in text space, scaled by size and horizontal scale
    for (const it of glyphs || []) {
      if (typeof it === 'number') {                 // TJ adjustment: thousandths of an em, positive moves left
        const d = (-it / 1000) * fs * th;
        if (-it / 1000 > GAP_EM) str += ' ';
        adv += d;
        continue;
      }
      if (!it) continue;
      str += it.unicode || '';
      adv += ((it.width || 0) / 1000) * fs * th + g.tc * th + (it.isSpace ? g.tw * th : 0);
    }
    if (str.trim()) {
      const x = g.rise * M[2] + M[4], y = g.rise * M[3] + M[5];
      items.push({
        str, transform: [fs * th * M[0], fs * th * M[1], fs * M[2], fs * M[3], x, y],
        width: adv * Math.hypot(M[0], M[1]), height: Math.abs(fs) * Math.hypot(M[2], M[3]),
      });
    }
    tm = mul([1, 0, 0, 1, adv, 0], tm);
  };
  const move = (tx, ty) => { tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm; };
  const nextLine = () => move(0, -g.tl);

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], a = argsArray[i] || [];
    switch (fn) {
      case OPS.save: stack.push(g); break;
      case OPS.restore: if (stack.length) g = stack.pop(); break;
      case OPS.transform: g = { ...g, ctm: mul(six(a), g.ctm) }; break;
      case OPS.paintFormXObjectBegin: stack.push(g); if (Array.isArray(a[0])) g = { ...g, ctm: mul(six(a[0]), g.ctm) }; break;
      case OPS.paintFormXObjectEnd: if (stack.length) g = stack.pop(); break;
      case OPS.beginText: tm = tlm = ID; break;
      case OPS.setFont: g = { ...g, fs: +a[1] || 0 }; break;
      case OPS.setLeading: g = { ...g, tl: +a[0] || 0 }; break;
      case OPS.setLeadingMoveText: g = { ...g, tl: -(+a[1] || 0) }; move(+a[0] || 0, +a[1] || 0); break;
      case OPS.setCharSpacing: g = { ...g, tc: +a[0] || 0 }; break;
      case OPS.setWordSpacing: g = { ...g, tw: +a[0] || 0 }; break;
      case OPS.setHScale: g = { ...g, th: (+a[0] || 100) / 100 }; break;
      case OPS.setTextRise: g = { ...g, rise: +a[0] || 0 }; break;
      case OPS.setTextMatrix: tlm = tm = six(a[0]); break;
      case OPS.moveText: move(+a[0] || 0, +a[1] || 0); break;
      case OPS.nextLine: nextLine(); break;
      case OPS.showText: case OPS.showSpacedText: show(a[0]); break;
      case OPS.nextLineShowText: nextLine(); show(a[0]); break;
      default: break;
    }
  }
  return items;
}
