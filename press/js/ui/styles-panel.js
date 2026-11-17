/* Slop Press — Paragraph Styles and Character Styles panels. Click applies (Alt-click clears overrides). */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, h = U.h, S = PR.state, ST = PR.styles, FM = PR.format, H = PR.history;
  var UI = PR.ui = PR.ui || {}, t = U.t;

  function build(kind) {
    return function (body, foot) {
      var doc = S.doc, cur = FM.current(), use = ST.usage(doc), list = h('div', { class: 'list', role: 'listbox', 'aria-label': t(kind === 'para' ? 'press.panel.parastyles' : 'press.panel.charstyles') });
      var curName = cur ? (kind === 'para' ? cur.ps : cur.cs) : null, ov = cur ? Object.keys(kind === 'para' ? cur.paraOv : cur.charOv).length > 0 : false;
      ST.names(doc, kind).forEach(function (n) {
        var st = doc.styles[kind][n] || {}, eff = kind === 'para' ? ST.para(doc, n) : ST.char(doc, n);
        var sample = h('span', { class: 'sname', style: { fontFamily: eff.font ? PR.fonts.family(eff.font).css : '', fontWeight: PR.fonts.isBold(eff.fontStyle) ? 700 : '', fontStyle: PR.fonts.isItalic(eff.fontStyle) ? 'italic' : '' } }, n);
        var edit = h('button', { type: 'button', class: 'sedit', title: t('press.panel.edit_style'), 'aria-label': t('press.panel.edit_style_name', { name: n }), html: PR.kit.icon('edit') });
        var row = h('div', { class: 'srow' + (curName === n ? ' on' : ''), role: 'option', tabindex: '0', 'aria-selected': String(curName === n), title: (st.basedOn ? t('press.panel.based_on', { name: st.basedOn }) + ' · ' : '') + t('press.panel.style_tip') },
          sample, curName === n && ov ? h('span', { class: 'plus', title: t('press.panel.local_overrides') }, '+') : null, h('span', { class: 'smeta' }, use[kind][n] || ''), /^\[/.test(n) && kind === 'char' ? null : edit);
        row.addEventListener('click', function (e) {
          if (e.target.closest('.sedit')) return;
          if (!FM.hasText()) { PR.util.toast(t('press.panel.select_text_first')); return; }
          if (kind === 'para') FM.paraStyle(n, e.altKey); else FM.charStyle(n);
        });
        row.addEventListener('dblclick', function () { UI.styleEditor(kind, n); });
        edit.addEventListener('click', function () { UI.styleEditor(kind, n); });
        row.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          var fixed = /^\[/.test(n);
          window.SlopUI.menu([{ label: t('press.panel.edit_name_dots', { name: n }), disabled: fixed && kind === 'char', act: function () { UI.styleEditor(kind, n); } },
            { label: t('press.panel.duplicate_style'), disabled: fixed && kind === 'char', act: function () { var nn = t('press.panel.style_copy', { name: n.replace(/^\[|\]$/g, '') }); while (doc.styles[kind][nn]) nn += '+'; doc.styles[kind][nn] = U.clone(doc.styles[kind][n]); ST.invalidate(); H.commit(t('press.panel.duplicate_style')); } },
            { label: t('press.panel.new_based_on', { name: n }), act: function () { UI.styleEditor(kind, null, n); } },
            { label: t('press.panel.redefine'), disabled: curName !== n || !ov, act: function () { FM.redefine(kind); } },
            '-', { label: t('press.panel.delete_style'), disabled: fixed, act: function () { ST.remove(doc, kind, n); H.commit(t('press.panel.delete_style')); } }], e.clientX, e.clientY);
        });
        list.append(row);
      });
      body.append(list);
      foot.append(h('span', { class: 'count' }, (curName ? curName + (ov ? '+' : '') : t('press.panel.no_text_sel'))),
        UI.footBtn('edit', t('press.panel.clear_overrides'), function () { FM.clearOverrides(); }),
        UI.footBtn('plus', t(kind === 'para' ? 'press.panel.new_para_style' : 'press.panel.new_char_style'), function () { UI.styleEditor(kind, null, curName && !/^\[None/.test(curName) ? curName : null); }));
    };
  }
  UI.panel({ id: 'parastyles', title: 'press.panel.parastyles_title', build: build('para') });
  UI.panel({ id: 'charstyles', title: 'press.panel.charstyles_title', build: build('char') });
  var soon = U.debounce(function () { UI.refreshPanels('parastyles'); UI.refreshPanels('charstyles'); }, 150);
  PR.on('commit', soon); PR.on('doc', soon); PR.on('textsel', soon); PR.on('select', soon);
})();
