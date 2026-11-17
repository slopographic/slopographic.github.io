/* Slop Docs — ui/panel: the Document panel on the right, the suite rule (shared/frame/HANDOFF.md). It holds what the File
 * and Format menus already do for the whole document (the same functions: one source of truth): new and open, the page
 * (header and footer, fonts, print), downloads and Send to…; Save, the main button, and Download PDF sit in its footer
 * (the shared footer, shared/frame/panel.js). Its edge resizes it (shared/ui/resize-panel.js, kept in the settings
 * store); a top-bar button, View ▸ and Ctrl+Alt+B (the command docs.panel) hide and show it, remembered. On a phone
 * (640 px and under) it is a bottom sheet (shared/ui/sheet.js) whose closed state still shows the footer. Classic script. */
(function () {
  'use strict';
  const S = window.SlopDocs, $ = (id) => document.getElementById(id);
  const app = $('app'), el = $('docPanel'), PHONE = '(max-width: 640px)', KEY = 'slop-docs-panel';
  if (!S || !app || !el || !window.SlopFramePanel) return;
  const later = (fn) => () => { fn(); if (S.focusIme) S.focusIme(); };
  const ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M15 4.5v15"/></svg>';

  const t = S.t;
  const sheet = window.SlopSheet ? SlopSheet.attach({ root: app, panel: el, side: 'bottom', phone: PHONE, label: t('docs.app.document') }) : null;
  const p = SlopFramePanel.create(el, { title: t('docs.app.document') });
  const kinds = () => [['pdf', 'PDF (.pdf)'], ['docx', 'Word (.docx)'], ['md', 'Markdown (.md)'], ['txt', t('docs.panel.plain_text')], ['sdoc', 'Slop Doc (.sdoc)']];
  /** The sections and the footer, in the language of the moment (drawn again after a language switch). */
  function draw() {
    p.setTitle(t('docs.app.document'));
    p.render([
      { key: 'file', title: t('menu.file'), actions: [
        { id: 'dp-new', label: t('docs.panel.new'), menu: () => [{ label: t('docs.menu.blank'), act: later(() => S.newDoc()) }, { label: t('docs.menu.random'), act: () => S.random.open() }] },
        { id: 'dp-open', label: t('docs.menu.open_drive'), run: later(() => S.openFromDrive()), disabled: !window.SlopHub },
      ] },
      { key: 'page', title: t('docs.panel.page'), actions: [
        { id: 'dp-hf', label: t('docs.menu.header_footer'), run: () => S.openHF() },
        { id: 'dp-fonts', label: t('docs.tb.fonts_dots'), run: () => $('tbFonts').click() },
        { id: 'dp-print', label: t('docs.menu.print'), run: later(() => S.print()) },
      ] },
      { key: 'out', title: t('docs.panel.download_send'), actions: [
        { id: 'dp-dl', label: t('ui.download'), menu: () => kinds().map(([k, l]) => ({ label: l, act: later(() => S.download(k)) })) },
        { id: 'dp-send', label: t('docs.panel.send_to'), menu: () => (S.sendItems ? S.sendItems() : []), empty: t('docs.panel.no_apps'), disabled: !window.SlopHub },
      ] },
    ]);
    p.footer([{ el: $('btnSave'), primary: true }, { id: 'dp-pdf', label: 'PDF', title: t('docs.menu.dl_pdf'), run: later(() => S.download('pdf')) }],
      { more: t('docs.app.document'), onMore: () => sheet && sheet.toggle() });
  }
  draw();

  // The width: dragged on the inner edge, kept per app in the settings store
  if (window.SlopResizePanel) {
    SlopResizePanel.attach(el, { app: 'docs', id: 'doc-panel', edge: 'start', width: 212, min: 190, max: 420, phone: PHONE, label: t('docs.app.document'),
      apply: (px) => { if (px != null) app.style.setProperty('--dp-w', px + 'px'); } });
  }
  // Shown or hidden on a wide screen (remembered); on a phone the button opens the sheet
  let shut = false;
  try { shut = localStorage.getItem(KEY) === 'shut'; } catch (e) { /* not kept */ }
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'tb'; btn.id = 'btnPanel'; btn.innerHTML = ICON;
  const words = () => { btn.setAttribute('aria-label', t('docs.panel.toggle')); btn.title = t('docs.panel.toggle_tip'); };
  words();
  const paint = () => { app.classList.toggle('dp-shut', shut); btn.setAttribute('aria-pressed', String(!shut)); };
  function toggle() {
    if (sheet && sheet.isPhone()) { sheet.toggle(); return; }
    shut = !shut; paint();
    try { localStorage.setItem(KEY, shut ? 'shut' : 'open'); } catch (e) { /* not kept */ }
  }
  btn.addEventListener('click', toggle);
  const save = $('btnCmd') || $('docName');
  if (save && save.closest('.topbar')) save.closest('.topbar').append(btn);
  paint();
  const register = () => { if (window.SlopCmd) SlopCmd.register([{ id: 'docs.panel', title: t('docs.cmd.panel'), group: t('docs.cmd.group_view'), keys: ['Mod+Alt+B'],
    keywords: ['panel', 'sidebar', 'document', 'side'], checked: () => !shut, run: toggle }]); };
  register();
  S.onLang(() => { draw(); words(); register(); });
  S.panel = { el, sheet, toggle, shown: () => !shut };
})();
