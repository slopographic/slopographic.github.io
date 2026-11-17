/* Slop Press — UI kit: icons, unit-aware number fields, selects, colour chips with a swatch popover. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, h = U.h, S = PR.state;
  var K = PR.kit = {};

  var P = {
    select: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
    text: '<path d="M5 5h14M12 5v14M9 19h6"/>',
    frame: '<rect x="4" y="4" width="16" height="16"/><path d="M4 4l16 16M20 4L4 20"/>',
    rect: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8" ry="7"/>',
    line: '<path d="M5 19L19 5"/>',
    polygon: '<path d="M12 3l8 6-3 10H7L4 9z"/>',
    hand: '<path d="M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7s-5-2-7-5l-1.5-2.5a1.4 1.4 0 012.3-1.6L8 13"/>',
    zoom: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/>',
    left: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', center: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    right: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>', justify: '<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>',
    'justify-all': '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
    dup: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V5a1 1 0 011-1h11"/>',
    up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', chev: '<path d="M6 9l6 6 6-6"/>',
    prev: '<path d="M15 6l-6 6 6 6"/>', next: '<path d="M9 6l6 6-6 6"/>', first: '<path d="M17 6l-6 6 6 6M7 6v12"/>', last: '<path d="M7 6l6 6-6 6M17 6v12"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', page: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
    master: '<rect x="3" y="5" width="8" height="14"/><rect x="13" y="5" width="8" height="14"/>'
  };
  K.icon = function (name, cls) { return '<svg viewBox="0 0 24 24" class="ic ' + (cls || '') + '" aria-hidden="true">' + (P[name] || '') + '</svg>'; };
  K.iconEl = function (name) { var s = document.createElement('span'); s.innerHTML = K.icon(name); return s.firstChild; };

  /** Number field in the document unit (or a fixed unit: 'pt', '%', '°', 'raw'). get() → points, set(pts). */
  K.num = function (o) {
    var unit = o.unit || 'doc', inp = h('input', { class: 'num ' + (o.cls || ''), type: 'text', inputmode: 'decimal', title: o.title || '', 'aria-label': o.label || o.title || '' });
    function u() { return unit === 'doc' ? S.doc.unit : unit; }
    function show(v) {
      if (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) { inp.value = ''; inp.placeholder = o.placeholder || '–'; return; }
      if (typeof v === 'string') { inp.value = v; return; }
      inp.value = u() === 'raw' || u() === '%' || u() === '°' ? String(U.round(v, 2)) : U.fmt(v, u());
    }
    function parse() {
      var s = inp.value.trim(); if (!s) return null;
      if (o.allow && o.allow.indexOf(s.toLowerCase()) >= 0) return s.toLowerCase();
      if (u() === 'raw' || u() === '%' || u() === '°') { var n = parseFloat(s.replace(',', '.')); return isNaN(n) ? NaN : n; }
      return U.parse(s, u());
    }
    function commit() { var v = parse(); if (v === null || (typeof v === 'number' && isNaN(v))) { show(o.get ? o.get() : null); return; } if (typeof v === 'number' && o.min != null) v = Math.max(o.min, v); if (typeof v === 'number' && o.max != null) v = Math.min(o.max, v); o.set(v); show(o.get ? o.get() : v); }
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); inp.blur(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var cur = parse(); if (typeof cur !== 'number' || isNaN(cur)) cur = 0;
        var step = (o.step || (u() === 'raw' || u() === '%' || u() === '°' ? 1 : U.UNITS[u()] || 1)) * (e.shiftKey ? 10 : 1);
        var nv = cur + (e.key === 'ArrowUp' ? step : -step);
        if (o.min != null) nv = Math.max(o.min, nv);
        o.set(nv); show(o.get ? o.get() : nv);
      } else if (e.key === 'Escape') { show(o.get ? o.get() : null); inp.blur(); }
      e.stopPropagation();
    });
    inp.refresh = function () { if (document.activeElement !== inp) show(o.get ? o.get() : null); };
    inp.refresh && o.get && show(o.get());
    return inp;
  };
  K.field = function (label, input, title) { return h('label', { class: 'fld', title: title || '' }, h('span', { class: 'fl' }, label), input); };
  K.select = function (options, value, onChange, cls) {
    var s = h('select', { class: 'sel ' + (cls || '') });
    options.forEach(function (op) { var v = Array.isArray(op) ? op[0] : op, l = Array.isArray(op) ? op[1] : op; s.append(h('option', { value: v }, l)); });
    s.value = value;
    s.addEventListener('change', function () { onChange(s.value); });
    s.addEventListener('keydown', function (e) { e.stopPropagation(); });
    return s;
  };
  K.seg = function (items, value, onPick) {
    var w = h('div', { class: 'seg', role: 'group' });
    items.forEach(function (it) {
      var b = h('button', { type: 'button', class: 'segb' + (it[0] === value ? ' on' : ''), title: it[2] || it[1], 'aria-label': it[2] || it[1], html: it[3] ? K.icon(it[3]) : U.esc(it[1]) });
      b.addEventListener('click', function () { onPick(it[0]); });
      w.append(b);
    });
    return w;
  };

  /* ---------- colour ---------- */
  K.chip = function (color, title, onPick) {
    var b = h('button', { type: 'button', class: 'chip' + (color ? '' : ' none'), title: title || U.t('press.kit.colour'), 'aria-label': title || U.t('press.kit.colour') }, h('i', { style: { background: color ? U.css(color) : '' } }));
    b.addEventListener('click', function () { K.colorPopover(b, color, onPick); });
    return b;
  };
  K.colorPopover = function (anchor, color, onPick) {
    var r = anchor.getBoundingClientRect();
    var items = [{ label: U.t('ui.none'), check: !color, act: function () { onPick(null); } }, '-'];
    S.doc.swatches.forEach(function (sw) { items.push({ label: sw.name + (U.parseCMYK(sw.color) ? '  (CMYK)' : ''), check: sw.color === color, act: function () { onPick(sw.color); } }); });
    items.push('-', { label: U.t('press.kit.custom_colour'), act: function () { K.customColor(color, onPick); } });
    var m = window.SlopUI.menu(items, r.left, r.bottom + 2);
    // colour dots in front of swatch rows
    Array.prototype.slice.call(m.querySelectorAll('.sui-row')).forEach(function (row, i) {
      var sw = S.doc.swatches[i - 1]; if (!sw) return;
      var dot = h('span', { style: { display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', border: '1px solid rgba(128,128,128,.6)', background: U.css(sw.color), marginRight: '6px', verticalAlign: '-2px' } });
      var lbl = row.querySelector('.sui-lbl'); if (lbl) lbl.prepend(dot);
    });
  };
  K.customColor = function (color, onPick, title) {
    var cm = U.parseCMYK(color) || [0, 0, 0, 0];
    var hex = h('input', { class: 'sui-input', type: 'color', value: U.hex(color || '#000000') });
    var mode = window.SlopUI.select([['rgb', 'RGB'], ['cmyk', U.t('press.kit.mode_cmyk')]], U.parseCMYK(color) ? 'cmyk' : 'rgb');
    var ins = ['C', 'M', 'Y', 'K'].map(function (l, i) { return window.SlopUI.number(Math.round(cm[i] * 100), 0, 100, 1); });
    var body = h('div', { class: 'pr-form' }, window.SlopUI.field(U.t('press.kit.mode'), mode), window.SlopUI.field('RGB', hex), // i18n-ignore: a colour model name
      h('div', { class: 'pr-cols' }, ins.map(function (inp, i) { return window.SlopUI.field(U.t('press.kit.ink.' + ['c', 'm', 'y', 'k'][i]), inp, '%'); })));
    window.SlopUI.dialog({ title: title || U.t('press.kit.colour'), body: body, cls: 'sui-narrow', buttons: [{ label: U.t('menu.cancel') }, { label: U.t('menu.ok'), primary: true, act: function () {
      onPick(mode.value === 'cmyk' ? 'cmyk(' + ins.map(function (i) { return Math.max(0, Math.min(100, +i.value || 0)); }).join(',') + ')' : hex.value);
    } }] });
  };
})();
