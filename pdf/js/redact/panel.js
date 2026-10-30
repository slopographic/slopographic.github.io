/* Slop PDF — Redact panel and actions: draw marks, Find & redact (text, regex, presets), a review
   list of marked areas, and "Apply redactions" behind a confirm dialog. Downloading with marks that
   are not applied yet asks to apply them first (E.build refuses to export pending marks). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, R = SP.redact, A = SP.app, S = A._, h = U.h;
  var P = SP.panels, K = P.helpers, section = K.section, btn = K.btn, seg = K.seg, select = K.select, check = K.check, note = K.note;
  var opts = R.opts = { text: '', regex: false, matchCase: false, presets: [], dpi: U.store.get('redactDpi', 200), stripMeta: true };
  var results = [], t = U.t;

  function clip(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function pagesWith() { var s = new Set(); R.pending().forEach(function (x) { s.add(x.p.id); }); return s.size; }
  function areasOn(areas, pages, key) { return { areas: t(key || 'pdf.redact.n_areas', { n: areas }), pages: t('pdf.redact.n_pages', { n: pages }) }; }

  /* ------------------------------------------------------------ actions */
  A.findRedactions = function () {
    return S.guarded(t('pdf.redact.searching'), async function (prog) {
      try { R.matchers(opts); } catch (e) { SlopUI.alert(t('pdf.redact.bad_pattern_title'), t('pdf.redact.bad_pattern', { msg: e.message })); return null; }
      results = await R.search(opts, function (f) { prog(f); });
      results.forEach(function (m) { m.on = true; });
      A.announce(results.length ? t('pdf.redact.found', { n: results.length }) : t('pdf.redact.no_matches'));
      P.refresh('redact');
      return results;
    });
  };
  A.markFound = function () {
    var n = R.markMatches(results.filter(function (m) { return m.on; }));
    results = [];
    A.announce(t('pdf.redact.marked', { n: n }));
    P.refresh('redact');
    return n;
  };
  A.applyRedactions = function (skipConfirm) {
    var marks = R.pending().length, pages = pagesWith();
    if (!marks) { SlopUI.toast(t('pdf.redact.nothing_marked')); return Promise.resolve(false); }
    var ask = skipConfirm ? Promise.resolve(true) : new Promise(function (res) {
      SlopUI.dialog({ title: t('pdf.redact.confirm_title'), cls: 'rd-confirm', onClose: res,
        body: h('div', null,
          h('p', { class: 'sui-p' }, t('pdf.redact.confirm_body', areasOn(marks, pages, 'pdf.redact.n_marked_areas'))),
          h('ul', { class: 'rd-list-warn' },
            h('li', null, t('pdf.redact.warn_image')),
            h('li', null, t('pdf.redact.warn_flatten')),
            h('li', null, t('pdf.redact.warn_unchanged') + (opts.stripMeta ? ' ' + t('pdf.redact.warn_meta') : '')))),
        buttons: [{ label: t('menu.cancel') }, { label: t('pdf.redact.redact_btn'), primary: true, danger: true }] });
    });
    return ask.then(function (ok) {
      if (!ok) return false;
      return S.guarded(t('pdf.redact.redacting'), async function (prog) {
        var r = await E.applyRedactions({ dpi: opts.dpi, stripMeta: opts.stripMeta, onProgress: function (f) { prog(f, t('pdf.redact.redacting_pct', { pct: Math.round(f * 100) })); } });
        A.announce(t('pdf.redact.done', areasOn(r.marks, r.pages)));
        SlopUI.toast(t('pdf.redact.applied'));
        return true;
      }).then(function (v) { return !!v; });
    });
  };
  // Downloads never include unapplied marks: offer to apply them first.
  var download = A.download;
  A.download = function () {
    var n = R.pending().length, args = arguments;
    if (!n) return download.apply(A, args);
    return SlopUI.confirm(t('pdf.redact.unapplied_title'), t('pdf.redact.unapplied_body', { n: n }), t('pdf.redact.apply_download'), { danger: true })
      .then(function (ok) { return ok ? A.applyRedactions(true).then(function (done) { return done ? download.apply(A, args) : null; }) : null; });
  };
  A.gotoMark = function (pid, aid) {
    if (A.tool !== 'redact') A.setTool('redact');
    A.openPage(pid, true);
    if (aid) { Ed.setTool('select'); Ed.select(aid); }
  };
  A.removeMarks = function (pid, aid) {
    E.commit(t(aid ? 'pdf.redact.remove_mark_cmd' : 'pdf.redact.remove_all_cmd'), function (st) {
      st.pages.forEach(function (p) { if (!pid || p.id === pid) p.annots = p.annots.filter(function (a) { return a.type !== 'redact' || (aid && a.id !== aid); }); });
    });
  };

  /* -------------------------------------------------------------- panel */
  P.PANELS.redact = {
    get title() { return t('pdf.redact.title'); }, icon: 'redact', build: function (b) {
      var np = K.needPages(); if (np) { b.appendChild(np); return; }
      b.appendChild(section(t('pdf.redact.sec_mark'), [note(t('pdf.redact.mark_note')),
        h('div', { class: 'btn-row' }, btn(t('pdf.redact.draw_btn'), 'redact', function () { A.ensurePage(); Ed.setTool('redact'); }, 'primary'))]));

      var q = K.text(opts.text, function (v) { opts.text = v; }, t(opts.regex ? 'pdf.redact.ph_regex' : 'pdf.redact.ph_words'));
      q.setAttribute('aria-label', t('pdf.redact.find_aria'));
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); A.findRedactions(); } });
      var presets = h('div', { class: 'rd-presets' }, Object.keys(R.PRESETS).map(function (id) {
        return check(R.PRESETS[id].label, opts.presets.indexOf(id) >= 0, function (on) { opts.presets = opts.presets.filter(function (x) { return x !== id; }); if (on) opts.presets.push(id); });
      }));
      var found = h('div', { class: 'rd-found' });
      b.appendChild(section(t('pdf.redact.sec_find'), [q,
        h('div', { class: 'rd-opts' }, seg([['text', U.esc(t('pdf.redact.mode_text'))], ['regex', U.esc(t('pdf.redact.mode_regex'))]], opts.regex ? 'regex' : 'text', function (v) { opts.regex = v === 'regex'; q.placeholder = t(opts.regex ? 'pdf.redact.ph_regex' : 'pdf.redact.ph_words'); }, t('pdf.redact.mode_aria')),
          check(t('pdf.redact.match_case'), opts.matchCase, function (v) { opts.matchCase = v; })),
        presets,
        h('div', { class: 'btn-row' }, btn(t('pdf.redact.find_btn'), 'zoomin', function () { A.findRedactions(); }, 'wide')), found]));

      var review = h('div', { class: 'rd-review' });
      b.appendChild(section(t('pdf.redact.sec_marked'), [review]));

      var dpiSel = select([[150, t('pdf.redact.dpi_150')], [200, t('pdf.redact.dpi_200')], [300, t('pdf.redact.dpi_300')]], opts.dpi, function (v) { opts.dpi = +v; U.store.set('redactDpi', +v); });
      var applyBtn = btn(t('pdf.redact.apply_btn'), 'redact', function () { A.applyRedactions(); }, 'primary danger wide');
      b.appendChild(section(t('ui.apply'), [K.row(t('pdf.redact.quality'), dpiSel),
        check(t('pdf.redact.strip_meta'), opts.stripMeta, function (v) { opts.stripMeta = v; }),
        h('div', { class: 'btn-row' }, applyBtn),
        note(t('pdf.redact.apply_note'))]));

      K.onRefresh(function () {
        found.innerHTML = '';
        if (results.length) {
          var on = results.filter(function (m) { return m.on; }).length;
          var list = h('div', { class: 'rd-items' }, results.map(function (m) {
            var c = h('input', { type: 'checkbox', checked: m.on, 'aria-label': t('pdf.redact.include_aria', { n: String(m.index + 1) }) });
            c.addEventListener('change', function () { m.on = c.checked; P.refresh('redact'); });
            return h('label', { class: 'rd-item' }, c, h('span', { class: 'rd-pg' }, t('pdf.redact.page_short', { n: String(m.index + 1) })), h('span', { class: 'rd-txt' }, clip(m.text, 40)));
          }));
          found.append(note(t('pdf.redact.matches_found', { n: results.length })), list,
            h('div', { class: 'btn-row' }, btn(t('pdf.redact.mark_n', { n: on }), 'redact', function () { A.markFound(); }, 'primary'), btn(t('pdf.redact.clear'), 'close', function () { results = []; P.refresh('redact'); })));
        }
        var pend = R.pending();
        review.innerHTML = '';
        applyBtn.disabled = !pend.length;
        if (!pend.length) { review.appendChild(note(t('pdf.redact.nothing_yet'))); return; }
        review.appendChild(note(t('pdf.redact.review_count', areasOn(pend.length, pagesWith()))));
        review.appendChild(h('div', { class: 'rd-items' }, pend.map(function (x) {
          var go = h('button', { type: 'button', class: 'rd-go', title: t('pdf.redact.show_on_page') }, h('span', { class: 'rd-pg' }, t('pdf.redact.page_short', { n: String(x.index + 1) })), h('span', { class: 'rd-txt' }, x.a.label ? '“' + clip(x.a.label, 34) + '”' : t('pdf.redact.drawn_box')));
          go.addEventListener('click', function () { A.gotoMark(x.p.id, x.a.id); });
          var del = h('button', { type: 'button', class: 'rd-x', title: t('pdf.redact.remove_mark'), 'aria-label': t('pdf.redact.remove_mark_aria', { n: String(x.index + 1) }), html: U.icon('close') });
          del.addEventListener('click', function () { A.removeMarks(x.p.id, x.a.id); });
          return h('div', { class: 'rd-item' }, go, del);
        })), h('div', { class: 'btn-row' }, btn(t('pdf.redact.remove_all'), 'trash', function () { SlopUI.confirm(t('pdf.redact.remove_all'), t('pdf.redact.remove_all_body'), t('ui.remove'), { danger: true }).then(function (ok) { if (ok) A.removeMarks(null, null); }); }, 'danger-text')));
      });
    }
  };
  // the panel is built once per show: build it again in the new language
  U.onLang(function () { if (A.tool === 'redact' && P.rebuild) P.rebuild(); });
})();
