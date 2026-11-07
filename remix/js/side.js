/* Reel Remix: the options panel on the right follows the suite rule (shared/frame/HANDOFF.md). Remix, the main button,
   and Export sit in the panel's footer (the shared footer, shared/frame/panel.js), always in reach while the options
   scroll; on a phone (900 px and under) the panel is a bottom sheet (shared/ui/sheet.js) whose closed state still shows
   that footer, and its Options button opens the whole sheet. The floating Remix button's job (always in reach, pulsing
   while clips wait) is now the footer's Remix button: it pulses the same way (fab.js). Exposes RM.side. */
(function () {
  'use strict';
  const RM = window.RM, $ = (id) => document.getElementById(id);
  const PHONE = '(max-width: 900px)', side = document.querySelector('.rm-side');
  if (!side || !window.SlopFramePanel) return;
  const sheet = window.SlopSheet ? SlopSheet.attach({ root: document.body, panel: side, side: 'bottom', phone: PHONE, label: RM.t('remix.page.options') }) : null;
  SlopFramePanel.create(side, { bare: true }).footer([
    { el: $('rm-remix'), primary: true, title: RM.t('remix.side.remix_tip') },
    { el: $('rm-export') },
  ], { more: RM.t('remix.page.options'), onMore: () => sheet && sheet.toggle() });
  $('rm-remix').dataset.i18nAttr = 'title:remix.side.remix_tip';
  side.querySelectorAll('.sf-foot-more').forEach((b) => { b.dataset.i18n = 'remix.page.options'; });
  RM.side = { sheet };
})();
