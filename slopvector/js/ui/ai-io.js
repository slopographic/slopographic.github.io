/* SlopVector for the assistant: the helpers behind ui/ai-commands.js. SVG checking (the model's SVG may not hold scripts,
 * foreignObject, event handlers, javascript: or links other than #ids and data: pictures), object lookup, the bounding box
 * sentence with a warning when something runs past the artboard, export through the app's own writers (IO.exportSVG,
 * IO.rasterize, IO.buildPDF) to Slop Drive (shared/commands/sources.js) and/or a download, the state summary and the
 * checkpoint. Loaded on demand by SlopCmd.prepare() (ui/commands.js), before ai-commands.js. Exposes SV.ai. */
(function () {
  'use strict';
  var SV = window.SV, S = SV.state, IO = SV.io;
  var AI = SV.ai = {};

  /** Throws with a plain reason when the SVG text is not safe to import; returns the text. */
  AI.checkSvg = function (src) {
    var text = String(src || '').trim();
    if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) throw new Error('That is not an SVG: it must start with <svg');
    var doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.documentElement;
    if (doc.getElementsByTagName('parsererror').length || !root || root.localName !== 'svg') throw new Error('The SVG could not be read (check that every tag is closed)');
    function bad(why) { throw new Error('The SVG was refused: ' + why); }
    function okUrl(u) { var s = String(u).trim().replace(/^['"]|['"]$/g, ''); return !s || s[0] === '#' || /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(s); }
    [root].concat([].slice.call(root.querySelectorAll('*'))).forEach(function (el) {
      var n = el.localName.toLowerCase();
      if (/^(script|foreignobject|iframe|object|embed)$/.test(n)) bad('<' + el.localName + '> is not allowed');
      [].slice.call(el.attributes).forEach(function (at) {
        var an = at.name.toLowerCase(), v = at.value;
        if (an.indexOf('on') === 0) bad('the event handler ' + at.name + ' is not allowed');
        if ((an === 'href' || an === 'xlink:href' || an === 'src') && !okUrl(v)) bad('links to other files or sites are not allowed (only #ids and data: pictures)');
        if (/javascript:/i.test(v)) bad('javascript: is not allowed');
        (v.match(/url\(([^)]*)\)/gi) || []).forEach(function (m) { if (!okUrl(m.slice(4, -1))) bad('url(…) may only point inside the SVG'); });
      });
      if (n === 'style' && (/@import/i.test(el.textContent) || (el.textContent.match(/url\(([^)]*)\)/gi) || []).some(function (m) { return !okUrl(m.slice(4, -1)); }))) bad('styles may not load other files');
    });
    return text;
  };

  /** Top-level object by id or name (case-insensitive); the selection when q is empty. */
  AI.targets = function (q) {
    if (q == null || q === '') {
      if (!S.sel.length) throw new Error('Nothing is selected: give object (an id or name from app_state)');
      return S.sel.slice();
    }
    var hit = null, s = String(q).toLowerCase();
    SV.walk(function (o) { if (o.id === q || String(o.name || '').toLowerCase() === s) { hit = o; return false; } });
    if (!hit) throw new Error('No object “' + q + '”. app_state lists the objects.');
    return [hit.id];
  };
  /** " It covers W × H at X, Y." plus a warning when the box runs past the artboard. */
  AI.boxNote = function (what, b) {
    if (!b) return '';
    var W = S.doc.width, H = S.doc.height, r = function (v) { return Math.round(v); };
    var s = ' It covers ' + r(b.w) + ' × ' + r(b.h) + ' at ' + r(b.x) + ', ' + r(b.y) + '.';
    var cut = [];
    if (b.x < 0) cut.push(r(-b.x) + ' px on the left'); if (b.x + b.w > W) cut.push(r(b.x + b.w - W) + ' px on the right');
    if (b.y < 0) cut.push(r(-b.y) + ' px on the top'); if (b.y + b.h > H) cut.push(r(b.y + b.h - H) + ' px on the bottom');
    if (cut.length) s += ' Warning: ' + what + (b.w > W ? ' is ' + r(b.w) + ' px wide, wider than the ' + W + ' px artboard;' : ' runs past the artboard:') + ' ' + cut.join(', ') + ' is outside it. Use fit: true, a smaller size or another position.';
    return s;
  };
  /** Moves and scales (keeping its shape) an object so it lies inside the artboard. */
  AI.fit = function (o) {
    var b = SV.objBBox(o), G = window.SVGeom, W = S.doc.width, H = S.doc.height;
    if (!b) return;
    var k = Math.min(1, W / b.w, H / b.h);
    if (k < 1) { SV.transformObj(o, G.scale(k, k, b.x, b.y)); b = SV.objBBox(o); }
    var dx = Math.max(0, Math.min(W - b.w, b.x)) - b.x, dy = Math.max(0, Math.min(H - b.h, b.y)) - b.y;
    if (dx || dy) SV.transformObj(o, G.translate(dx, dy));
  };

  function sources() {
    if (window.SlopCmdSources) return Promise.resolve(window.SlopCmdSources);
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = new URL('../../../shared/commands/sources.js', AI.base).href;
      s.onload = function () { res(window.SlopCmdSources); }; s.onerror = function () { rej(new Error('Could not load sources.js')); };
      document.head.append(s);
    });
  }
  AI.base = (document.currentScript && document.currentScript.src) || location.href;
  /** The artwork as a file of that format, by the app's own writers. */
  AI.exportBlob = function (format, scale, background) {
    if (format === 'svg') return Promise.resolve(new Blob([IO.exportSVG({ metadata: true, background: background || null })], { type: 'image/svg+xml' }));
    if (format === 'pdf') return IO.buildPDF();
    return IO.rasterize(scale || 1, format === 'jpg' ? (background || '#ffffff') : background || null).then(function (c) {
      return new Promise(function (res) { c.toBlob(res, format === 'jpg' ? 'image/jpeg' : 'image/png', 0.92); });
    });
  };
  AI.export = function (a) {
    var name = (a.name || IO.baseName()) + '.' + a.format;
    return AI.exportBlob(a.format, a.scale, a.background).then(function (blob) {
      var out = [];
      var drive = a.to === 'download' ? Promise.resolve() : sources().then(function (src) { return src.put(blob, name, 'vector'); }).then(function (id) { out.push('Saved ' + name + ' to Slop Drive (id ' + id + ')'); });
      return drive.then(function () {
        if (a.to !== 'drive') { IO.download(blob, name); out.push('downloaded ' + name); }
        return out.join(' and ') + ' (' + Math.round(blob.size / 1024 * 10) / 10 + ' KB).';
      });
    });
  };

  AI.state = function () {
    var objs = [];
    S.doc.layers.forEach(function (L) {
      L.children.forEach(function (o) {
        if (objs.length >= 80) return;
        var b = SV.objBBox(o);
        objs.push({ id: o.id, name: o.name || '', type: o.type, layer: L.name, selected: S.sel.indexOf(o.id) >= 0, hidden: !!o.hidden,
          box: b ? [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)] : null,
          fill: o.style && typeof o.style.fill === 'string' ? o.style.fill : o.style && o.style.fill ? 'gradient' : null, stroke: o.style ? o.style.stroke : null, text: o.text ? String(o.text).slice(0, 80) : undefined });
      });
    });
    return { app: 'SlopVector', document: { name: S.doc.name, width: S.doc.width, height: S.doc.height }, layers: S.doc.layers.map(function (L) { return L.name; }),
      objects: objs, selection: S.sel.slice(), canUndo: S.hIdx > 0, fonts: Object.keys(SV.FONTS) };
  };
  /** "Undo all AI changes": back to the history step of the start, by the app's own undo. */
  AI.checkpoint = function () {
    var at = S.hIdx, snap = S.history[at];
    return function () {
      if (S.history[at] !== snap) return false;
      while (S.hIdx > at) SV.undo();
      return true;
    };
  };
})();
