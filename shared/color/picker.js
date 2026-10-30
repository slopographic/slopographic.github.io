/* Shared colour picker body (PhotoSlop's dialog and side panel, SlopVector's popover).
 * Saturation-brightness square, hue and alpha bars, preview, hex / RGB / HSB / alpha fields, a recent-colours row
 * and an optional palette row. Exposed as window.SlopColorPicker.
 *   SlopColorPicker.create({ value, onChange(hex), recents: { list(), add(hex) }, palette: [], alpha: true })
 *     -> { el, get(), set(hex), commit() }
 * A person's change calls onChange at once (live). set(hex) updates the controls without calling onChange.
 * commit() records the current colour in the recents list; the host calls it when the colour is accepted. */
(function () {
  'use strict';
  var M = window.SlopColor;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  function E(tag, cls, kids) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    (kids || []).forEach(function (k) { if (k != null) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }
  /** Puts a word (ui.color.*) on an element, as its text or as attr, and marks it so a language switch redraws it
   *  (data-i18n, data-i18n-attr, data-i18n-vars: SlopI18n.apply). */
  function word(el, key, attr, vars) {
    var I = window.SlopI18n, v = I ? I.t(key, vars) : key;
    if (vars) el.setAttribute('data-i18n-vars', JSON.stringify(vars));
    if (attr) { el.setAttribute(attr, v); el.setAttribute('data-i18n-attr', attr + ':' + key); } else { el.textContent = v; el.setAttribute('data-i18n', key); }
    return el;
  }
  function input(key, max, wide) {
    var i = document.createElement('input');
    i.type = 'number'; i.min = 0; i.max = max; i.step = 1; i.className = 'scp-n' + (wide ? ' scp-w' : '');
    return word(i, key, 'aria-label');
  }
  /** A field: its short label is a key (ui.color.*) or a symbol shown as it is (#, R, G, B, A %). */
  function field(label, inp) { var l = E('span', 'scp-fl', /^ui\./.test(label) ? [] : [label]); if (/^ui\./.test(label)) word(l, label); return E('label', 'scp-f', [l, inp]); }
  /** Pointer drag: fn(event) runs on the press and on every move until release.
   *  touch-ok: the field and the bars have touch-action: none (picker.css .scp-sv, .scp-bar), so a finger drags them. */
  function drag(el, fn) {
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      fn(e);
      var mv = function (ev) { fn(ev); };
      var up = function () { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  }
  function put(inp, v) { if (document.activeElement !== inp) inp.value = v; }

  function create(opts) {
    opts = opts || {};
    var alphaOn = opts.alpha !== false, onChange = opts.onChange, recents = opts.recents;
    var H = 0, S = 0, B = 0, A = 1;

    var sv = E('div', 'scp-sv'), svDot = E('div', 'scp-dot'); sv.appendChild(svDot);
    var hue = E('div', 'scp-bar scp-hue'), hueDot = E('div', 'scp-bdot'); hue.appendChild(hueDot);
    var alpha = E('div', 'scp-bar scp-alpha scp-checker'), alphaFill = E('div', 'scp-alpha-fill'), alphaDot = E('div', 'scp-bdot');
    alpha.appendChild(alphaFill); alpha.appendChild(alphaDot);
    var prev = E('div', 'scp-prev scp-checker'), prevFill = E('div', 'scp-prev-fill'); prev.appendChild(prevFill);
    var hexIn = document.createElement('input');
    hexIn.type = 'text'; hexIn.maxLength = 7; hexIn.spellcheck = false; hexIn.className = 'scp-hex'; word(hexIn, 'ui.color.hex', 'aria-label');
    var rIn = input('ui.color.red', 255), gIn = input('ui.color.green', 255), bIn = input('ui.color.blue', 255);
    var hIn = input('ui.color.hue', 360), sIn = input('ui.color.saturation', 100), vIn = input('ui.color.brightness', 100), aIn = input('ui.color.alpha', 100);

    var top = E('div', 'scp-top', [prev, field('#', hexIn)]);
    var rgbRow = E('div', 'scp-row', [field('R', rIn), field('G', gIn), field('B', bIn)]);
    var hsbRow = E('div', 'scp-row', [field('ui.color.h', hIn), field('ui.color.s', sIn), field('ui.color.bri', vIn)]);
    var recentRow = E('div', 'scp-swatches'), paletteRow = E('div', 'scp-swatches');
    var sections = [E('div', 'scp-sec', [word(E('span', 'scp-fl'), 'ui.color.recent'), recentRow])];
    if (opts.palette && opts.palette.length) sections.push(E('div', 'scp-sec', [paletteRow]));
    var bars = [sv, E('div', 'scp-bars', alphaOn ? [hue, alpha] : [hue])];
    var rows = [top, E('div', 'scp-grid', [rgbRow, hsbRow].concat(alphaOn ? [E('div', 'scp-row', [field('A %', aIn)])] : []))];
    var el = E('div', 'scp', bars.concat(rows, sections));
    el.setAttribute('role', 'group');

    function cur() {
      var rgb = M.hsbToRgb(H, S, B);
      return M.toHex(rgb[0], rgb[1], rgb[2], alphaOn ? A : 1);
    }
    function fromRGB(r, g, b) {
      var hsb = M.rgbToHsb(r, g, b);
      if (hsb[1] > 0) H = hsb[0];
      S = hsb[1]; B = hsb[2];
    }
    function render() {
      var rgb = M.hsbToRgb(H, S, B), hex = M.toHex(rgb[0], rgb[1], rgb[2], 1);
      sv.style.background = 'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(' + Math.round(H) + ',100%,50%))';
      svDot.style.left = (S * 100) + '%'; svDot.style.top = ((1 - B) * 100) + '%';
      hueDot.style.left = (H / 360 * 100) + '%';
      alphaFill.style.background = 'linear-gradient(to right, rgba(' + Math.round(rgb[0]) + ',' + Math.round(rgb[1]) + ',' + Math.round(rgb[2]) + ',0), ' + hex + ')';
      alphaDot.style.left = (A * 100) + '%';
      prevFill.style.background = cur();
      put(hexIn, hex.slice(1).toUpperCase());
      put(rIn, Math.round(rgb[0])); put(gIn, Math.round(rgb[1])); put(bIn, Math.round(rgb[2]));
      put(hIn, Math.round(H)); put(sIn, Math.round(S * 100)); put(vIn, Math.round(B * 100));
      put(aIn, Math.round(A * 100));
    }
    function change() { render(); if (onChange) onChange(cur()); }
    function set(hex) {
      var c = M.parse(hex);
      fromRGB(c.r, c.g, c.b);
      A = alphaOn ? c.a : 1;
      render();
    }
    function swatchBtn(c, cls, key) {
      var b = E('button', 'scp-sw scp-checker' + (cls ? ' ' + cls : ''));
      b.type = 'button'; b.title = c; word(b, key, 'aria-label', { color: c });
      b.appendChild(E('span', 'scp-sw-fill')); b.firstChild.style.background = c;
      b.addEventListener('click', function () { set(c); change(); });
      return b;
    }
    function renderRecent() {
      recentRow.textContent = '';
      var list = recents && recents.list ? recents.list() : [];
      list.slice(0, 12).forEach(function (c) { recentRow.appendChild(swatchBtn(c, 'scp-recent', 'ui.color.recent_sw')); });
      if (!list.length) recentRow.appendChild(word(E('span', 'scp-none'), 'ui.color.none_yet'));
    }
    (opts.palette || []).forEach(function (c) { paletteRow.appendChild(swatchBtn(c, '', 'ui.color.palette_sw')); });

    drag(sv, function (e) {
      var r = sv.getBoundingClientRect(); if (!r.width || !r.height) return;
      S = clamp((e.clientX - r.left) / r.width, 0, 1); B = 1 - clamp((e.clientY - r.top) / r.height, 0, 1); change();
    });
    drag(hue, function (e) {
      var r = hue.getBoundingClientRect(); if (!r.width) return;
      H = clamp((e.clientX - r.left) / r.width, 0, 0.9999) * 360; change();
    });
    if (alphaOn) drag(alpha, function (e) {
      var r = alpha.getBoundingClientRect(); if (!r.width) return;
      A = clamp((e.clientX - r.left) / r.width, 0, 1); change();
    });
    hexIn.addEventListener('input', function () {
      var v = hexIn.value.replace(/[^0-9a-f]/gi, '');
      if (v.length === 3 || v.length === 6) { var c = M.parse('#' + v); fromRGB(c.r, c.g, c.b); change(); }
    });
    [rIn, gIn, bIn].forEach(function (i) {
      i.addEventListener('input', function () { fromRGB(clamp(+rIn.value || 0, 0, 255), clamp(+gIn.value || 0, 0, 255), clamp(+bIn.value || 0, 0, 255)); change(); });
    });
    [hIn, sIn, vIn].forEach(function (i, k) {
      i.addEventListener('input', function () {
        var v = +i.value || 0;
        if (k === 0) H = clamp(v, 0, 359.99); else if (k === 1) S = clamp(v, 0, 100) / 100; else B = clamp(v, 0, 100) / 100;
        change();
      });
    });
    if (alphaOn) aIn.addEventListener('input', function () { A = clamp(+aIn.value || 0, 0, 100) / 100; change(); });

    set(opts.value || '#000000');
    renderRecent();
    return {
      el: el,
      get: cur,
      set: function (hex) { set(hex); render(); },
      commit: function () {
        var c = cur();
        if (recents && recents.add) { recents.add(c); renderRecent(); }
        return c;
      },
    };
  }

  window.SlopColorPicker = { create: create };
})();
