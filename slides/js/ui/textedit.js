/* Slop Slides: on-canvas text editing. A textarea sits over the object (its text is left out of the canvas while it
   is open) and takes the object's font, size, colour and alignment. Commit on blur, Escape or Ctrl/Cmd+Enter. Edits
   that change nothing add no undo step. Exposes window.SS.textEdit. */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS, A = SS.app, O = SS.objects, TH = SS.themes, F = SS.fonts, St = SS.stage;
  var TE = SS.textEdit = { editing: null };
  var ta = null, ALIGN = { l: 'left', c: 'center', r: 'right', j: 'justify' };

  TE.canEdit = function (o) { return !!o && !!o.text && (o.type === 'text' || (o.type === 'shape' && !O.isLine(o))); };
  TE.mount = function (el) {
    ta = el;
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); TE.commit(); }
      e.stopPropagation();
    });
    el.addEventListener('blur', function () { TE.commit(); });
  };
  /** Opens the editor over o (selecting it). */
  TE.open = function (o) {
    if (!ta || A.mode !== 'edit' || !TE.canEdit(o)) return;
    if (TE.editing === o.id) return;
    TE.commit();
    A.select([o.id]);
    TE.editing = o.id;
    var b = O.bounds(o), k = St.k, st = o.style || {}, th = SS.themes.of(A.deck), ins = o.text.inset || SS.textLayout.INSET;
    ta.value = O.plain(o.text);
    var s = ta.style;
    s.left = (St.ox + b.x * k) + 'px';
    s.top = (St.oy + b.y * k) + 'px';
    s.width = Math.max(48, b.w * k) + 'px';
    s.height = Math.max(32, b.h * k) + 'px';
    s.padding = (ins[1] * k) + 'px ' + (ins[0] * k) + 'px';
    s.font = (st.italic ? 'italic ' : '') + (st.bold ? '700 ' : '400 ') + ((st.size || 18) * k) + 'px ' + F.domFamily(TH.font(th, st.font));
    s.lineHeight = String(st.lineHeight || 1.2);
    s.textAlign = ALIGN[st.align || 'l'] || 'left';
    s.color = TH.color(th, st.color, 'text');
    ta.hidden = false;
    ta.focus();
    ta.setSelectionRange(0, ta.value.length);
    A.emit('render');
  };
  /** Writes the textarea back into the object (one undo step, only if the text changed) and closes the editor. */
  TE.commit = function () {
    var id = TE.editing;
    if (!id) return;
    TE.editing = null;
    var val = ta.value, slide = A.slide(), o = slide && O.find(slide, id);
    ta.hidden = true;
    if (o && val !== O.plain(o.text)) A.change(SU.t('slides.op.edit_text'), function () { SS.textParse.apply(o, val); });
    A.emit('render');
  };
})();
