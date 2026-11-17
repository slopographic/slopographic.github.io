/* Slop Docs — ui/menus: the File, Edit, Format and Help menus in the top bar (SlopUI.menu). Every row is an action
 * from the command list, so the menu, the toolbar and the palette stay the same. Classic script. */
(function () {
  'use strict';
  const S = window.SlopDocs;
  const key = (id) => (window.SlopCmd ? window.SlopCmd.keyFor(id) : '');
  /** Run fn, then give focus back to the typing surface. */
  const act = (fn) => () => { try { fn(); } catch (e) { console.error(e); } if (S.focusIme) S.focusIme(); };
  const A = () => S.A;
  const t = S.t;
  /** The saved templates, for File ▸ New ▸ My templates (the list is loaded by templates.js). */
  const mine = () => (S.tplList.length
    ? S.tplList.map((tpl) => ({ label: tpl.name, act: act(() => S.random.useDoc(tpl.doc)) }))
    : [{ label: t('docs.menu.no_templates'), disabled: true }]);

  S.menus = {
    file: () => [
      window.SlopDocsConfig ? window.SlopDocsConfig.menu() : null, '-',
      { label: t('docs.menu.new'), sub: [
        { label: t('docs.menu.blank'), key: key('file.new'), act: act(() => S.newDoc()) },
        { label: t('docs.menu.random'), key: key('file.random'), act: () => S.random.open() },
        '-',
        { label: t('docs.menu.my_templates'), sub: mine() },
      ] },
      { label: t('docs.menu.open_drive'), key: key('file.open'), act: act(() => S.openFromDrive()), disabled: !window.SlopHub },
      { label: t('docs.menu.import_drive'), act: act(() => S.importFromDrive()), disabled: !window.SlopHub },
      '-',
      { label: t('docs.menu.save_drive'), key: key('file.save'), act: act(() => S.save()) },
      '-',
      { label: t('docs.menu.dl_pdf'), key: key('file.pdf'), act: act(() => S.download('pdf')) },
      { label: t('docs.menu.dl_docx'), key: key('file.docx'), act: act(() => S.download('docx')) },
      { label: t('docs.menu.dl_md'), key: key('file.md'), act: act(() => S.download('md')) },
      { label: t('docs.menu.dl_txt'), key: key('file.txt'), act: act(() => S.download('txt')) },
      { label: t('docs.menu.dl_sdoc'), act: act(() => S.download('sdoc')) },
      '-',
      { label: t('docs.menu.send_to'), sub: S.sendItems ? S.sendItems() : [], disabled: !window.SlopHub },
      '-',
      { label: t('docs.menu.print'), key: key('file.print'), act: act(() => S.print()) },
    ],
    edit: () => [
      { label: t('ui.undo'), key: key('edit.undo'), act: act(() => A().undo()), disabled: !S.canUndo() },
      { label: t('ui.redo'), key: key('edit.redo'), act: act(() => A().redo()), disabled: !S.canRedo() },
      '-',
      { label: t('docs.menu.select_all'), key: key('edit.selectAll'), act: act(() => A().selectAll()) },
    ],
    format: () => {
      const st = A().state();
      return [
        { fid: 'bold', label: t('docs.tb.bold'), key: key('format.bold'), check: st.b, act: act(() => A().toggle('b')) },
        { fid: 'italic', label: t('docs.tb.italic'), key: key('format.italic'), check: st.i, act: act(() => A().toggle('i')) },
        { fid: 'underline', label: t('docs.tb.underline'), key: key('format.underline'), check: st.u, act: act(() => A().toggle('u')) },
        '-',
        { fid: 'align', label: t('docs.menu.align'), sub: [
          { label: t('docs.menu.left'), check: st.align === 'left', act: act(() => A().setAlign('left')) },
          { label: t('docs.menu.centre'), check: st.align === 'center', act: act(() => A().setAlign('center')) },
          { label: t('docs.menu.right'), check: st.align === 'right', act: act(() => A().setAlign('right')) },
          { label: t('docs.menu.justify'), check: st.align === 'justify', act: act(() => A().setAlign('justify')) },
        ] },
        { fid: 'list', label: t('docs.menu.list'), sub: [
          { label: t('docs.menu.bulleted'), key: key('format.bullets'), check: st.list === 'bul', act: act(() => A().toggleList('bul')) },
          { label: t('docs.menu.numbered'), key: key('format.numbers'), check: st.list === 'num', act: act(() => A().toggleList('num')) },
        ] },
        { fid: 'style', label: t('docs.tb.style'), sub: [
          ['Normal', 'normal'], ['Title', 'title'], ['H1', 'h1'], ['H2', 'h2'], ['H3', 'h3'], ['Quote', 'quote'], ['Code', 'code'],
        ].map(([v, l]) => ({ label: t('docs.style.' + l), check: st.style === v, act: act(() => A().setStyle(v)) })) },
        '-',
        { label: t('docs.menu.header_footer'), key: key('format.headerFooter'), act: () => S.openHF() },
        '-',
        { fid: 'clear', label: t('docs.tb.clear'), key: key('format.clear'), act: act(() => A().clearFormat()) },
      ];
    },
    help: () => [
      { label: t('docs.menu.search_cmds'), key: key('cmd.palette'), act: () => { if (window.SlopCmd) window.SlopCmd.open(); } },
      { label: t('docs.menu.keys'), act: () => { if (window.SlopCmd) window.SlopCmd.openKeymap(); } },
      '-',
      { label: t('docs.menu.about'), act: () => { if (window.SlopUI) SlopUI.alert('Slop Docs', t('docs.menu.about_body')); } }, // i18n-ignore: brand name
    ],
  };

  /** Open a menu under its button. */
  S.openMenu = function (name, anchor) {
    if (!window.SlopUI || !S.menus[name]) return;
    const r = anchor.getBoundingClientRect();
    anchor.setAttribute('aria-expanded', 'true');
    SlopUI.menu(S.menus[name](), r.left, r.bottom + 4);
    const off = () => { anchor.setAttribute('aria-expanded', 'false'); };
    setTimeout(() => { const m = document.querySelector('.sui-menu'); if (!m) off(); else { const mo = new MutationObserver(() => { if (!document.querySelector('.sui-menu')) { off(); mo.disconnect(); } }); mo.observe(document.body, { childList: true }); } }, 0);
  };
  S.wireMenus = function () {
    for (const b of document.querySelectorAll('.menu-btn[data-menu]')) {
      b.addEventListener('click', (e) => { e.preventDefault(); S.openMenu(b.dataset.menu, b); });
    }
  };
})();
