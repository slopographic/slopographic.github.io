/* Slop PDF — the Edit page panel for what the select tool selected (tools/edit-panel.js asks it first): a block of the page's
   text (its font, size, colour and alignment, editable but the font, which stays the document's own), its position, width
   and rotation; a page picture or placed artwork (position, size, a turn); and, under an annotation's own properties, its
   position, size and rotation. Each field applies when it is changed (Enter or leaving it), one undo step each. Positions
   are points from the top-left of the page as shown; rotation is clockwise. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, h = U.h, K = SP.panels.helpers, t = U.t;
  var section = K.section, row = K.row, seg = K.seg, note = K.note, colorPicker = K.colorPicker;
  function Ed() { return SP.editor; }
  function S() { return SP.editor._; }
  var r1 = function (v) { return Math.round(v * 10) / 10; };

  /** A number field that applies on change (not on every key). */
  function field(label, value, min, max, onSet, unit) {
    var i = h('input', { class: 'inp num', type: 'number', value: r1(value), min: min, max: max, step: 0.5, inputmode: 'decimal', 'data-f': label }); // i18n-ignore
    i.addEventListener('change', function () { var v = parseFloat(i.value); if (!isNaN(v)) onSet(U.clamp(v, min, max)); });
    return row(label, i, unit || 'pt');
  }
  function grid(kids) { return h('div', { class: 'xf-grid' }, kids); }
  function geom(x, y, w, hh, ang, set) {
    return section(t('pdf.se.position'), [grid([
      field(t('pdf.se.x'), x, -14400, 14400, function (v) { set('x', v); }), field(t('pdf.se.y'), y, -14400, 14400, function (v) { set('y', v); }),
      field(t('pdf.se.w'), w, 1, 14400, function (v) { set('w', v); }), hh == null ? null : field(t('pdf.se.h'), hh, 1, 14400, function (v) { set('h', v); }),
      ang == null ? null : field(t('pdf.se.rotation'), ang, -360, 360, function (v) { set('rot', v); }, '°')])]);
  }
  function fontName(st) { return st.ps ? st.ps.replace(/^[A-Z]{6}\+/, '') : (st.sub && st.sub.font) || '?'; }

  /** The text block's sections. */
  function paraProps(box) {
    var P = S().para, sel = P.sel, a = P.base(sel);
    if (!a) { box.appendChild(section(t('pdf.se.text_block'), [note(t('pdf.se.setting_up'))])); return; }
    var st = a.styles[0] || {}, ch = function (fn, key) { P.change(fn, t(key)); };
    box.appendChild(section(t('pdf.se.text_block'), [
      row(t('pdf.tool.edit.font'), h('span', { class: 'pp-val xf-font' }, fontName(st), h('small', { class: 'xf-note' }, t(st.ps ? 'pdf.se.font_document' : 'pdf.se.font_substitute')))),
      field(t('pdf.tool.edit.size'), a.fs, 2, 400, function (v) { ch(function (m) { P.scale(m, v / m.fs); P.relayout(m); }, 'pdf.se.undo_text_size'); }),
      row(t('pdf.tool.edit.colour'), colorPicker(a.color, function (v) { ch(function (m) { m.color = v; }, 'pdf.se.undo_text_colour'); })),
      row(t('pdf.se.align'), seg([['left', t('pdf.ed.pm_align_left')], ['center', t('pdf.ed.pm_align_center')], ['right', t('pdf.ed.pm_align_right')], ['justify', t('pdf.ed.pm_align_justify')]], a.align,
        function (v) { ch(function (m) { m.align = v; P.relayout(m); }, 'pdf.se.undo_text_align'); }, t('pdf.se.align'))),
      h('div', { class: 'btn-row' }, K.btn(t('pdf.tool.edit.edit_text'), 'text', function () { P.edit(); }), K.btn(t('ui.delete'), 'trash', function () { P.remove(); }, 'danger-text'))]));
    box.appendChild(geom(a.cx - a.w / 2, a.cy - a.h / 2, a.w, null, X().norm(-(a.rot || 0)), function (k, v) {
      ch(function (m) {
        if (k === 'x') m.cx = v + m.w / 2; else if (k === 'y') m.cy = v + m.h / 2; else if (k === 'rot') m.rot = X().norm(-v);
        else if (k === 'w') { var left = m.cx - m.w / 2; m.w = Math.max(2 * m.fs, v); P.relayout(m); m.cx = left + m.w / 2; }
      }, k === 'rot' ? 'pdf.se.undo_turn_para' : k === 'w' ? 'pdf.ed.undo_resize_para' : 'pdf.ed.undo_move_para');
    }));
  }
  function X() { return window.SlopPdfXform; }
  /** A page picture's sections (obj-mode.js: one content rewrite per change). */
  function objProps(box, o) {
    var O = S().obj, p = Ed().page(), r = O.rect(p, o), Mv = window.SlopPdfMove;
    box.appendChild(section(t('pdf.ed.obj_selected', { what: O.label(o) }), [note(t('pdf.se.obj_help'))]));
    box.appendChild(geom(r.x, r.y, r.w, r.h, 0, function (k, v) {
      var T = k === 'x' ? Mv.move(v - r.x, 0) : k === 'y' ? Mv.move(0, v - r.y) : k === 'w' ? Mv.scaleAbout(v / r.w, v / r.w, r.x, r.y)
        : k === 'h' ? Mv.scaleAbout(v / r.h, v / r.h, r.x, r.y) : Mv.rotateAbout(v, r.x + r.w / 2, r.y + r.h / 2);
      O.apply(p, o, T, k === 'rot' ? 'Turn ' : k === 'x' || k === 'y' ? 'Move ' : 'Resize '); // i18n-ignore: O.apply's verbs
    }));
  }
  /** An annotation's position, size and rotation (view space). */
  function annotGeom(a) {
    var s = S(), c = s.ctx(), r = E.annotViewRect(a, c.R, c.W, c.H), box = E.isBox(a), b = box && s.annotBox ? s.annotBox(a) : null;
    return geom(r.x, r.y, box ? a.w : r.w, box ? a.h : r.h, box ? b.ang : null, function (k, v) {
      if (k === 'x') return Ed().nudgeSelected(v - r.x, 0);
      if (k === 'y') return Ed().nudgeSelected(0, v - r.y);
      if (k === 'rot') return Ed().turnSelected(v);
      var id = a.id;
      s.commitPage(t('pdf.ed.undo_resize_annot'), function (p) {
        p.annots.forEach(function (x) {
          if (x.id !== id) return;
          if (!box) { var q = E.annotViewRect(x, c.R, c.W, c.H); E.setAnnotViewRect(x, { x: q.x, y: q.y, w: k === 'w' ? v : q.w, h: k === 'h' ? v : q.h }, c.R, c.W, c.H); return; }
          if (x.type === 'text') { x.size = U.clamp(U.round(x.size * v / (k === 'w' ? x.w : x.h), 1), 4, 400); var tl = E.textLayout(x); x.w = tl.w; x.h = tl.h; return; }
          if (x.type === 'image') { var kk = v / (k === 'w' ? x.w : x.h); x.w *= kk; x.h *= kk; return; }
          x[k] = v;
        });
      });
    });
  }
  SP.selPanel = {
    /** What the panel shows now, so it is rebuilt when the selection changes. */
    key: function () {
      var s = S(), P = s.para, O = s.obj, o = O && O.live() && O.selected();
      if (P && P.sel) return 'para:' + (P.sel.id || P.sel.pid) + ':' + (P.base(P.sel) ? 1 : 0);
      return o ? 'obj:' + o.id : '';
    },
    /** Builds the props for a frame or a page object; false when an annotation (or nothing) is selected. */
    build: function (box, a) {
      var s = S(), O = s.obj, o = !a && O && O.live() && O.selected();
      if (!a && s.para && s.para.sel) { paraProps(box); return true; }
      if (o) { objProps(box, o); return true; }
      return false;
    },
    geometry: function (a) { return a && !a.locked && a.type !== 'note' ? annotGeom(a) : null; }
  };
})();
