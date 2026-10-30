/* Slop PDF — the History dock section, as in Photoshop: every applied step (oldest first), then the undone steps greyed
   out. Click a step to go to the document as it was after that step (undo or redo until it is reached). It starts
   collapsed. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, H = SP.history, D = SP.dock, h = U.h, t = U.t;

  /** Rows: the original document, each applied step, then each undone step (the next redo first). */
  function rows() {
    var st = H.steps(), cur = st.past.length, out = [{ label: t('pdf.tool.history.original'), at: 0 }];
    st.past.forEach(function (label, i) { out.push({ label: label, at: i + 1 }); });
    st.future.forEach(function (label, k) { out.push({ label: label, at: cur + k + 1, undone: true }); });
    return { list: out, cur: cur };
  }
  function goTo(at) {
    if (Ed.isEditingText && Ed.isEditingText()) Ed.commitText();
    H.goTo(at);
  }
  function render(body) {
    var r = rows();
    if (r.list.length === 1 && !E.state.pages.length) { body.appendChild(h('p', { class: 'pp-note' }, t('pdf.tool.history.empty'))); return; }
    body.appendChild(h('p', { class: 'pp-hint' }, t('pdf.tool.history.hint')));
    var list = h('ol', { class: 'hist-list', 'aria-label': t('pdf.tool.history.list_aria') });
    r.list.forEach(function (x) {
      var on = x.at === r.cur;
      list.appendChild(h('li', { class: 'hist' + (on ? ' on' : '') + (x.undone ? ' is-undone' : '') },
        h('button', { type: 'button', class: 'hist-b', 'data-key': 'h' + x.at, 'aria-current': on ? 'true' : null, onclick: function () { goTo(x.at); } }, x.label)));
    });
    body.appendChild(list);
  }
  D.add({
    id: 'history', title: function () { return t('pdf.tool.history.title'); }, open: false, render: render,
    meta: function () { return E.state.pages.length ? String(H.steps().past.length) : ''; },
  });
})();
