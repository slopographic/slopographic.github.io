/* Slop PDF — inline text editing: a textarea laid exactly over the text annotation (rotation
   aware) that grows while typing and commits as one undo step. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._;
  /* -------------------------------------------------------------- text */
  S.openTextEditor = function (a) {
    var c = S.ctx(), z = c.z, t = E.textLayout(Object.assign({}, a, { text: a.text || 'M' }));
    Ed.selId = a.id; Ed.paint();
    S.ta.hidden = false; S.ta.value = a.text || '';
    S.ta.style.fontFamily = E.cssFont(a);
    S.ta.style.fontSize = (t.size * z) + 'px'; S.ta.style.lineHeight = (t.lh * z) + 'px';
    S.ta.style.fontWeight = E.cssWeight(a); S.ta.style.fontStyle = a.italic ? 'italic' : 'normal';
    S.ta.style.color = a.color || '#000';
    S.ta.style.padding = (t.pad * z) + 'px';
    S.placeTA(a);
    var focusTA = function () { if (document.activeElement !== S.ta && !S.ta.hidden) { S.ta.focus({ preventScroll: true }); S.ta.setSelectionRange(S.ta.value.length, S.ta.value.length); } };
    focusTA(); setTimeout(focusTA, 0);
    if (SP.app) SP.app.editorSelectionChanged();
  }
  S.placeTA = function (a) {
    var c = S.ctx(), z = c.z, t = E.textLayout(Object.assign({}, a, { text: a.text || 'M' }));
    var va = (((c.R - (a.rot || 0)) % 360) + 360) % 360, cv = E.toView(c.R, c.W, c.H, a.cx, a.cy);
    var w = Math.max(t.w, t.size * 2) + t.size, h = t.h;
    S.ta.style.width = (w * z) + 'px'; S.ta.style.height = (h * z) + 'px';
    // anchor: the annotation's local top-left stays put while typing
    var lx = -a.w / 2, ly = -a.h / 2;
    var ang = va * Math.PI / 180, ox = cv[0] + lx * Math.cos(ang) - ly * Math.sin(ang), oy = cv[1] + lx * Math.sin(ang) + ly * Math.cos(ang);
    S.ta.style.left = (ox * z) + 'px'; S.ta.style.top = (oy * z) + 'px';
    S.ta.style.transformOrigin = '0 0'; S.ta.style.transform = va ? 'rotate(' + va + 'deg)' : 'none';
  }
  S.onTextInput = function () {
    if (!S.editing) return;
    var a = S.findAnnot(S.editing.id); if (!a) return;
    var c = S.ctx(), va = (((c.R - (a.rot || 0)) % 360) + 360) % 360;
    // keep local top-left fixed while the box grows
    var cv = E.toView(c.R, c.W, c.H, a.cx, a.cy), ang = va * Math.PI / 180;
    var ox = cv[0] + (-a.w / 2) * Math.cos(ang) - (-a.h / 2) * Math.sin(ang), oy = cv[1] + (-a.w / 2) * Math.sin(ang) + (-a.h / 2) * Math.cos(ang);
    a.text = S.ta.value;
    var t = E.textLayout(Object.assign({}, a, { text: a.text || 'M' }));
    a.w = t.w; a.h = t.h;
    var ncx = ox + (a.w / 2) * Math.cos(ang) - (a.h / 2) * Math.sin(ang), ncy = oy + (a.w / 2) * Math.sin(ang) + (a.h / 2) * Math.cos(ang);
    var pc = E.toPage(c.R, c.W, c.H, ncx, ncy); a.cx = pc[0]; a.cy = pc[1];
    S.placeTA(a);
  }
  S.finishText = function (commit) {
    if (!S.editing) return;
    var ed = S.editing; S.editing = null;
    S.ta.hidden = true;
    var p = Ed.page(), a = S.findAnnot(ed.id);
    if (!p || !a) { Ed.paint(); return; }
    var fin = JSON.parse(JSON.stringify(a)), empty = !String(fin.text || '').trim();
    // undo the live (uncommitted) edits, then commit the result as one step
    if (ed.isNew) p.annots = p.annots.filter(function (x) { return x.id !== ed.id; });
    else { a.text = ed.before; var t0 = E.textLayout(a); void t0; }
    if (!ed.isNew) { var o = fin; o.text = ed.before; var tl = E.textLayout(o); void tl; }
    if (commit && !empty) {
      fin.text = S.ta.value;
      var go = function () {
        if (ed.isNew) { Ed.addAnnot(fin, U.t('pdf.ed.undo_add_text')); Ed.tool = 'select'; S.pageEl.dataset.tool = 'select'; if (SP.app) SP.app.toolChanged(); }
        else if (fin.text !== ed.before) S.commitPage(U.t('pdf.ed.undo_edit_text'), function (pp) { pp.annots = pp.annots.map(function (y) { return y.id === fin.id ? fin : y; }); });
        else { S.restoreGeom(a, fin); Ed.paint(); }
      };
      // text in another script waits for its language font (text-intl.js), downloaded just in time
      if (E.needsScripts && E.needsScripts(fin.text, E.fontKey(fin))) E.ensureScripts(fin.text, E.fontKey(fin), fin.bold).then(go, go);
      else go();
    } else if (!ed.isNew && empty) {
      S.commitPage(U.t('pdf.ed.undo_delete_text'), function (pp) { pp.annots = pp.annots.filter(function (y) { return y.id !== fin.id; }); });
      Ed.select(null);
    } else Ed.paint();
  }
  S.restoreGeom = function (a, fin) { a.text = fin.text; a.w = fin.w; a.h = fin.h; a.cx = fin.cx; a.cy = fin.cy; }
  Ed.isEditingText = function () { return !!S.editing; };
  Ed.commitText = function () { S.finishText(true); };

})();
