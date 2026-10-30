/* SlopVector — io: SVG import helpers (colours, transforms, CSS) */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state;
  var fmt = G.fmt, esc = SV.esc, clone = SV.clone;
  var abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;
  var IO = SV.io = SV.io || {};
  var $ = SV._io = SV._io || {};

  /* ================= SVG import ================= */
  var colorCtx = null, colorCache = {};
  function parseColor(str) {
    if (str == null) return null;
    str = String(str).trim();
    if (!str || str === 'none' || str === 'transparent') return null;
    if (colorCache[str]) return colorCache[str];
    if (!colorCtx) colorCtx = document.createElement('canvas').getContext('2d');
    colorCtx.fillStyle = '#000'; colorCtx.fillStyle = str;
    var v = colorCtx.fillStyle, res;
    if (v[0] === '#') res = { c: v.toLowerCase(), a: 1 };
    else {
      var m = /rgba?\(([^)]+)\)/.exec(v);
      if (m) { var p = m[1].split(',').map(parseFloat); res = { c: '#' + p.slice(0, 3).map(function (n) { return ('0' + Math.round(n).toString(16)).slice(-2); }).join(''), a: p[3] == null ? 1 : p[3] }; }
      else res = { c: '#000000', a: 1 };
    }
    colorCache[str] = res; return res;
  }
  IO.parseColor = parseColor;
  function parseTransform(str) {
    var m = G.I(); if (!str) return m;
    var re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g, r;
    while ((r = re.exec(str))) {
      var a = r[2].trim().split(/[\s,]+/).map(parseFloat), t;
      switch (r[1]) {
        case 'matrix': t = a.length >= 6 ? a.slice(0, 6) : G.I(); break;
        case 'translate': t = G.translate(a[0] || 0, a[1] || 0); break;
        case 'scale': t = G.scale(a[0], a.length > 1 ? a[1] : a[0]); break;
        case 'rotate': t = G.rotate((a[0] || 0) * Math.PI / 180, a[1] || 0, a[2] || 0); break;
        case 'skewX': t = [1, 0, Math.tan((a[0] || 0) * Math.PI / 180), 1, 0, 0]; break;
        case 'skewY': t = [1, Math.tan((a[0] || 0) * Math.PI / 180), 0, 1, 0, 0]; break;
      }
      m = G.mul(m, t);
    }
    return m;
  }
  IO.parseTransform = parseTransform;
  function num(v, d) { if (v == null || v === '') return d || 0; var f = parseFloat(v); if (isNaN(f)) return d || 0; if (/pt$/.test(v)) f *= 4 / 3; else if (/mm$/.test(v)) f *= 96 / 25.4; else if (/cm$/.test(v)) f *= 96 / 2.54; else if (/in$/.test(v)) f *= 96; return f; }
  function frac(v, d) { if (v == null || v === '') return d; var s = String(v).trim(); return /%$/.test(s) ? parseFloat(s) / 100 : parseFloat(s); }
  var INHERIT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'fill-rule', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'letter-spacing', 'fill-opacity', 'stroke-opacity', 'visibility', 'color'];
  var OWN = ['opacity', 'display', 'mix-blend-mode', 'transform'];
  function parseCSS(text) {
    var rules = [];
    text = text.replace(/\/\*[\s\S]*?\*\//g, '');
    var re = /([^{}]+)\{([^}]*)\}/g, r;
    while ((r = re.exec(text))) {
      var decls = {};
      r[2].split(';').forEach(function (d) { var i = d.indexOf(':'); if (i > 0) decls[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim().replace(/\s*!important$/, ''); });
      r[1].split(',').forEach(function (sel) { sel = sel.trim(); if (sel && !/^@/.test(sel)) rules.push({ sel: sel, decls: decls }); });
    }
    return rules;
  }
  function ruleMatches(sel, el) {
    if (/[\s>+~\[:]/.test(sel)) return false; // simple selectors only
    var m = /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(sel); if (!m) return false;
    if (m[1] && el.localName !== m[1]) return false;
    var parts = (m[2] || '').match(/[.#][\w-]+/g) || [];
    var cls = (el.getAttribute('class') || '').split(/\s+/);
    return parts.every(function (p) { return p[0] === '.' ? cls.indexOf(p.slice(1)) >= 0 : el.getAttribute('id') === p.slice(1); });
  }
  function specificity(sel) { return (sel.match(/#/g) || []).length * 100 + (sel.match(/\./g) || []).length * 10 + (/^[a-zA-Z]/.test(sel) ? 1 : 0); }
  function ownProps(el, rules) {
    var p = {};
    INHERIT.concat(OWN).forEach(function (k) { var v = el.getAttribute(k); if (v != null) p[k] = v; });
    rules.filter(function (r) { return ruleMatches(r.sel, el); }).sort(function (a, b) { return specificity(a.sel) - specificity(b.sel); }).forEach(function (r) { Object.keys(r.decls).forEach(function (k) { p[k] = r.decls[k]; }); });
    var st = el.getAttribute('style');
    if (st) st.split(';').forEach(function (d) { var i = d.indexOf(':'); if (i > 0) p[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim().replace(/\s*!important$/, ''); });
    return p;
  }

  $.INHERIT = INHERIT; $.frac = frac; $.num = num; $.ownProps = ownProps; $.parseCSS = parseCSS; $.parseColor = parseColor; $.parseTransform = parseTransform;
})();
