/* Slop Press — PNG/JPEG page export and printing (pages rendered at a chosen resolution). */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, S = PR.state, R = PR.render, P = PR.pages;
  var RA = PR.raster = {};

  function blobOf(c, type, q) { return new Promise(function (res) { c.toBlob(res, type || 'image/png', q); }); }
  /** One page as a PNG blob. dpi: output resolution; bleed: include the bleed area. */
  RA.pageBlob = function (i, dpi, o) {
    o = o || {};
    return PR.fonts.ready(S.doc).then(function () { return R.ready(S.doc); }).then(function () {
      var c = R.pageCanvas(S.doc, i, (dpi || 150) / 72, { bleed: !!o.bleed, paper: o.transparent ? 'rgba(0,0,0,0)' : '#ffffff' });
      return blobOf(c, o.type, o.quality);
    });
  };
  /** Exports pages (indexes) as PNGs: one file, or a .zip when there are several. */
  RA.exportPNG = function (pages, dpi, o) {
    o = o || {};
    var base = PR.io.baseName(), ext = o.type === 'image/jpeg' ? 'jpg' : 'png', files = [];
    return pages.reduce(function (p, i) {
      return p.then(function () { return RA.pageBlob(i, dpi, o); }).then(function (b) { files.push({ i: i, blob: b }); });
    }, Promise.resolve()).then(function () {
      if (files.length === 1) { window.SlopUI.download(files[0].blob, base + '-p' + P.label(S.doc, files[0].i) + '.' + ext); return files; }
      return Promise.all(files.map(function (f) { return f.blob.arrayBuffer().then(function (b) { return { name: base + '-p' + String(P.label(S.doc, f.i)).padStart(3, '0') + '.' + ext, data: new Uint8Array(b), store: true }; }); }))
        .then(PR.zip.write).then(function (z) { window.SlopUI.download(z, base + '-pages.zip'); return files; });
    });
  };
  /** Prints pages through the browser (one image per sheet, sized to the page with @page). */
  RA.print = function (pages, dpi, o) {
    o = o || {};
    var root = document.getElementById('printRoot'); root.innerHTML = '';
    var d = S.doc, b = o.bleed ? P.bleed(d, 0) : { left: 0, right: 0, top: 0, bottom: 0 };
    var wmm = (d.size.w + b.left + b.right) / U.UNITS.mm, hmm = (d.size.h + b.top + b.bottom) / U.UNITS.mm;
    var st = document.getElementById('printPageStyle') || document.head.appendChild(U.h('style', { id: 'printPageStyle' }));
    st.textContent = '@media print { @page { size: ' + wmm.toFixed(2) + 'mm ' + hmm.toFixed(2) + 'mm; margin: 0; } .print-root img { width: ' + wmm.toFixed(2) + 'mm; height: ' + hmm.toFixed(2) + 'mm; } }';
    return pages.reduce(function (p, i) {
      return p.then(function () { return RA.pageBlob(i, dpi || 200, { bleed: o.bleed }); }).then(function (bl) {
        return new Promise(function (res) { var img = new Image(); img.onload = res; img.onerror = res; img.src = URL.createObjectURL(bl); img.alt = U.t('press.io.page_alt', { page: String(P.label(d, i)) }); root.append(img); });
      });
    }, Promise.resolve()).then(function () {
      setTimeout(function () { window.print(); }, 50);
      var clean = function () { U.$$('img', root).forEach(function (im) { URL.revokeObjectURL(im.src); }); root.innerHTML = ''; removeEventListener('afterprint', clean); };
      addEventListener('afterprint', clean);
      return pages.length;
    });
  };
})();
