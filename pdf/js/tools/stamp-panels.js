/* Slop PDF — Page numbers panel (live preview, undoable). The Watermark panel is tools/watermark-panel.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, h = U.h, P = SP.panels, PANELS = P.PANELS, K = P.helpers;
  var t = U.t, section = K.section, row = K.row, btn = K.btn, seg = K.seg, select = K.select, num = K.num, text = K.text, slider = K.slider, colorPicker = K.colorPicker, check = K.check, note = K.note, needPages = K.needPages, onRefresh = K.onRefresh;
  PANELS.numbers = {
    get title() { return t('pdf.tool.numbers.title'); }, icon: 'numbers', build: function (b) {
      var np = needPages(); if (np) { b.appendChild(np); return; }
      var cur = E.state.stamps.pageNumbers;
      var o = Object.assign({ position: 'bottom-center', format: 'n', start: 1, size: 11, font: 'Helvetica', bold: false, color: '#111111', margin: 28, skipFirst: false }, cur || U.store.get('pnOpts', {}));
      function apply(label) { U.store.set('pnOpts', o); if (E.state.stamps.pageNumbers) E.commit(label || t('pdf.tool.numbers.undo_change'), function (st) { st.stamps.pageNumbers = Object.assign({}, o); }, 'pn'); }
      var posGrid = h('div', { class: 'pos-grid', role: 'radiogroup', 'aria-label': t('pdf.tool.numbers.position') });
      var POS = { 'top-left': 'pdf.tool.numbers.pos_top_left', 'top-center': 'pdf.tool.numbers.pos_top_center', 'top-right': 'pdf.tool.numbers.pos_top_right',
        'bottom-left': 'pdf.tool.numbers.pos_bottom_left', 'bottom-center': 'pdf.tool.numbers.pos_bottom_center', 'bottom-right': 'pdf.tool.numbers.pos_bottom_right' };
      Object.keys(POS).forEach(function (p) {
        var bt = h('button', { type: 'button', class: 'pos-b' + (o.position === p ? ' on' : ''), role: 'radio', 'aria-checked': o.position === p ? 'true' : 'false', 'aria-label': t(POS[p]), title: t(POS[p]) }, h('i'));
        bt.addEventListener('click', function () { o.position = p; U.$$('.pos-b', posGrid).forEach(function (x) { x.classList.toggle('on', x === bt); x.setAttribute('aria-checked', x === bt ? 'true' : 'false'); }); apply(); });
        posGrid.appendChild(bt);
      });
      b.appendChild(section(t('pdf.tool.numbers.position'), [posGrid]));
      b.appendChild(section(t('pdf.tool.numbers.format'), [
        row(t('pdf.tool.numbers.style'), select([['n', '1'], ['page', t('pdf.tool.numbers.fmt_page')], ['n-of', t('pdf.tool.numbers.fmt_n_of')], ['page-of', t('pdf.tool.numbers.fmt_page_of')], ['dash', '– 1 –']], o.format, function (v) { o.format = v; apply(); })),
        row(t('pdf.tool.numbers.start'), num(o.start, 0, 99999, 1, function (v) { o.start = Math.round(v); apply(); })),
        row(t('pdf.tool.numbers.size'), num(o.size, 5, 72, 1, function (v) { o.size = v; apply(); }), 'pt'),
        row(t('pdf.tool.numbers.font'), select([['Helvetica', 'Helvetica'], ['Times', 'Times'], ['Courier', 'Courier']], o.font, function (v) { o.font = v; apply(); })),
        row(t('pdf.tool.numbers.margin'), num(o.margin, 4, 144, 1, function (v) { o.margin = v; apply(); }), 'pt'),
        row(t('pdf.tool.numbers.colour'), colorPicker(o.color, function (v) { o.color = v; apply(); })),
        check(t('pdf.tool.numbers.bold'), o.bold, function (v) { o.bold = v; apply(); }),
        check(t('pdf.tool.numbers.skip_first'), o.skipFirst, function (v) { o.skipFirst = v; apply(); })]));
      var acts = h('div', { class: 'btn-row' });
      b.appendChild(section(null, [acts, note(t('pdf.tool.numbers.note'))]));
      onRefresh(function () {
        acts.innerHTML = '';
        if (E.state.stamps.pageNumbers) acts.append(btn(t('pdf.tool.numbers.remove'), 'trash', function () { SlopUI.confirm(t('pdf.tool.numbers.remove'), t('pdf.tool.numbers.remove_msg'), t('ui.remove'), { danger: true }).then(function (ok) { if (ok) E.commit(t('pdf.tool.numbers.remove'), function (st) { st.stamps.pageNumbers = null; }); }); }, 'danger-text'));
        else acts.append(btn(t('pdf.tool.numbers.add'), 'numbers', function () { U.store.set('pnOpts', o); E.commit(t('pdf.tool.numbers.add'), function (st) { st.stamps.pageNumbers = Object.assign({}, o); }); }, 'primary wide'));
      });
    }
  };

  /* -------------------------------------------------------------- forms */
})();
