/* SlopIsolate — the settings panel's header: "Settings", or "Editing 4 pictures" with two or more selected, and its menu
 * (Copy settings, Paste settings, Apply these settings to all, and with a selection the bulk actions of ui/bulk-act.js).
 * With a selection a line says that brush edits stay with each picture. panel.js puts these first in #props. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, h = U.h, t = U.t;
  const PH = CO.panelHead = {};

  PH.build = function (bind) {
    const title = h('h2', null, t('cutout.panel.settings'));
    const menu = h('button', { type: 'button', class: 'tb pp-menu', id: 'btnPanelMenu', 'aria-haspopup': 'menu', 'aria-label': t('cutout.panel.menu'), title: t('cutout.panel.menu_tip') });
    U.btnIcon(menu, 'more');
    menu.addEventListener('click', () => { const r = menu.getBoundingClientRect(); SlopUI.menu(CO.bulk.menuItems(), r.left, r.bottom + 2); });
    const head = h('div', { class: 'pp-title' });
    head.innerHTML = U.icon('sliders');
    head.append(title, menu);
    const none = h('button', { type: 'button', class: 'btn ghost sm', id: 'btnSelNone' }, t('ui.done'));
    none.title = t('cutout.panel.done_tip');
    none.addEventListener('click', () => CO.bulk.clear());
    const note = h('div', { class: 'pp-bulk', id: 'bulkNote', hidden: '' },
      h('span', null, t('cutout.panel.bulk_note')), none);
    bind(() => {
      const n = S.bulk() ? S.targets().length : 0;
      title.textContent = n ? t('cutout.panel.editing_n', { n }) : t('cutout.panel.settings');
      head.classList.toggle('bulk', !!n);
      note.hidden = !n;
    });
    return [head, note];
  };
})();
