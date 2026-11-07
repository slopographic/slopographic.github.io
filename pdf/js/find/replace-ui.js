/* Slop PDF find — the Replace dialog: the find and replace fields, the list of every match (page, the text around it,
   and a checkbox per match that can be unticked), and Replace checked. A match whose position cannot be located is
   listed as not replaced and cannot be ticked. Replacing is find/replace.js. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, F = window.SlopPdfFind;
  var dlg = null, el = {}, st = { matches: [], on: new Set(), cs: false, ww: false, seq: 0 };

  function build() {
    // built once: the words follow a language switch through data-i18n / data-i18n-attr (SlopI18n.apply) and U.onLang
    var t = U.t;
    el.find = U.h('input', { type: 'text', class: 'find-input', 'aria-label': t('pdf.find.rep_find'), placeholder: t('pdf.find.rep_find'), 'data-i18n-attr': 'aria-label:pdf.find.rep_find;placeholder:pdf.find.rep_find' });
    el.rep = U.h('input', { type: 'text', class: 'find-input', 'aria-label': t('pdf.find.rep_with'), placeholder: t('pdf.find.rep_with'), 'data-i18n-attr': 'aria-label:pdf.find.rep_with;placeholder:pdf.find.rep_with' });
    el.cs = U.h('button', { type: 'button', class: 'find-opt', 'aria-label': t('pdf.find.match_case'), 'aria-pressed': 'false', title: t('pdf.find.match_case'), 'data-i18n-attr': 'aria-label:pdf.find.match_case;title:pdf.find.match_case' }, 'Aa');
    el.ww = U.h('button', { type: 'button', class: 'find-opt', 'aria-label': t('pdf.find.whole_word'), 'aria-pressed': 'false', title: t('pdf.find.whole_word'), 'data-i18n-attr': 'aria-label:pdf.find.whole_word;title:pdf.find.whole_word' }, 'W');
    el.status = U.h('p', { class: 'find-status', 'aria-live': 'polite' });
    el.list = U.h('ol', { class: 'find-rlist', 'aria-label': t('pdf.find.matches'), 'data-i18n-attr': 'aria-label:pdf.find.matches' });
    el.go = U.h('button', { type: 'button', class: 'find-go' }, t('pdf.find.rep_go'));
    el.cancel = U.h('button', { type: 'button', class: 'find-cancel', 'data-i18n': 'menu.cancel' }, t('menu.cancel'));
    dlg = U.h('div', { class: 'find-modal', hidden: true },
      U.h('div', { class: 'find-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('pdf.find.replace_tip'), 'data-i18n-attr': 'aria-label:pdf.find.replace_tip' },
        U.h('h2', { class: 'find-title', 'data-i18n': 'pdf.find.replace_tip' }, t('pdf.find.replace_tip')),
        U.h('div', { class: 'find-fields' }, el.find, el.rep, el.cs, el.ww),
        el.status, el.list,
        U.h('div', { class: 'find-foot' }, el.cancel, el.go)));
    document.body.appendChild(dlg);
    var input = function () { st.seq++; search(); };
    var typeT = 0;
    el.find.addEventListener('input', function () { clearTimeout(typeT); typeT = setTimeout(input, 160); });
    el.cs.addEventListener('click', function () { st.cs = !st.cs; el.cs.setAttribute('aria-pressed', String(st.cs)); input(); });
    el.ww.addEventListener('click', function () { st.ww = !st.ww; el.ww.setAttribute('aria-pressed', String(st.ww)); input(); });
    el.go.addEventListener('click', apply);
    el.cancel.addEventListener('click', close);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    dlg.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    U.onLang(function () { if (!dlg.hidden) render(); }); // the list, the status and Replace checked
  }

  /** Opens the dialog with the find text and options the bar was using, and lists its matches. */
  F.openReplace = function (q, opts) {
    if (!dlg) build();
    st.cs = !!(opts && opts.caseSensitive); st.ww = !!(opts && opts.wholeWord);
    el.cs.setAttribute('aria-pressed', String(st.cs)); el.ww.setAttribute('aria-pressed', String(st.ww));
    el.find.value = q || ''; dlg.hidden = false; el.rep.focus();
    search();
  };
  function close() { if (dlg) dlg.hidden = true; }
  async function search() {
    var seq = st.seq, q = el.find.value;
    el.status.textContent = U.t(q ? 'pdf.find.searching' : 'pdf.find.rep_type');
    var list = q ? await F.search(q, { caseSensitive: st.cs, wholeWord: st.ww }) : [];
    if (seq !== st.seq) return;
    st.matches = list; st.on = new Set();
    list.forEach(function (m, i) { if (m.precise) st.on.add(i); });
    render();
  }
  function render() {
    el.list.replaceChildren();
    st.matches.forEach(function (m, i) {
      var box = U.h('input', { type: 'checkbox', 'aria-label': U.t('pdf.find.rep_match', { n: String(i + 1) }) });
      box.checked = st.on.has(i); box.disabled = !m.precise;
      box.addEventListener('change', function () { if (box.checked) st.on.add(i); else st.on.delete(i); count(); });
      var note = m.precise ? '' : U.t('pdf.find.rep_unplaced');
      el.list.appendChild(U.h('li', { class: m.precise ? '' : 'is-unplaced' },
        box,
        U.h('span', { class: 'find-hit-page' }, U.t('pdf.find.page_short', { page: String(m.page) })),
        U.h('span', { class: 'find-hit-ctx' }, m.ctx.before, U.h('mark', {}, m.ctx.match), m.ctx.after),
        note ? U.h('span', { class: 'find-note' }, note) : ''));
    });
    count();
  }
  function count() {
    var n = st.on.size, total = st.matches.length;
    el.status.textContent = total ? U.t('pdf.find.rep_status', { matches: U.t('pdf.find.rep_matches', { n: total }), n: n }) : (el.find.value ? U.t('pdf.find.rep_none') : '');
    el.go.disabled = !n;
    el.go.textContent = n ? U.t('pdf.find.rep_go_n', { n: n }) : U.t('pdf.find.rep_go');
  }
  async function apply() {
    var rep = el.rep.value, items = [], skipped = 0;
    st.matches.forEach(function (m, i) { if (st.on.has(i) && m.precise) items.push({ pid: m.pid, m: m, rep: rep }); else if (!m.precise) skipped++; });
    var unticked = st.matches.length - items.length - skipped;
    var r = await F.replaceMatches(items);
    var parts = [U.t('pdf.find.rep_done', { done: r.done, total: st.matches.length })];
    if (skipped) parts.push(U.t('pdf.find.rep_skipped', { n: skipped }));
    if (unticked) parts.push(U.t('pdf.find.rep_unticked', { n: unticked }));
    if (r.wide) parts.push(U.t('pdf.find.rep_wide', { n: r.wide }));
    if (r.unsupported) parts.push(U.t('pdf.find.rep_unsupported'));
    SlopUI.toast(parts.join(' '), 6000);
    close();
    F.refresh && F.refresh();
  }
})();
