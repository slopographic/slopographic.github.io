/* Slop PDF macros — the pure model: step types and their fields, normalising and validating steps and macros,
   and the saved list (localStorage 'slop.pdf.macros.v1', envelope {v:1, data}). No DOM beyond localStorage. */
(function () {
  'use strict';
  var M = window.SlopPdfMacro = window.SlopPdfMacro || {};
  var KEY = 'slop.pdf.macros.v1';
  // an option is [value, English label, key of its label]; the label is read when the editor renders (M.optLabel)
  var POSITIONS = [['bottom-center', 'Bottom centre', 'pdf.macro.pos_bc'], ['bottom-left', 'Bottom left', 'pdf.macro.pos_bl'], ['bottom-right', 'Bottom right', 'pdf.macro.pos_br'], // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
    ['top-center', 'Top centre', 'pdf.macro.pos_tc'], ['top-left', 'Top left', 'pdf.macro.pos_tl'], ['top-right', 'Top right', 'pdf.macro.pos_tr']]; // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
  var ALIGN = [['left', 'Left', 'pdf.macro.opt_left'], ['center', 'Centre', 'pdf.macro.opt_centre'], ['right', 'Right', 'pdf.macro.opt_right']]; // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
  /** The chosen language's text for a key (SlopI18n), else the English given: a string, or [one, other] for vars.n
   *  (node tests and pages without the tables). */
  function tr(k, en, v) {
    var I = window.SlopI18n;
    if (I && I.has && I.has(k)) return I.t(k, v);
    if (Array.isArray(en)) en = v && v.n === 1 ? en[0] : en[1];
    return String(en).replace(/\{(\w+)\}/g, function (m, n) { return v && n in v ? String(v[n]) : m; });
  }
  M.tr = tr;

  /** A field: k (key), t (type), lk (the key of its label: pdf.macro.field_<lk>), label (English). */
  function F(k, t, lk, label, o) { var f = { k: k, t: t, lk: 'pdf.macro.field_' + lk, label: label }; for (var x in o) f[x] = o[x]; return f; }

  /** Step types, in menu order. Each field: k (key), t (text|bool|num|select|colour|pages|image), label, def. The type
   *  ids are API (saved macros); the labels shown are M.typeLabel / M.fieldLabel / M.optLabel, in the chosen language. */
  M.STEP_TYPES = {
    replaceText: { label: 'Replace text', lk: 'replace_text', fields: [ // i18n-ignore: English fallback of M.typeLabel
      F('find', 'text', 'find', 'Find', { req: true, max: 500, def: '' }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('replace', 'text', 'replace', 'Replace with', { max: 500, def: '' }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('regex', 'bool', 'regex', 'Regular expression', { def: false }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('caseSensitive', 'bool', 'case', 'Match case', { def: false }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('cover', 'colour', 'cover', 'Cover colour', { def: '#ffffff' }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('pages', 'pages', 'pages', 'Pages', { def: '' })], // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      check: function (s) {
        if (!s.regex || !s.find) return null;
        try { new RegExp(s.find); return null; } catch (e) { return tr('pdf.macro.err_find_regex', 'Find is not a valid regular expression: {msg}', { msg: e.message }); }
      } },
    addHeaderFooter: { label: 'Header or footer', lk: 'header_footer', fields: [ // i18n-ignore: English fallback of M.typeLabel
      F('position', 'select', 'where', 'Where', { def: 'footer', opts: [['header', 'Header', 'pdf.macro.opt_header'], ['footer', 'Footer', 'pdf.macro.opt_footer']] }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('text', 'text', 'hf_text', 'Text (tokens: {page} {pages} {date} {filename})', { req: true, max: 300, def: 'Page {page} of {pages}' }), // i18n-ignore: the default is document content
      F('align', 'select', 'align', 'Align', { def: 'center', opts: ALIGN }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('size', 'num', 'size', 'Size (pt)', { def: 9, min: 4, max: 72 }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('colour', 'colour', 'colour', 'Colour', { def: '#555555' }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('pages', 'pages', 'pages', 'Pages', { def: '' })] }, // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
    addWatermark: { label: 'Watermark', lk: 'watermark', fields: [ // i18n-ignore: English fallback of M.typeLabel
      // the flat fields are the layer a step had before layers: still checked, used when there are no layers, not shown
      F('text', 'text', 'text', 'Text', { req: true, max: 200, def: 'DRAFT', legacy: true }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('opacity', 'num', 'opacity', 'Opacity (0 to 1)', { def: 0.2, min: 0.02, max: 1, legacy: true }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('angle', 'num', 'angle_deg', 'Angle (degrees)', { def: 45, min: -360, max: 360, legacy: true }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('size', 'num', 'size', 'Size (pt)', { def: 72, min: 8, max: 400, legacy: true }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('colour', 'colour', 'colour', 'Colour', { def: '#888888', legacy: true }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('pages', 'pages', 'pages', 'Pages', { def: '', legacy: true }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('layers', 'layers', 'layers', 'Layers, bottom first', { def: [] })] }, // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
    addPageNumbers: { label: 'Page numbers', lk: 'page_numbers', fields: [ // i18n-ignore: English fallback of M.typeLabel
      // the format labels are samples of what is stamped (core/text.js pageNumberText), so they stay as written
      F('format', 'select', 'format', 'Format', { def: 'n-of', opts: [['n', '1'], ['page', 'Page 1'], ['n-of', '1 / 5'], ['page-of', 'Page 1 of 5'], ['dash', '– 1 –']] }), // i18n-ignore
      F('position', 'select', 'position', 'Position', { def: 'bottom-center', opts: POSITIONS }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('start', 'num', 'start', 'First number', { def: 1, min: -9999, max: 9999, int: true }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('size', 'num', 'size', 'Size (pt)', { def: 10, min: 4, max: 72 }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('colour', 'colour', 'colour', 'Colour', { def: '#000000' }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('pages', 'pages', 'pages', 'Pages', { def: '' })] }, // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
    rotate: { label: 'Rotate', lk: 'rotate', fields: [ // i18n-ignore: English fallback of M.typeLabel
      F('angle', 'select', 'angle', 'Angle', { def: 90, opts: [[90, '90° clockwise', 'pdf.macro.opt_cw'], [180, '180°'], [270, '90° anticlockwise', 'pdf.macro.opt_ccw']] }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('pages', 'pages', 'pages', 'Pages', { def: '' })] }, // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
    deletePages: { label: 'Delete pages', lk: 'delete_pages', fields: [F('pages', 'pages', 'pages', 'Pages', { req: true, def: '' })] }, // i18n-ignore: English fallback of M.typeLabel
    extractPages: { label: 'Keep only these pages', lk: 'keep_pages', fields: [F('pages', 'pages', 'pages', 'Pages', { req: true, def: '' })] }, // i18n-ignore: English fallback of M.typeLabel
    stamp: { label: 'Stamp', lk: 'stamp', fields: [ // i18n-ignore: English fallback of M.typeLabel
      F('imageDataUrl', 'image', 'image', 'Image (PNG or JPEG)', { def: '' }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('text', 'text', 'stamp_text', 'Text, used when there is no image', { max: 200, def: '' }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('x', 'num', 'x', 'Left (% of page width)', { def: 70, min: 0, max: 100 }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('y', 'num', 'y', 'Top (% of page height)', { def: 85, min: 0, max: 100 }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('width', 'num', 'width', 'Image width (% of page width)', { def: 20, min: 1, max: 100 }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('colour', 'colour', 'text_colour', 'Text colour', { def: '#000000' }), // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      F('pages', 'pages', 'pages', 'Pages', { def: '' })], // i18n-ignore: English fallback, shown through M.fieldLabel / M.optLabel
      check: function (s) { return s.imageDataUrl || s.text ? null : tr('pdf.macro.err_stamp_empty', 'A stamp needs an image or some text.'); } }
  };
  /** The label of a step type, a field and a select option, in the chosen language. */
  M.typeLabel = function (type) { var d = M.STEP_TYPES[type]; return d ? tr('pdf.macro.type_' + d.lk, d.label) : tr('pdf.macro.unknown_step', 'Unknown step'); };
  M.fieldLabel = function (f) { return f.lk ? tr(f.lk, f.label) : f.label; };
  M.optLabel = function (o) { return o[2] ? tr(o[2], o[1]) : o[1]; };
  /** A page-number position's label ('bottom-center' -> "Bottom centre", in the chosen language); an unknown id as is. */
  M.posLabel = function (v) { var o = POSITIONS.find(function (p) { return p[0] === v; }); return o ? M.optLabel(o) : String(v); };
  M.TYPE_ORDER = ['replaceText', 'addHeaderFooter', 'addWatermark', 'addPageNumbers', 'rotate', 'deletePages', 'extractPages', 'stamp'];
  var IMG = /^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i;

  /** One watermark layer (core/watermark.js) checked for the macro: text needs text, a logo needs a PNG or JPEG. */
  function layerOf(raw) {
    var WM = window.SlopPdfWm, L = WM.normalize(raw || {});
    if (L.kind === 'text' && !L.text.trim()) return { err: 'pdf.macro.err_layer_text', en: '{field} layer {n} needs text.' };
    if (L.kind === 'image' && !IMG.test(L.asset)) return { err: 'pdf.macro.err_layer_logo', en: '{field} layer {n} needs a PNG or JPEG logo.' };
    try { WM.parsePages(L.pages, Infinity); } catch (e) { return { err: 'pdf.macro.err_layer_pages', en: '{field} layer {n} has a page range that cannot be read: {err}', msg: e.message }; }
    return { v: L };
  }
  /** The layers a watermark step draws: its layers, or the one layer its flat fields describe. */
  M.layersOf = function (s) {
    var WM = window.SlopPdfWm;
    if (Array.isArray(s.layers) && s.layers.length) return s.layers.map(function (x) { return WM.normalize(x); });
    return [WM.normalize({ kind: 'text', text: s.text, size: s.size, opacity: s.opacity, rot: s.angle, colour: s.colour, pages: s.pages })];
  };

  /** A field's problem as a sentence that names the field. */
  function bad(f, key, en, v) { return { err: tr(key, en, Object.assign({ field: M.fieldLabel(f) }, v || {})) }; }
  function coerce(f, v) {
    switch (f.t) {
      case 'text': {
        var s = String(v);
        if (f.req && !s.trim()) return bad(f, 'pdf.macro.err_required', '{field} is required.');
        if (f.max && s.length > f.max) return bad(f, 'pdf.macro.err_too_long', '{field} is longer than {max} characters.', { max: String(f.max) });
        return { v: s };
      }
      case 'bool': return { v: !!v };
      case 'num': {
        var n = typeof v === 'number' ? v : (String(v).trim() === '' ? NaN : Number(v));
        if (!isFinite(n)) return bad(f, 'pdf.macro.err_number', '{field} must be a number.');
        if (f.int) n = Math.round(n);
        if (f.min != null && n < f.min) return bad(f, 'pdf.macro.err_min', '{field} must be at least {min}.', { min: String(f.min) });
        if (f.max != null && n > f.max) return bad(f, 'pdf.macro.err_max', '{field} must be at most {max}.', { max: String(f.max) });
        return { v: n };
      }
      case 'select': {
        var hit = (f.opts || []).find(function (o) { return String(o[0]) === String(v); });
        return hit ? { v: hit[0] } : bad(f, 'pdf.macro.err_choice', '{field} has a choice that is not offered.');
      }
      case 'colour': {
        var c = String(v).trim().toLowerCase();
        return /^#[0-9a-f]{6}$/.test(c) ? { v: c } : bad(f, 'pdf.macro.err_colour', '{field} must be a colour such as #ff0000.');
      }
      case 'pages': {
        var p = String(v == null ? '' : v);
        try { M.parsePages(p, Infinity); return { v: p.trim() }; } catch (e) { return bad(f, 'pdf.macro.err_field', '{field} {err}', { err: e.message }); }
      }
      case 'layers': {
        var arr = Array.isArray(v) ? v : [], outL = [];
        for (var li = 0; li < arr.length; li++) {
          var lr = layerOf(arr[li]);
          if (lr.err) return bad(f, lr.err, lr.en, { n: String(li + 1), err: lr.msg || '' });
          outL.push(lr.v);
        }
        return { v: outL };
      }
      case 'image': {
        var u = String(v || '');
        if (!u) return { v: '' };
        return IMG.test(u) ? { v: u } : bad(f, 'pdf.macro.err_image', '{field} must be a PNG or JPEG image.');
      }
    }
    return { v: v };
  }

  /** Canonical step from raw input. Returns { step, errors }. step is null only for an unknown type. */
  M.normalizeStep = function (raw) {
    var def = raw && M.STEP_TYPES[raw.type];
    if (!def) return { step: null, errors: [tr('pdf.macro.err_unknown_type', 'This step type is not known.')] };
    var out = { type: raw.type }, errors = [];
    def.fields.forEach(function (f) {
      var v = raw[f.k];
      if (v === undefined || v === null) v = f.def;
      var r = coerce(f, v);
      if (r.err) { errors.push(tr('pdf.macro.err_step', '{step}: {msg}', { step: M.typeLabel(raw.type), msg: r.err })); out[f.k] = v; }
      else out[f.k] = r.v;
    });
    if (raw.type === 'addWatermark') {
      if (Array.isArray(raw.layers) && !raw.layers.length) errors.push(tr('pdf.macro.err_wm_no_layers', 'Watermark: add at least one layer.'));
      out.layers = M.layersOf(out); // a step without layers draws the one layer its flat fields describe
    }
    if (def.check && !errors.length) { var ce = def.check(out); if (ce) errors.push(tr('pdf.macro.err_step', '{step}: {msg}', { step: M.typeLabel(raw.type), msg: ce })); }
    return { step: out, errors: errors };
  };
  M.newStep = function (type) { return M.normalizeStep({ type: type }).step; };
  M.newMacro = function (name) {
    return { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: name || tr('pdf.macro.new_name', 'New macro'), pattern: '', auto: 'off', steps: [] };
  };
  /** Short description of a step for lists and logs. */
  M.stepLabel = function (s) {
    var q = function (t) { return '“' + String(t || '').slice(0, 30) + '”'; };
    switch (s.type) {
      case 'replaceText': return tr('pdf.macro.label_replace', 'Replace {find} with {replace}', { find: q(s.find), replace: q(s.replace) });
      case 'addHeaderFooter': return s.position === 'header' ? tr('pdf.macro.label_header', 'Header {text}', { text: q(s.text) }) : tr('pdf.macro.label_footer', 'Footer {text}', { text: q(s.text) });
      case 'addWatermark': {
        var all = M.layersOf(s), L0 = all[0], what = L0.kind === 'image' ? tr('pdf.macro.label_logo', 'logo') : q(L0.text);
        return all.length > 1 ? tr('pdf.macro.label_wm_more', 'Watermark {what} + {n} more', { what: what, n: String(all.length - 1) }) : tr('pdf.macro.label_wm', 'Watermark {what}', { what: what });
      }
      case 'addPageNumbers': return tr('pdf.macro.label_numbers', 'Page numbers, {position}', { position: M.posLabel(s.position) });
      case 'rotate': return s.pages ? tr('pdf.macro.label_rotate_pages', 'Rotate {angle}° ({pages})', { angle: String(s.angle), pages: s.pages }) : tr('pdf.macro.label_rotate', 'Rotate {angle}°', { angle: String(s.angle) });
      case 'deletePages': return tr('pdf.macro.label_delete', 'Delete pages {pages}', { pages: s.pages || 'all' });
      case 'extractPages': return tr('pdf.macro.label_keep', 'Keep pages {pages}', { pages: s.pages || 'all' });
      case 'stamp': return tr('pdf.macro.label_stamp', 'Stamp {what}', { what: s.imageDataUrl ? tr('pdf.macro.label_image', 'image') : q(s.text) });
    }
    return M.typeLabel(s.type);
  };

  /** Problems that would stop a macro from running. Empty array when it is ready. */
  M.validateMacro = function (m) {
    var errs = [];
    if (!m || typeof m !== 'object') return [tr('pdf.macro.err_no_macro', 'There is no macro to run.')];
    if (!Array.isArray(m.steps) || !m.steps.length) errs.push(tr('pdf.macro.err_no_steps', 'The macro has no steps yet. Add a step first.'));
    (m.steps || []).forEach(function (s, i) {
      M.normalizeStep(s).errors.forEach(function (e) { errs.push(tr('pdf.macro.err_step_n', 'Step {n}, {msg}', { n: String(i + 1), msg: e })); });
    });
    if (m.pattern) { try { M.compilePattern(m.pattern); } catch (e) { errs.push(tr('pdf.macro.err_pattern', 'The file name pattern is not a valid regular expression.')); } }
    if ((m.auto === 'ask' || m.auto === 'silent') && !String(m.pattern || '').trim()) errs.push(tr('pdf.macro.err_auto_pattern', 'Set a file name pattern to run this macro on dropped files.'));
    return errs;
  };

  /** Canonical macro for storage (steps normalised, unknown fields dropped). Null when the shape is wrong. */
  M.sanitizeMacro = function (m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !Array.isArray(m.steps)) return null;
    return {
      id: m.id, name: String(m.name || tr('pdf.macro.untitled', 'Untitled macro')), pattern: String(m.pattern || ''),
      auto: m.auto === 'ask' || m.auto === 'silent' ? m.auto : 'off',
      steps: m.steps.map(function (s) { return M.normalizeStep(s).step; }).filter(Boolean)
    };
  };

  /* ----------------------------------------------------------- storage */
  var store, mem = [];
  function localStore() {
    if (store === undefined) { try { store = window.localStorage || null; } catch (e) { store = null; } }
    return store;
  }
  /** Replaces the storage used (tests pass a fake, or null for memory only). */
  M.setStorage = function (s) { store = s; mem = []; };
  function fromMemory() { return mem.map(function (m) { return M.sanitizeMacro(m); }).filter(Boolean); }
  /** The saved macros. Storage that is missing, blocked or unreadable gives the memory copy (empty at first). */
  M.load = function () {
    try {
      var s = localStore();
      if (!s) return fromMemory();
      var raw = s.getItem(KEY);
      if (raw == null) return [];
      var env = JSON.parse(raw);
      if (!env || env.v !== 1 || !Array.isArray(env.data)) return [];
      return env.data.map(M.sanitizeMacro).filter(Boolean);
    } catch (e) { return fromMemory(); }
  };
  /** Saves the whole list. Returns false when the browser would not keep it (the memory copy still holds it). */
  M.save = function (list) {
    var clean = (list || []).map(M.sanitizeMacro).filter(Boolean);
    mem = JSON.parse(JSON.stringify(clean));
    try {
      var s = localStore();
      if (!s) return false;
      s.setItem(KEY, JSON.stringify({ v: 1, data: clean }));
      return true;
    } catch (e) { return false; }
  };
})();
