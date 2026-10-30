/* Slop EML: the side panel (SlopFrame's panel, shared/frame/panel.js). It follows what is chosen:
 *   one message: its details (from, to, date, size, file), its attachments (each opens a preview, with Save and Open in ▾),
 *                and its actions (Export ▾, Open in Slop PDF, Print, Convert to PDF…, Pin as a tab, Close);
 *   two or more ticked: "N selected" with Combine into one PDF, Export ▾, Save attachments (ZIP), Export list (CSV),
 *                Open in Slop PDF and Clear selection.
 * Every action is the same one the File menu and the commands run (EmlActions, EmlExport). Classic script; window.EmlSide. */
(function () {
  'use strict';
  const S = (window.EmlSide = {});
  const A = () => window.EmlApp, X = () => window.EmlExport, ACT = () => window.EmlActions;
  let panel = null;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const size = (n) => (window.SlopHub ? window.SlopHub.fmtSize(n) : n + ' B');
  // dates in the page's language (shared/i18n), else the browser's
  const fmt = (x, o) => (window.SlopI18n ? window.SlopI18n.date(new Date(x), o) : new Date(x).toLocaleString(undefined, o));
  const when = (tm, raw) => (tm == null ? raw || '' : fmt(tm, { dateStyle: 'medium', timeStyle: 'short' }));

  S.init = function (el) { panel = window.SlopFrame.panel(el, { title: t('eml.side.message') }); };

  function attachments(doc) {
    const atts = doc.msg.attachments;
    return {
      title: t('eml.side.attachments_n', { n: atts.length }), key: 'atts', empty: t('eml.side.no_atts'),
      list: atts.map((a, i) => ({
        name: a.name, meta: [window.EmlBatch.typeOf(a.name, a.type), size(a.size), a.inline ? t('eml.side.inline') : '', a.malformed ? t('eml.side.malformed') : ''].filter(Boolean).join(' · '),
        title: t('eml.side.preview', { name: a.name }), open: () => window.EmlPreview.open(doc, i),
        actions: [
          { label: t('eml.side.save'), aria: t('eml.side.save_name', { name: a.name }), run: () => window.EmlView.saveAttachment(doc, i) },
          { label: t('eml.side.open_in'), aria: t('eml.side.open_in_name', { name: a.name }), menu: () => X().attachmentItems(doc, i).slice(1), empty: t('eml.side.no_app') },
        ],
      })),
      actions: atts.length > 1 ? [{ label: t('eml.side.save_all'), id: 'em-atts-zip', run: () => window.EmlView.downloadAll() }] : null,
    };
  }

  function one(doc) {
    const s = doc.summary;
    panel.setTitle(t('eml.side.message'));
    return [
      { title: t('eml.app.actions'), key: 'acts', actions: [
        { label: t('eml.side.export'), id: 'em-p-export', primary: true, menu: X().menu(() => [A().current()].filter(Boolean)) },
        { label: t('eml.side.to_pdf'), id: 'em-p-topdf', run: () => ACT().openInPdf() },
        { label: t('eml.side.print'), id: 'em-p-print', run: () => ACT().print() },
        { label: t('eml.side.convert'), id: 'em-p-convert', run: () => ACT().convertPdf() },
        { label: doc.pinned ? t('eml.side.unpin') : t('eml.side.pin'), id: 'em-p-pin', run: () => A().togglePin() },
        { label: t('eml.side.close'), id: 'em-p-close', run: () => A().close(doc.id) },
      ] },
      { title: t('eml.side.details'), key: 'details', rows: [[t('eml.head.from'), s.from], [t('eml.head.to'), s.to], [t('eml.head.cc'), s.cc], [t('eml.head.bcc'), s.bcc], [t('eml.head.date'), when(doc.time, s.date), s.date],
        [t('eml.side.size'), size(doc.size)], [t('eml.side.file'), doc.fromMbox ? doc.fromMbox : doc.name]] },
      attachments(doc),
    ];
  }

  function many(docs) {
    const tm = docs.map((d) => d.time).filter((x) => x != null);
    const n = docs.reduce((k, d) => k + d.msg.attachments.length, 0);
    panel.setTitle(t('eml.side.n_selected', { n: docs.length }));
    const day = (x) => fmt(x, { dateStyle: 'medium' });
    const span = tm.length ? day(Math.min(...tm)) + (day(Math.min(...tm)) !== day(Math.max(...tm)) ? ' – ' + day(Math.max(...tm)) : '') : '';
    return [
      { title: t('eml.app.actions'), key: 'acts-many', actions: [
        { label: t('eml.side.combine'), id: 'em-p-combine', primary: true, run: () => ACT().combine() },
        { label: t('eml.side.export'), id: 'em-p-export-many', menu: X().menu(() => A().checkedDocs()) },
        { label: t('eml.side.save_atts'), id: 'em-p-atts', disabled: !n, run: () => X().run('atts', A().checkedDocs()) },
        { label: t('eml.side.export_csv'), id: 'em-p-csv', run: () => X().run('csv', A().checkedDocs()) },
        { label: t('eml.side.to_pdf'), id: 'em-p-topdf-many', run: () => X().toApp('pdf', 'pdf', A().checkedDocs()) },
        { label: t('eml.side.clear_sel'), id: 'em-p-clear', run: () => A().checkAll(false) },
      ] },
      { title: t('eml.side.selection'), key: 'sel', rows: [[t('eml.app.messages'), String(docs.length)], [t('eml.side.dates'), span], [t('eml.side.attachments'), String(n)]] },
      { title: t('eml.side.combined'), key: 'note', note: t('eml.side.combined_note') },
    ];
  }

  S.render = function () {
    if (!panel) return;
    const app = A(), picked = app.checkedDocs(), cur = app.current();
    if (picked.length > 1) panel.render(many(picked));
    else if (cur) panel.render(one(cur));
    else { panel.setTitle(t('eml.app.actions')); panel.render([{ title: t('eml.side.start'), key: 'Start', note: t('eml.side.start_note'), actions: [{ label: t('eml.side.open'), primary: true, run: () => ACT().pick() }] }]); }
  };
})();
