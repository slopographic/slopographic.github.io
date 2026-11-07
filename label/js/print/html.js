/* SlopLabel — print/html: the browser print page. Exact @page size in mm (label for rolls, the sheet
 * for Avery/Herma stock), every label absolutely positioned in mm, vector SVG or printer-DPI bitmaps. */
'use strict';

const mmStr = (v) => num(v, 3) + 'mm';
/** @page rule for a stock: size is the physical page, margins zero so the printer's origin is the sheet corner. */
function pageCSS(st) { return `@page { size: ${mmStr(st.pageW)} ${mmStr(st.pageH)}; margin: 0; }`; }
function printCSS(st) {
  return [pageCSS(st),
    'html, body { margin: 0; padding: 0; background: #fff; }',
    '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }',
    `.page { position: relative; width: ${mmStr(st.pageW)}; height: ${mmStr(st.pageH)}; overflow: hidden; break-after: page; page-break-after: always; }`,
    '.page:last-child { break-after: auto; page-break-after: auto; }',
    `.lbl { position: absolute; width: ${mmStr(st.w)}; height: ${mmStr(st.h)}; overflow: hidden; }`,
    '.lbl > svg, .lbl > img { display: block; width: 100%; height: 100%; }',
    '.lbl > img { image-rendering: pixelated; }',
    '@media screen { body { background: #777; padding: 12px; } .page { background: #fff; margin: 0 auto 12px; box-shadow: 0 2px 10px rgba(0,0,0,.4); } }',
  ].join('\n');
}
/** scenes: array of display lists (one per label). mode: 'vector' | 'bitmap'. */
function printHTML(doc, scenes, { start = 0, mode = 'vector', title = 'Labels', outline = false } = {}) {
  const { stock, pages } = layoutPages(doc, scenes.length, start);
  let body = '';
  for (const pg of pages) {
    body += '<div class="page">';
    for (const s of pg.slots) {
      const items = scenes[s.label];
      const inner = mode === 'bitmap' ? `<img alt="" src="${renderLabelCanvas(doc, items, doc.dpi, { mono: true }).toDataURL('image/png')}">` : labelSVG(doc, items);
      body += `<div class="lbl" style="left:${mmStr(s.x)};top:${mmStr(s.y)}${outline ? ';outline:0.1mm dashed #bbb' : ''}">${inner}</div>`;
    }
    body += '</div>';
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHTML(title)}</title><style>${printCSS(stock)}</style></head><body>${body}</body></html>`;
}
/** Print through a hidden iframe (keeps the app open; works offline). */
function printViaIframe(html) {
  return new Promise((resolve) => {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    document.body.append(f);
    const w = f.contentWindow;
    w.document.open(); w.document.write(html); w.document.close();
    const go = () => {
      const imgs = [...w.document.images];
      Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => {
        setTimeout(() => {
          try { w.focus(); w.print(); } catch (e) { /* blocked */ }
          setTimeout(() => { f.remove(); resolve(); }, 1500);
        }, 120);
      });
    };
    if (w.document.readyState === 'complete') go(); else w.addEventListener('load', go, { once: true });
  });
}
