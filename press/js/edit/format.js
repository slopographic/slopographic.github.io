/* Slop Press — applying text formatting: to the text selection while editing, to typing attributes at a
   bare caret, or to whole stories when text frames are selected with the Selection tool. */
(function () {
  'use strict';
  var PR = window.PR, S = PR.state, ST = PR.story, STY = PR.styles, U = PR.util, H = PR.history, TE = PR.textEdit;
  var FM = PR.format = {};

  /** Ranges to format: [{ story, a, b }]. */
  FM.targets = function () {
    if (S.text) { var r = TE.range(); return [{ story: S.doc.stories[S.text.story], a: r[0], b: r[1], caret: r[0] === r[1] }]; }
    var seen = {}, out = [];
    PR.selected().forEach(function (it) {
      if (it.type !== 'text' || seen[it.story]) return; seen[it.story] = 1;
      var s = S.doc.stories[it.story]; if (s) out.push({ story: s, a: 0, b: s.text.length, whole: true });
    });
    return out;
  };
  FM.hasText = function () { return FM.targets().length > 0; };
  function done(label) { STY.invalidate(); H.commit(label); if (TE.changed && S.text) { TE.changed(); var ae = document.activeElement; if (!ae || ae === TE.input || !/^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) TE.focus(); } PR.emit('textsel'); }

  /** Character attributes (overrides). patch values of null remove an override. */
  FM.char = function (patch, label) {
    var ts = FM.targets(); if (!ts.length) return false;
    ts.forEach(function (t) {
      if (t.caret) {
        var cur = TE.pend || U.clone(ST.attrsAt(t.story, t.a));
        cur.ov = cur.ov || {};
        for (var k in patch) { if (k === 'cs') cur.cs = patch.cs; else if (patch[k] === null) delete cur.ov[k]; else cur.ov[k] = patch[k]; }
        TE.pend = cur;
      } else ST.formatChars(t.story, t.a, t.b, patch);
    });
    if (ts[0].caret) { PR.emit('textsel'); PR.view.request(); return true; }
    done(label || U.t('press.edit.undo_character_format'));
    return true;
  };
  FM.para = function (patch, label) {
    var ts = FM.targets(); if (!ts.length) return false;
    ts.forEach(function (t) { ST.formatParas(t.story, t.a, t.b, patch); });
    done(label || U.t('press.edit.undo_paragraph_format'));
    return true;
  };
  /** Applies a paragraph style. clear: also removes local overrides (paragraph and character). */
  FM.paraStyle = function (name, clear) {
    var ts = FM.targets(); if (!ts.length) return false;
    ts.forEach(function (t) {
      ST.formatParas(t.story, t.a, t.b, { ps: name }, clear);
      if (clear) { var k0 = ST.paraRange(t.story, ST.paraAt(t.story, t.a))[0], k1 = ST.paraRange(t.story, ST.paraAt(t.story, t.b))[1]; ST.formatChars(t.story, k0, k1, {}, true); }
    });
    done(U.t('press.edit.undo_apply_style', { name: name }));
    return true;
  };
  FM.charStyle = function (name) {
    return FM.char({ cs: !name || name === '[None]' ? null : name }, U.t('press.edit.undo_apply_style', { name: name || '[None]' }));
  };
  FM.clearOverrides = function () {
    var ts = FM.targets(); if (!ts.length) return false;
    ts.forEach(function (t) { ST.formatParas(t.story, t.a, t.b, {}, true); if (t.a !== t.b) ST.formatChars(t.story, t.a, t.b, {}, true); });
    done(U.t('press.edit.undo_clear_overrides')); return true;
  };
  /** Toggles bold/italic by switching fontStyle. */
  FM.toggle = function (what) {
    var cur = FM.current(); if (!cur) return;
    var st = cur.char.fontStyle || 'Regular', b = /bold/i.test(st), i = /italic/i.test(st);
    if (what === 'bold') b = !b; else i = !i;
    FM.char({ fontStyle: b && i ? 'Bold Italic' : b ? 'Bold' : i ? 'Italic' : 'Regular' }, U.t(what === 'bold' ? 'press.edit.undo_bold' : 'press.edit.undo_italic'));
  };
  /** Effective attributes where the caret is (or at the start of the first selected story). */
  FM.current = function () {
    var ts = FM.targets(); if (!ts.length) return null;
    var t = ts[0], s = t.story, o = t.a, k = ST.paraAt(s, o), para = s.paras[k] || { ps: '[Basic Paragraph]', ov: {} };
    var run = t.caret && TE.pend ? TE.pend : ST.attrsAt(s, t.caret ? o : Math.min(o + 1, s.text.length) || o);
    var g = STY.glyph(S.doc, para, run || { cs: null, ov: {} });
    return { ps: para.ps, cs: run && run.cs || '[None]', para: U.assign({}, STY.paraEffective(S.doc, para)), char: g, paraOv: para.ov || {}, charOv: (run && run.ov) || {} };
  };
  /** Redefines a style from the current local overrides ("Redefine Style"). */
  FM.redefine = function (kind) {
    var c = FM.current(); if (!c) return false;
    var name = kind === 'para' ? c.ps : c.cs; if (!name || name === '[None]') return false;
    STY.update(S.doc, kind, name, kind === 'para' ? c.paraOv : c.charOv);
    FM.clearOverrides();
    return true;
  };
})();
