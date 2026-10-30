/* Slop Press — keyboard navigation and editing keys while editing text (shortcuts with Ctrl/Cmd go to the
   command registry; this handles caret movement, deletion, Enter, Tab and Escape). */
(function () {
  'use strict';
  var PR = window.PR, S = PR.state, N = PR.nav, TE = PR.textEdit;

  PR.textKeys = function (e) {
    if (!S.text || TE.composing || e.isComposing) return;
    var s = TE.story(); if (!s) return;
    var t = S.text, mod = e.ctrlKey || e.metaKey, word = e.altKey || (e.ctrlKey && !PR.util.IS_MAC), shift = e.shiftKey;
    var k = e.key, handled = true, r = TE.range();
    switch (k) {
      case 'ArrowLeft':
        if (!shift && r[0] !== r[1]) TE.setCaret(r[0]);
        else if (e.metaKey && PR.util.IS_MAC) TE.setCaret(N.lineEdge(t.story, t.caret, false), shift);
        else TE.setCaret(word ? TE.wordStart(s.text, t.caret) : t.caret - 1, shift);
        TE.goalX = null; break;
      case 'ArrowRight':
        if (!shift && r[0] !== r[1]) TE.setCaret(r[1]);
        else if (e.metaKey && PR.util.IS_MAC) TE.setCaret(N.lineEdge(t.story, t.caret, true), shift);
        else TE.setCaret(word ? TE.wordEnd(s.text, t.caret) : t.caret + 1, shift);
        TE.goalX = null; break;
      case 'ArrowUp': case 'ArrowDown': {
        var dir = k === 'ArrowUp' ? -1 : 1;
        if (mod) { // paragraph jumps
          var pk = PR.story.paraAt(s, t.caret), pr = PR.story.paraRange(s, pk);
          TE.setCaret(dir < 0 ? (t.caret > pr[0] ? pr[0] : PR.story.paraRange(s, Math.max(0, pk - 1))[0]) : Math.min(s.text.length, pr[1] + 1), shift);
          break;
        }
        var at = N.locate(t.story, t.caret);
        if (TE.goalX == null && at) TE.goalX = at.x;
        var o = N.vertical(t.story, t.caret, dir, TE.goalX);
        if (o != null) { var gx = TE.goalX; TE.setCaret(o, shift); TE.goalX = gx; }
        break;
      }
      case 'Home': TE.setCaret(mod ? 0 : N.lineEdge(t.story, t.caret, false), shift); break;
      case 'End': TE.setCaret(mod ? s.text.length : N.lineEdge(t.story, t.caret, true), shift); break;
      case 'PageUp': case 'PageDown': {
        var o2 = t.caret, d2 = k === 'PageUp' ? -1 : 1;
        for (var n = 0; n < 20; n++) { var nx = N.vertical(t.story, o2, d2, TE.goalX); if (nx == null || nx === o2) break; o2 = nx; }
        TE.setCaret(o2, shift); break;
      }
      case 'Backspace': TE.deleteDir(-1, word); break;
      case 'Delete': TE.deleteDir(1, word); break;
      case 'Enter':
        if (mod) { handled = false; break; }
        TE.insert(shift ? '\u2028' : '\n', PR.util.t(shift ? 'press.edit.undo_line_break' : 'press.edit.undo_new_paragraph')); break;
      case 'Tab': if (mod) { handled = false; break; } TE.insert('\t', PR.util.t('press.edit.undo_tab')); break;
      case 'Escape': TE.exit(); PR.tools.set('select'); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  };
})();
