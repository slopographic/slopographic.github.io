/* Slop PDF — the Watermark panel: the site's one watermark panel (shared/watermark/panel.js) on the document's watermark
   spec (stamps.wm): text and logo layers stacked bottom to top, the 3 by 3 position, size, opacity, rotation, tiling, the
   pages each layer covers, and My watermarks. Every change is one undo step (E.commit; a run of changes to one field is
   one step). A document from before the spec is shown through E.watermarkSpec and saved as a spec on its first change.
   Drawing: core/watermark-annots.js (the same layers on screen and in the exported file, as real text and images). */
(function () {
  'use strict';
  var SP = window.SP, t = SP.util.t, E = SP.engine, Ed = SP.editor, P = SP.panels, PANELS = P.PANELS, K = P.helpers;
  /** A new layer in Slop PDF starts as the usual document stamp: grey, across the middle of the page. */
  var NEW = { text: { text: 'CONFIDENTIAL', colour: '#888888', size: 0.1, opacity: 0.25, rotate: -45, position: 'mc', margin: 0, shadow: false },
    logo: { size: 0.3, opacity: 0.25, position: 'mc', margin: 0 } };
  function curPage() { var i = Ed.pid ? E.indexOf(Ed.pid) : 0; return (i < 0 ? 0 : i) + 1; }
  function commit(spec, how) {
    E.commit(how.label || t('pdf.tool.watermark.undo_change'), function (st) { st.stamps.wm = spec; delete st.stamps.watermarks; delete st.stamps.watermark; }, how.key || null);
  }

  PANELS.watermark = {
    get title() { return t('pdf.tool.watermark.title'); }, icon: 'watermark', build: function (b) {
      var np = K.needPages(); if (np) { b.appendChild(np); return; }
      var host = document.createElement('div');
      host.className = 'pdf-wm';
      b.appendChild(K.section(null, [host]));
      var panel = window.SlopWatermarkPanel.mount(host, {
        value: E.watermarkSpec(), onChange: commit, media: { pages: true, time: false },
        pageCount: function () { return E.state.pages.length; }, currentPage: curPage,
        newLayer: function (kind) { return NEW[kind] || null; },
        intake: 'pdf.logo',   // the logo part of the page's intake
        onFiles: function (files) { SlopIntake.take(files, { to: 'pdf', source: 'drop' }); }   // a PDF dropped on the panel opens as usual
      });
      b.appendChild(K.note(t('pdf.tool.watermark.note')));
      K.onRefresh(function () { panel.set(E.watermarkSpec()); });
    }
  };
})();
