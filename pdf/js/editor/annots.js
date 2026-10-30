/* Slop PDF — annotation commands: add, delete, duplicate, copy/paste, nudge, property changes,
   tool switching and placing images / signatures. */
(function () {
  'use strict';
  /** The kind of an annotation in words ('rectangle'), or its id when the tables have no word for it. */
  function kindWord(type) { var I = window.SlopI18n, k = 'pdf.ed.an_' + type; return I && I.has && I.has(k) ? I.t(k) : type; }
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._;
  /* -------------------------------------------------------------- commits */
  S.commitPage = function (label, fn, coalesce) {
    var pid = Ed.pid;
    return E.commit(label, function (st) { var p = st.pages.filter(function (x) { return x.id === pid; })[0]; if (p) return fn(p); }, coalesce);
  }
  Ed.addAnnot = function (a, label) {
    a.id = a.id || U.uid('a');
    S.commitPage(label || U.t('pdf.ed.undo_add_type', { type: kindWord(a.type) }), function (p) { p.annots.push(a); });
    Ed.selId = a.id; Ed.paint();
    if (SP.app) SP.app.editorSelectionChanged();
    return a;
  };
  Ed.deleteSelected = function () {
    var id = Ed.selId, a = Ed.getSelected(); if (!id || (a && SP.layers.isLocked(a))) return;
    S.commitPage(U.t('pdf.ed.undo_delete_annot'), function (p) { p.annots = p.annots.filter(function (a) { return a.id !== id; }); });
    Ed.select(null);
  };
  Ed.duplicateSelected = function () {
    var a = Ed.getSelected(); if (!a) return;
    var c = JSON.parse(JSON.stringify(a)); c.id = U.uid('a'); delete c.hidden; delete c.locked;
    S.nudge(c, 12, 12);
    Ed.addAnnot(c, U.t('pdf.ed.undo_duplicate_annot'));
  };
  var clip = null;
  Ed.copy = function () { var a = Ed.getSelected(); if (a) { clip = JSON.parse(JSON.stringify(a)); return true; } return false; };
  Ed.canPaste = function () { return !!clip; };
  Ed.paste = function () { if (!clip || !Ed.page()) return false; var c = JSON.parse(JSON.stringify(clip)); c.id = U.uid('a'); delete c.hidden; delete c.locked; S.nudge(c, 12, 12); Ed.addAnnot(c, U.t('pdf.ed.undo_paste_annot')); clip = c; return true; };
  S.nudge = function (a, dx, dy) {
    var c = S.ctx(), r = E.annotViewRect(a, c.R, c.W, c.H);
    E.setAnnotViewRect(a, { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }, c.R, c.W, c.H);
  }
  Ed.nudgeSelected = function (dx, dy) {
    var id = Ed.selId, a = Ed.getSelected(); if (!id || (a && SP.layers.isLocked(a))) return;
    S.commitPage(U.t('pdf.ed.undo_move_annot'), function (p) { p.annots.forEach(function (a) { if (a.id === id) S.nudge(a, dx, dy); }); }, 'nudge:' + id);
  };
  // A property's name in the undo history ("Change opacity"), in words (never the raw id, such as borderC)
  var PROP_LABEL = { font: 'font', size: 'size', bold: 'bold', italic: 'italic', color: 'colour', fill: 'fill', width: 'width',
    borderC: 'border_colour', borderW: 'border_width', opacity: 'opacity' };
  Ed.propLabel = function (key) {
    var k = PROP_LABEL[key] && 'pdf.ed.prop_' + PROP_LABEL[key], s = k ? U.t(k) : key;
    return s === k ? key : s;
  };
  /** Updates a property on the selection (and on the tool default). */
  Ed.setProp = function (key, val) {
    var a = Ed.getSelected(), type = a ? a.type : Ed.tool;
    if (Ed.DEF[type]) { Ed.defaults[type][key] = val; U.store.set('toolDefaults', Ed.defaults); }
    if (!a || SP.layers.isLocked(a)) return;
    var id = a.id;
    S.commitPage(U.t('pdf.ed.undo_change_prop', { prop: Ed.propLabel(key) }), function (p) {
      p.annots.forEach(function (x) {
        if (x.id !== id) return;
        if ((x.type === 'text' || x.type === 'callout') && (key === 'size' || key === 'font' || key === 'bold' || key === 'italic')) {
          var c = S.ctx(), r = E.annotViewRect(x, c.R, c.W, c.H);
          x[key] = val; var t = E.textLayout(x);
          var va = (((c.R - (x.rot || 0)) % 360) + 360) % 360;
          E.setAnnotViewRect(x, { x: r.x, y: r.y, w: va % 180 ? t.h : t.w, h: va % 180 ? t.w : t.h }, c.R, c.W, c.H);
        } else if (x.type === 'step' && key === 'size') { x.w = x.h = val; }
        else x[key] = val;
      });
    }, 'prop:' + id + ':' + key);
  };
  Ed.setTool = function (t) {
    S.finishText(true);
    S.callCancel(); if (Ed.noteUI) Ed.noteUI.close();
    if (t === 'image') { Ed.pickImage(); return; }
    if (t === 'signature') { SP.sign.open(function (asset) { Ed.placeImage(asset, 'Add signature'); }); return; } // i18n-ignore: the label is a sentinel, placeImage translates it
    Ed.tool = t; if (S.pageEl) S.pageEl.dataset.tool = t;
    if (t !== 'select') Ed.select(null);
    if (SP.app) SP.app.toolChanged();
  };

  /* -------------------------------------------------------------- images */
  Ed.pickImage = function () {
    return SlopIntake.pick({ to: 'pdf.image', multiple: false, mode: 'add' }); // editor/paste-image.js
  };
  Ed.placeImage = function (asset, label) {
    var p = Ed.page(); if (!p) return;
    // 'Add signature' (also from tools/edit-panel.js) marks a signature: sized smaller, flagged, the undo label translated
    var sig = label === 'Add signature'; if (sig) label = U.t('pdf.ed.undo_add_signature'); // i18n-ignore
    var c = S.ctx(), vs = E.viewSize(p);
    var maxW = vs.w * (sig ? 0.32 : 0.45), w = Math.min(maxW, asset.w * 0.75), h = w * asset.h / asset.w;
    if (h > vs.h * 0.5) { h = vs.h * 0.5; w = h * asset.w / asset.h; }
    // centre of the visible part of the page
    var vr = S.viewer.getBoundingClientRect(), pr = S.pageEl.getBoundingClientRect();
    var cx = U.clamp(((vr.left + vr.width / 2) - pr.left) / c.z, w / 2, vs.w - w / 2), cy = U.clamp(((vr.top + vr.height / 2) - pr.top) / c.z, h / 2, vs.h - h / 2);
    var a = { type: 'image', asset: asset.id, opacity: 1, rot: c.R, cx: 0, cy: 0, w: w, h: h };
    if (sig) a.sig = true;
    E.setAnnotViewRect(a, { x: cx - w / 2, y: cy - h / 2, w: w, h: h }, c.R, c.W, c.H);
    Ed.tool = 'select'; S.pageEl.dataset.tool = 'select';
    Ed.addAnnot(a, label);
    if (SP.app) SP.app.toolChanged();
  };

})();
