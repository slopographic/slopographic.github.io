/* SlopVector — io: downloads, SVG export, PNG/JPG export */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state;
  var fmt = G.fmt, esc = SV.esc, clone = SV.clone;
  var abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;
  var IO = SV.io = SV.io || {};
  var $ = SV._io = SV._io || {};

  /* ================= download helper ================= */
  IO.download = function (blob, name) { window.SlopUI.download(blob, name); };
  function safeName(n) { return String(n || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Untitled'; }
  IO.baseName = function () { return safeName(S.doc.name); };

  /* ================= SVG export ================= */
  function idName(n) { var s = String(n).trim().replace(/[^A-Za-z0-9_\-]+/g, '_'); if (!/^[A-Za-z_]/.test(s)) s = '_' + s; return s; }
  IO.exportSVG = function (opts) {
    opts = opts || {};
    var doc = S.doc, defs = [], gc = 0, used = {};
    var ctx = {
      defs: defs, outline: false, names: !opts.noIds,
      gradId: function () { return 'sv-gradient-' + (++gc); },
      uniqueName: function (n) { var b = idName(n), k = b, i = 2; while (used[k]) k = b + '-' + (i++); used[k] = 1; return k; }
    };
    var body = '', W = doc.width, H = doc.height, vb = '0 0 ' + fmt(W) + ' ' + fmt(H);
    if (opts.ids) {
      var b = SV.selBBox(opts.ids) || { x: 0, y: 0, w: 1, h: 1 };
      W = max(1, b.w); H = max(1, b.h); vb = fmt(b.x) + ' ' + fmt(b.y) + ' ' + fmt(W) + ' ' + fmt(H);
      body = SV.zSorted(opts.ids).map(function (id) { return SV.objToSVG(SV.getObj(id), ctx); }).join('\n');
    } else {
      if (opts.background) body += '<rect width="100%" height="100%" fill="' + opts.background + '"/>\n';
      doc.layers.forEach(function (L) {
        if (L.hidden) return;
        body += '<g id="' + ctx.uniqueName(L.name) + '" data-name="' + esc(L.name) + '">\n' + L.children.map(function (o) { return SV.objToSVG(o, ctx); }).filter(Boolean).join('\n') + '\n</g>\n';
      });
    }
    var meta = '';
    if (opts.metadata) {
      var json = JSON.stringify({ app: 'SlopVector', format: 1, doc: doc });
      meta = '<metadata id="slopvector-document"><![CDATA[' + json.replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]></metadata>\n';
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="' + fmt(W) + '" height="' + fmt(H) + '" viewBox="' + vb + '">\n' +
      '<title>' + esc(doc.name) + '</title>\n<desc>Made with SlopVector — slopographic.com/vector</desc>\n' + meta +
      (defs.length ? '<defs>\n' + defs.join('\n') + '\n</defs>\n' : '') + body + '</svg>\n';
  };
  IO.saveSVG = function (name) {
    if (name) S.doc.name = name;
    var svg = IO.exportSVG({ metadata: true });
    IO.download(new Blob([svg], { type: 'image/svg+xml' }), IO.baseName() + '.svg');
    SV.markSaved(); SV.scheduleAutosave();
    SV.toast(SV.t('vector.msg.saved_svg', { file: IO.baseName() + '.svg' }));
  };
  IO.exportPlainSVG = function () {
    IO.download(new Blob([IO.exportSVG({})], { type: 'image/svg+xml' }), IO.baseName() + '.svg');
    SV.toast(SV.t('vector.msg.exported_svg')); SlopSupport.afterExport('slopvector');
  };

  /* ================= raster export ================= */
  IO.rasterize = function (scale, bg) {
    var svg = IO.exportSVG({ noIds: true });
    var W = S.doc.width, H = S.doc.height;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = max(1, Math.round(W * scale)); c.height = max(1, Math.round(H * scale));
        var cx = c.getContext('2d');
        if (bg) { cx.fillStyle = bg; cx.fillRect(0, 0, c.width, c.height); }
        cx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c);
      };
      img.onerror = function () { reject(new Error('Could not render artwork')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  };
  IO.exportRaster = function (type, scale, transparent, quality) {
    return IO.rasterize(scale, (type === 'jpg' || !transparent) ? '#ffffff' : null).then(function (c) {
      return new Promise(function (res) {
        c.toBlob(function (blob) {
          IO.download(blob, IO.baseName() + (scale !== 1 ? '@' + scale + 'x' : '') + (type === 'jpg' ? '.jpg' : '.png'));
          SV.toast(SV.t('vector.msg.exported_raster', { type: type.toUpperCase(), w: String(c.width), h: String(c.height) })); SlopSupport.afterExport('slopvector');
          res(blob);
        }, type === 'jpg' ? 'image/jpeg' : 'image/png', quality || 0.92);
      });
    }).catch(function (e) { SV.toast(SV.t('vector.msg.export_failed', { error: e.message }), 'warn'); });
  };
})();
