/* Slop PDF find bar (Ctrl+F): the query, Match case and Whole word, the count ("3 of 12"), Next and Previous (Enter,
   Shift+Enter), an optional result list, and Replace (find/replace.js). Opening the bar searches as you type; a document
   change searches again so the highlights follow the edits. Matches: find/search.js. Highlights: find/paint.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, F = window.SlopPdfFind;
  var st = { open: false, q: '', cs: false, ww: false, seq: 0, busy: false, list: false };
  var bar = null, el = {}, typeT = 0;

  function build() {
    // built once: the words follow a language switch through data-i18n / data-i18n-attr (SlopI18n.apply) and U.onLang
    var t = U.t;
    el.input = U.h('input', { type: 'search', class: 'find-input', placeholder: t('pdf.find.input'), 'aria-label': t('pdf.find.input'), 'data-i18n-attr': 'placeholder:pdf.find.input;aria-label:pdf.find.input', autocomplete: 'off', spellcheck: 'false' });
    el.cs = U.h('button', { type: 'button', class: 'find-opt', title: t('pdf.find.match_case'), 'aria-label': t('pdf.find.match_case'), 'data-i18n-attr': 'title:pdf.find.match_case;aria-label:pdf.find.match_case', 'aria-pressed': 'false' }, 'Aa');
    el.ww = U.h('button', { type: 'button', class: 'find-opt', title: t('pdf.find.whole_word'), 'aria-label': t('pdf.find.whole_word'), 'data-i18n-attr': 'title:pdf.find.whole_word;aria-label:pdf.find.whole_word', 'aria-pressed': 'false' }, 'W');
    el.count = U.h('span', { class: 'find-count', 'aria-live': 'polite' });
    el.prev = U.h('button', { type: 'button', class: 'find-nav', title: t('pdf.find.prev_tip'), 'aria-label': t('pdf.find.prev'), 'data-i18n-attr': 'title:pdf.find.prev_tip;aria-label:pdf.find.prev', html: U.icon('prev') });
    el.next = U.h('button', { type: 'button', class: 'find-nav', title: t('pdf.find.next_tip'), 'aria-label': t('pdf.find.next'), 'data-i18n-attr': 'title:pdf.find.next_tip;aria-label:pdf.find.next', html: U.icon('next') });
    el.list = U.h('button', { type: 'button', class: 'find-opt', title: t('pdf.find.list_tip'), 'aria-label': t('pdf.find.list_tip'), 'data-i18n-attr': 'title:pdf.find.list_tip;aria-label:pdf.find.list_tip', 'data-i18n': 'pdf.find.list', 'aria-pressed': 'false' }, t('pdf.find.list'));
    el.rep = U.h('button', { type: 'button', class: 'find-opt', title: t('pdf.find.replace_tip'), 'aria-label': t('pdf.find.replace_tip'), 'data-i18n-attr': 'title:pdf.find.replace_tip;aria-label:pdf.find.replace_tip', 'data-i18n': 'pdf.find.replace' }, t('pdf.find.replace'));
    el.close = U.h('button', { type: 'button', class: 'find-nav', title: t('pdf.find.close_tip'), 'aria-label': t('pdf.find.close'), 'data-i18n-attr': 'title:pdf.find.close_tip;aria-label:pdf.find.close', html: U.icon('close') });
    el.ol = U.h('ol', { class: 'find-list', hidden: true, 'aria-label': t('pdf.find.matches'), 'data-i18n-attr': 'aria-label:pdf.find.matches' });
    bar = U.h('div', { class: 'find-bar', role: 'search', hidden: true },
      U.h('div', { class: 'find-row' }, el.input, el.cs, el.ww, el.count, el.prev, el.next, el.list, el.rep, el.close), el.ol);
    S.viewer.parentNode.appendChild(bar);
    el.input.addEventListener('input', function () { clearTimeout(typeT); typeT = setTimeout(function () { st.q = el.input.value; run(true); }, 140); });
    el.input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); F.close(); }
    });
    el.cs.addEventListener('click', function () { st.cs = !st.cs; el.cs.setAttribute('aria-pressed', String(st.cs)); run(true); });
    el.ww.addEventListener('click', function () { st.ww = !st.ww; el.ww.setAttribute('aria-pressed', String(st.ww)); run(true); });
    el.next.addEventListener('click', function () { go(1); });
    el.prev.addEventListener('click', function () { go(-1); });
    el.list.addEventListener('click', function () { st.list = !st.list; el.list.setAttribute('aria-pressed', String(st.list)); renderList(); });
    el.rep.addEventListener('click', function () { if (F.openReplace) F.openReplace(st.q, { caseSensitive: st.cs, wholeWord: st.ww }); });
    el.close.addEventListener('click', function () { F.close(); });
    bar.addEventListener('keydown', function (e) { e.stopPropagation(); });
    E.on('change', function () { if (st.open && st.q && !st.busy) run(false); });
    U.onLang(function () { label(); renderList(); }); // the count and the list (the rest: data-i18n)
  }

  function label() { el.count.textContent = F.label(F.cur, F.results.length, st.busy); }
  /** Runs the search. goFirst: a new query, so the first match is shown; otherwise the current match is kept. */
  async function run(goFirst) {
    var seq = ++st.seq;
    if (!st.q) { F.setResults([], -1); F.paintAll(); label(); renderList(); return; }
    st.busy = true; label();
    var res = [];
    try { res = await F.search(st.q, { caseSensitive: st.cs, wholeWord: st.ww }); } catch (e) { console.warn('Slop PDF: find failed', e); }
    if (seq !== st.seq) return; // a newer search has started
    st.busy = false;
    var cur = !res.length ? -1 : goFirst ? 0 : Math.min(Math.max(F.cur, 0), res.length - 1);
    F.setResults(res, cur); F.paintAll(); label(); renderList();
    if (cur >= 0 && goFirst) reveal(cur);
  }
  function go(dir) {
    if (st.busy) return;
    if (!F.results.length) { if (st.q) run(true); return; }
    var i = F.step(F.cur, F.results.length, dir);
    F.setResults(F.results, i); F.paintAll(); label(); renderList(); reveal(i);
  }
  /** Shows a match: the page view on its page, scrolled so the match sits about a third down the viewer. */
  function reveal(i) {
    var m = F.results[i]; if (!m) return;
    if (SP.app.mode !== 'page') SP.app.openPage(m.pid);
    else if (Ed.pid !== m.pid) Ed.show(m.pid);
    var s = S.slots.get(m.pid), p = E.pageById(m.pid), box = m.boxes[0];
    if (!s || !p || !box) return;
    var g = E.geom(p), c = E.toView(E.rotation(p), g.W, g.H, box.x + box.w / 2, box.y + box.h / 2);
    var pr = s.el.getBoundingClientRect(), vr = S.viewer.getBoundingClientRect();
    S.viewer.scrollTop += pr.top + c[1] * Ed.zoom - (vr.top + vr.height / 3);
    S.viewer.scrollLeft += pr.left + c[0] * Ed.zoom - (vr.left + vr.width / 2);
    F.paintAll();
  }
  /** The result list: a button per match with the page and the text around it. Clicking one shows that match. */
  function renderList() {
    el.ol.hidden = !st.list || !F.results.length;
    el.ol.replaceChildren();
    if (el.ol.hidden) return;
    F.results.forEach(function (m, i) {
      var b = U.h('button', { type: 'button', class: 'find-hit' + (i === F.cur ? ' is-current' : ''), 'aria-current': i === F.cur ? 'true' : 'false' },
        U.h('span', { class: 'find-hit-page' }, U.t('pdf.find.page_short', { page: String(m.page) })),
        U.h('span', { class: 'find-hit-ctx' }, m.ctx.before, U.h('mark', {}, m.ctx.match), m.ctx.after));
      b.addEventListener('click', function () { F.setResults(F.results, i); F.paintAll(); label(); renderList(); reveal(i); });
      el.ol.appendChild(U.h('li', {}, b));
    });
    var cur = el.ol.querySelector('.is-current'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  /** Opens the bar (Ctrl+F): focuses the query, with the last query selected. A string q (the selected text, from the
      selection bar) becomes the query and searches from its first match. */
  F.open = function (q) {
    if (!bar) build();
    st.open = true; bar.hidden = false;
    var fresh = typeof q === 'string' && q.length > 0;
    if (fresh) { st.q = q; el.input.value = q; }
    el.input.focus(); el.input.select();
    if (st.q) run(fresh);
  };
  /** Closes the bar and removes the highlights. The query is kept for the next time. */
  F.close = function () {
    if (!bar) return;
    st.open = false; st.seq++; st.busy = false; bar.hidden = true;
    F.setResults([], -1); F.paintAll(); renderList();
  };
  F.isOpen = function () { return st.open; };
  /** The options the bar is using, for the replace dialog. */
  F.options = function () { return { query: st.q, caseSensitive: st.cs, wholeWord: st.ww }; };
  F.goTo = reveal;
  F.refresh = function () { if (st.open && st.q) run(false); };
})();
