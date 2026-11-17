/* Slop Press — Swatches panel: document colours (RGB or CMYK process), applied to fill/stroke or text. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, h = U.h, S = PR.state, H = PR.history, K = PR.kit;
  var UI = PR.ui = PR.ui || {};
  var target = 'fill', t = U.t;
  UI.panel({
    id: 'swatches', title: 'press.panel.swatches',
    build: function (body, foot) {
      var doc = S.doc;
      var seg = K.seg([['fill', t('press.ctl.fill')], ['stroke', t('press.ctl.stroke')]], target, function (v) { target = v; UI.refreshPanels('swatches'); });
      var none = h('button', { type: 'button', class: 'sw', title: t('ui.none'), style: { background: '#fff' } });
      none.classList.add('none');
      none.innerHTML = '<svg viewBox="0 0 10 10" style="width:100%;height:100%;display:block"><path d="M0 10L10 0" stroke="#e5484d" stroke-width="1.4"/></svg>';
      none.addEventListener('click', function () { UI.setPaint(target, null); });
      var grid = h('div', { class: 'swgrid' }, none);
      doc.swatches.forEach(function (sw, i) {
        var b = h('button', { type: 'button', class: 'sw' + (U.parseCMYK(sw.color) ? ' cmyk' : ''), title: sw.name + ' · ' + sw.color, 'aria-label': sw.name, style: { background: U.css(sw.color) } });
        b.addEventListener('click', function () { UI.setPaint(S.text ? 'fill' : target, sw.color); });
        b.addEventListener('dblclick', function () { editSwatch(i); });
        b.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          window.SlopUI.menu([{ label: t('press.panel.edit_name_dots', { name: sw.name }), act: function () { editSwatch(i); } },
            { label: t('press.panel.delete_swatch'), disabled: /^\[/.test(sw.name), act: function () { doc.swatches.splice(i, 1); H.commit(t('press.panel.delete_swatch')); UI.refreshPanels('swatches'); } }], e.clientX, e.clientY);
        });
        grid.append(b);
      });
      body.append(h('div', { class: 'swrow' }, h('span', { class: 'fl' }, t('press.panel.apply_to')), seg), grid, h('p', { class: 'tip' }, t('press.panel.swatches_tip')));
      foot.append(h('span', { class: 'count' }, t('press.panel.swatches_n', { n: doc.swatches.length })), UI.footBtn('plus', t('press.panel.new_swatch'), function () { editSwatch(-1); }));
    }
  });
  function editSwatch(i) {
    var doc = S.doc, sw = doc.swatches[i] || { name: t('press.panel.new_swatch_name'), color: '#2f6fed' };
    K.customColor(sw.color, function (c) {
      window.SlopUI.prompt(t(i < 0 ? 'press.panel.new_swatch_title' : 'press.panel.swatch_name'), t('press.style.name'), sw.name).then(function (name) {
        if (name == null) return;
        var rec = { name: name || t('press.panel.swatch_default'), color: c };
        if (i < 0) doc.swatches.push(rec);
        else {
          var old = sw.color; doc.swatches[i] = rec;
          // recolour objects that used the old swatch value
          PR.model.containers(doc).forEach(function (cn) { cn.items.forEach(function (it) { if (it.fill === old) it.fill = c; if (it.stroke === old) it.stroke = c; }); });
        }
        H.commit(t(i < 0 ? 'press.panel.new_swatch' : 'press.panel.edit_swatch')); UI.refreshPanels('swatches');
      });
    }, t(i < 0 ? 'press.panel.new_swatch_title' : 'press.panel.edit_swatch_title'));
  }
  PR.on('doc', function () { UI.refreshPanels('swatches'); });
})();
