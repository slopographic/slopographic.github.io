/* SlopLabel — render/svg: a scene as SVG markup in mm (used by the browser print page and SVG export).
 * Text carries textLength so its width matches the shared layout exactly. */
'use strict';

const f4 = (v) => num(v, 4);
function svgPrims(it, doc, ids) {
  const out = [];
  for (const p of it.prims) {
    switch (p.t) {
      case 'bars': {
        let d = '';
        for (const r of p.rects) d += `M${f4(r.x)} ${f4(r.y)}h${f4(r.w)}v${f4(r.h)}h${f4(-r.w)}z`;
        out.push(`<path d="${d}" fill="#000" shape-rendering="crispEdges"/>`);
        break;
      }
      case 'text':
        out.push(`<text x="${f4(p.x)}" y="${f4(p.y)}" font-family="${escHTML(fontDef(p.font).css)}" font-size="${f4(p.size)}"${p.bold ? ' font-weight="bold"' : ''}${p.italic ? ' font-style="italic"' : ''} fill="${p.color || '#000'}" textLength="${f4(p.w)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${escHTML(p.text)}</text>`);
        break;
      case 'rect':
        if (p.fill) out.push(`<rect x="${f4(p.x)}" y="${f4(p.y)}" width="${f4(p.w)}" height="${f4(p.h)}" rx="${f4(p.r || 0)}" fill="${p.fill}"/>`);
        if (p.sw > 0) out.push(`<rect x="${f4(p.x + p.sw / 2)}" y="${f4(p.y + p.sw / 2)}" width="${f4(p.w - p.sw)}" height="${f4(p.h - p.sw)}" rx="${f4(Math.max(0, (p.r || 0) - p.sw / 2))}" fill="none" stroke="#000" stroke-width="${f4(p.sw)}"/>`);
        break;
      case 'ellipse':
        out.push(`<ellipse cx="${f4(p.x + p.w / 2)}" cy="${f4(p.y + p.h / 2)}" rx="${f4(Math.max(0.01, p.w / 2 - p.sw / 2))}" ry="${f4(Math.max(0.01, p.h / 2 - p.sw / 2))}" fill="${p.fill || 'none'}"${p.sw > 0 ? ` stroke="#000" stroke-width="${f4(p.sw)}"` : ''}/>`);
        break;
      case 'line': out.push(`<line x1="${f4(p.x1)}" y1="${f4(p.y1)}" x2="${f4(p.x2)}" y2="${f4(p.y2)}" stroke="#000" stroke-width="${f4(p.sw)}"/>`); break;
      case 'invert': out.push(`<rect x="${f4(p.x)}" y="${f4(p.y)}" width="${f4(p.w)}" height="${f4(p.h)}" fill="#fff" style="mix-blend-mode:difference"/>`); break;
      case 'image': {
        const src = doc.assets && doc.assets[p.asset];
        if (src) out.push(`<image x="${f4(p.x)}" y="${f4(p.y)}" width="${f4(p.w)}" height="${f4(p.h)}" preserveAspectRatio="none" href="${escHTML(src)}"/>`);
        break;
      }
    }
  }
  return out.join('');
}
/** One label as a standalone <svg> sized in mm. */
function labelSVG(doc, items, { background = '#fff' } = {}) {
  const W = doc.label.w, H = doc.label.h;
  let body = '';
  for (const it of items) {
    if (it.error) continue;
    const m = itemMatrix(it).map((v) => f4(v));
    body += `<g transform="matrix(${m.join(' ')})">${svgPrims(it, doc)}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f4(W)}mm" height="${f4(H)}mm" viewBox="0 0 ${f4(W)} ${f4(H)}" style="isolation:isolate">` +
    (background ? `<rect width="${f4(W)}" height="${f4(H)}" fill="${background}"/>` : '') + body + '</svg>';
}
