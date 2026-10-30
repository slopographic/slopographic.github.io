/* Slop Reports: the suite's layout (shared/frame/HANDOFF.md, "settings and the main button live in the right panel"). The
 * report is the view; the panel on the right holds the report picker (New, Edit, Delete), the definition while it is edited,
 * and Export CSV, the main button, at its foot. The panel is resized on its edge and kept, shown and hidden from the menu
 * bar's button (Ctrl+Alt+B); on a phone it is a bottom sheet whose footer (Report, Export CSV) stays on screen. Classic
 * script, after js/app.js and shared/frame. */
(function (g) {
  'use strict';
  if (!g.SlopFrame) return;
  const $ = (id) => g.document.getElementById(id);
  const R = g.SlopReports;
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const fr = g.SlopFrame.mount($('rpMain'), { view: $('rpView'), panel: $('rpPanel'), panelLabel: 'reports.page.report', storageKey: 'reports',
    button: '.smb-tools', phoneButton: false, width: 340, min: 280, max: 640 });
  const p = g.SlopFrame.panel($('rpPanel'), { title: t('reports.page.report') });
  const words = () => {
    p.setTitle(t('reports.page.report'));
    p.render([{ key: 'pick', settings: [$('rpPick')] }, { title: t('reports.lay.definition'), cls: 'rp-def', settings: [$('editor')] }]);
    p.footer([{ el: $('csv'), primary: true, title: t('reports.lay.csv_tip') }], { more: t('reports.page.report') });
  };
  words();
  if (g.SlopI18n) g.SlopI18n.on(words);
  // New report and Edit open the definition: on a phone the sheet opens with it
  for (const id of ['new', 'edit']) $(id).addEventListener('click', () => { if (fr.isPhone()) fr.openSheet(); });
  if (R) R.frame = fr;
})(window);
