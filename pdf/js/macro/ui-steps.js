/* Slop PDF macros — the step editor: one card per step, with the fields that each step type needs. Uses SlopUI. */
(function () {
  'use strict';
  var M = window.SlopPdfMacro = window.SlopPdfMacro || {};
  var UI = M.ui = M.ui || {};
  var S = function () { return window.SlopUI; };
  function tr(k, en, v) { return M.tr ? M.tr(k, en, v) : en; }
  function el(tag, attrs) {
    var kids = Array.prototype.slice.call(arguments, 2);
    return S().el.apply(null, [tag, attrs].concat(kids));
  }

  /** The input for one field. set(value) stores the raw value; M.normalizeStep checks it later. */
  UI.fieldInput = function (f, value, set) {
    var ui = S();
    switch (f.t) {
      case 'bool': {
        var c = ui.check(M.fieldLabel(f), value);
        c.input.addEventListener('change', function () { set(c.input.checked); });
        return c.el;
      }
      case 'select': {
        var sel = ui.select((f.opts || []).map(function (o) { return [String(o[0]), M.optLabel(o)]; }), String(value));
        sel.addEventListener('change', function () { set(sel.value); });
        return ui.field(M.fieldLabel(f), sel);
      }
      case 'num': {
        var n = ui.number(value, f.min, f.max, f.int ? 1 : 'any');
        n.addEventListener('input', function () { set(n.value); });
        return ui.field(M.fieldLabel(f), n);
      }
      case 'colour': {
        var col = el('input', { type: 'color', class: 'spm-colour', value: /^#[0-9a-f]{6}$/i.test(String(value)) ? value : '#000000', 'aria-label': M.fieldLabel(f) });
        col.addEventListener('input', function () { set(col.value); });
        return ui.field(M.fieldLabel(f), col);
      }
      case 'pages': {
        var pg = el('input', { class: 'sui-input', type: 'text', value: value || '', placeholder: 'all, 1-3, last', autocomplete: 'off', spellcheck: 'false' }); // i18n-ignore: page list syntax
        pg.addEventListener('input', function () { set(pg.value); });
        return ui.field(M.fieldLabel(f), pg);
      }
      case 'image': return UI.imageField(f, value, set);
      case 'layers': return UI.layersField(f, value, set);
    }
    var t = el('input', { class: 'sui-input', type: 'text', value: value == null ? '' : value, maxlength: f.max || null, autocomplete: 'off' });
    t.addEventListener('input', function () { set(t.value); });
    return ui.field(M.fieldLabel(f), t);
  };

  /** Picks a PNG or JPEG for a stamp. The image is kept as a data URL inside the macro. */
  UI.imageField = function (f, value, set) {
    var thumb = el('img', { class: 'spm-thumb', alt: '', src: value || '', hidden: !value });
    var file = el('input', { type: 'file', accept: 'image/png,image/jpeg', 'aria-label': M.fieldLabel(f) }); // intake-ok: a macro step's picture field (a value of the step, not a file into the app)
    var clear = el('button', { type: 'button', class: 'spm-btn', disabled: !value }, tr('ui.remove', 'Remove'));
    file.addEventListener('change', function () {
      var pick = file.files && file.files[0];
      if (!pick) return;
      if (!/^image\/(png|jpeg)$/.test(pick.type)) { S().toast(tr('pdf.macro.need_image', 'Choose a PNG or JPEG image.')); file.value = ''; return; }
      var rd = new FileReader();
      rd.onload = function () { set(String(rd.result)); thumb.src = String(rd.result); thumb.hidden = false; clear.disabled = false; };
      rd.readAsDataURL(pick);
    });
    clear.addEventListener('click', function () { set(''); thumb.removeAttribute('src'); thumb.hidden = true; file.value = ''; clear.disabled = true; });
    return el('div', { class: 'sui-field spm-wide' }, el('span', { class: 'sui-label' }, M.fieldLabel(f)), el('div', { class: 'spm-row' }, file, clear), thumb);
  };

  /** Watermark layers of a step, bottom first: each layer has a type (text or logo), its content, size, opacity,
   *  rotation, anchor and offset on the page, and the pages it covers. The list is replaced on every change. */
  var ANCHORS = [['tl', 'Top left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['ml', 'Middle left'], ['mc', 'Centre'], ['mr', 'Middle right'], ['bl', 'Bottom left'], ['bc', 'Bottom centre'], ['br', 'Bottom right']]; // i18n-ignore: English fallback of pdf.macro.anchor_<id>
  function anchors() { return ANCHORS.map(function (a) { return [a[0], tr('pdf.macro.anchor_' + a[0], a[1])]; }); }
  UI.layersField = function (f, value, set) {
    var ui = S();
    var list = (Array.isArray(value) ? value : []).map(function (x) { return Object.assign({}, x); });
    var box = el('div', { class: 'sui-field spm-wide spm-layers' });
    function changed() { set(list.map(function (x) { return Object.assign({}, x); })); }
    function structural() { changed(); draw(); }
    function field(label, node) { return el('label', { class: 'spm-lr' }, el('span', { class: 'sui-label' }, label), node); }
    function numIn(L, k, min, max, step) {
      var n = el('input', { class: 'sui-input', type: 'number', min: min, max: max, step: step || 1, value: L[k] });
      n.addEventListener('input', function () { var v = parseFloat(n.value); if (isFinite(v)) { L[k] = v; changed(); } });
      return n;
    }
    function textIn(L, k, ph) {
      var t = el('input', { class: 'sui-input', type: 'text', value: L[k] || '', placeholder: ph, autocomplete: 'off', spellcheck: 'false' });
      t.addEventListener('input', function () { L[k] = t.value; changed(); });
      return t;
    }
    function row(L, i) {
      var typeSel = ui.select([['text', tr('pdf.macro.field_text', 'Text')], ['image', tr('pdf.macro.logo', 'Logo')]], L.kind);
      typeSel.addEventListener('change', function () { L.kind = typeSel.value; structural(); });
      var body;
      if (L.kind === 'image') {
        var file = el('input', { type: 'file', accept: 'image/png,image/jpeg', 'aria-label': tr('pdf.macro.logo', 'Logo') }); // intake-ok: a macro step's logo field (a value of the step, not a file into the app)
        file.addEventListener('change', function () {
          var pick = file.files && file.files[0];
          if (!pick) return;
          if (!/^image\/(png|jpeg)$/.test(pick.type)) { ui.toast(tr('pdf.macro.need_image', 'Choose a PNG or JPEG image.')); file.value = ''; return; }
          var rd = new FileReader();
          rd.onload = function () { L.asset = String(rd.result); changed(); };
          rd.readAsDataURL(pick);
        });
        body = field(tr('pdf.macro.logo_file', 'Logo (PNG or JPEG)'), file);
      } else body = field(tr('pdf.macro.field_text', 'Text'), textIn(L, 'text', tr('pdf.macro.field_text', 'Text')));
      var anchor = ui.select(anchors(), L.anchor);
      anchor.addEventListener('change', function () { L.anchor = anchor.value; changed(); });
      var up = el('button', { type: 'button', class: 'spm-btn', 'aria-label': tr('pdf.macro.layer_up', 'Move layer up'), disabled: i >= list.length - 1, onclick: function () { var t = list[i]; list[i] = list[i + 1]; list[i + 1] = t; structural(); } }, '↑');
      var down = el('button', { type: 'button', class: 'spm-btn', 'aria-label': tr('pdf.macro.layer_down', 'Move layer down'), disabled: i <= 0, onclick: function () { var t = list[i]; list[i] = list[i - 1]; list[i - 1] = t; structural(); } }, '↓');
      var del = el('button', { type: 'button', class: 'spm-btn spm-danger', 'aria-label': tr('pdf.macro.layer_remove', 'Remove layer'), onclick: function () { list.splice(i, 1); structural(); } }, '✕');
      return el('div', { class: 'spm-layer' },
        el('div', { class: 'spm-step-head' }, el('span', { class: 'spm-step-no' }, tr('pdf.macro.layer_n', 'Layer {n}', { n: String(i + 1) })), typeSel, up, down, del),
        el('div', { class: 'spm-grid' }, body,
          field(L.kind === 'image' ? tr('pdf.macro.width_pt', 'Width (pt)') : tr('pdf.macro.field_size', 'Size (pt)'), numIn(L, 'size', 4, 1000)),
          field(tr('pdf.macro.field_opacity', 'Opacity (0 to 1)'), numIn(L, 'opacity', 0, 1, 'any')),
          field(tr('pdf.macro.rotation', 'Rotation (degrees)'), numIn(L, 'rot', -180, 180)),
          field(tr('pdf.macro.anchor', 'Anchor'), anchor),
          field(tr('pdf.macro.across', 'Across (pt)'), numIn(L, 'dx', -2000, 2000)),
          field(tr('pdf.macro.down', 'Down (pt)'), numIn(L, 'dy', -2000, 2000)),
          field(tr('pdf.macro.field_pages', 'Pages'), textIn(L, 'pages', 'all, 1-3, last')))); // i18n-ignore: page list syntax
    }
    function draw() {
      box.innerHTML = '';
      list.forEach(function (L, i) { box.appendChild(row(L, i)); });
      if (!list.length) box.appendChild(el('p', { class: 'sui-hint' }, tr('pdf.macro.no_layers', 'No layers. Add one, or the step does nothing.')));
      box.appendChild(el('button', { type: 'button', class: 'spm-btn', onclick: function () {
        list.push({ kind: 'text', text: 'DRAFT', font: 'Helvetica', size: 72, opacity: 0.2, rot: 45, anchor: 'mc', dx: 0, dy: 0, pages: '', colour: '#888888' }); // i18n-ignore: PDF names / font names / producer, not UI
        structural();
      } }, tr('pdf.macro.add_layer', '+ Add a layer')));
    }
    draw();
    return box;
  };

  /**
   * One step card. cb: { set(key, value), changeType(type), move(delta), remove() }.
   * n is the number of steps; i the 0-based index.
   */
  UI.stepCard = function (step, i, n, cb) {
    var def = M.STEP_TYPES[step.type] || { fields: [] };
    var typeSel = S().select(M.TYPE_ORDER.map(function (t) { return [t, M.typeLabel(t)]; }), step.type);
    typeSel.setAttribute('aria-label', tr('pdf.macro.step_type', 'Step type'));
    typeSel.addEventListener('change', function () { cb.changeType(typeSel.value); });
    var up = el('button', { type: 'button', class: 'spm-btn', 'aria-label': tr('pdf.macro.step_up', 'Move step up'), disabled: i === 0, onclick: function () { cb.move(-1); } }, '↑');
    var down = el('button', { type: 'button', class: 'spm-btn', 'aria-label': tr('pdf.macro.step_down', 'Move step down'), disabled: i >= n - 1, onclick: function () { cb.move(1); } }, '↓');
    var del = el('button', { type: 'button', class: 'spm-btn spm-danger', 'aria-label': tr('pdf.macro.step_remove', 'Remove step'), onclick: function () { cb.remove(); } }, '✕');
    var grid = el('div', { class: 'spm-grid' });
    def.fields.forEach(function (f) {
      if (f.legacy) return; // the flat fields of a watermark step are kept for old macros, not shown
      grid.append(UI.fieldInput(f, step[f.k], function (v) { cb.set(f.k, v); }));
    });
    return el('div', { class: 'spm-step', 'data-step': i },
      el('div', { class: 'spm-step-head' }, el('span', { class: 'spm-step-no' }, (i + 1) + '.'), typeSel, up, down, del),
      grid);
  };
})();
