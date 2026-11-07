/* Slop EML: the actions the buttons, the menus and the commands share: open, print, convert to PDF,
 * combine, open in Slop PDF. Classic script;
 * exposes window.EmlActions. Each one works on the message on screen (EmlApp.current()). */
(function () {
  'use strict';
  const A = (window.EmlActions = {});
  const app = () => window.EmlApp;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const toast = (msg, ms, action) => window.SlopUI.toast(msg, ms, action);

  /** Open messages… (Ctrl+O, the Open buttons): a source of the one intake (main.js). */
  A.pick = () => window.SlopIntake.pick({ to: 'eml', accept: '.eml,.mbox,.mbx,message/rfc822,application/mbox' });

  /** Print: the message's headers and body in a print window, with print styles only (no toolbar, no tabs). The window
   *  holds the same policy as the preview (no scripts, no network), so the mail cannot run or load anything. */
  A.print = function () {
    const doc = app().current();
    if (!doc) return;
    const w = window.open('', '_blank');
    if (!w) { toast(t('eml.toast.popups'), 6000); return; }
    const html = window.EmlFrame.printable(doc.msg, doc.summary, doc.view);
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { toast(t('eml.toast.print_failed'), 5000); } }, 250);
  };

  /** Convert to PDF: the Export dialog with PDF chosen, for this message (or the ticked ones). */
  A.convertPdf = function () {
    if (!app().current() && !app().checkedDocs().length) return;
    window.EmlExport.dialog({ format: 'pdf' });
  };
  /** The PDF of one message, downloaded (the options of the dialog). */
  A.savePdf = (doc, withAttachments, append) => window.EmlExport.run('pdf', [doc], { attachments: withAttachments !== false, append: !!append });
  /** Combine: the ticked messages (or all shown), oldest first, into one PDF with a contents page. */
  A.combine = function () {
    const docs = window.EmlExport.scope('checked');
    if (docs.length < 2) { window.EmlExport.dialog({ format: 'pdf', scope: 'all' }); return null; }
    return window.EmlExport.run('pdf', docs, { attachments: true });
  };
  /** Open in Slop PDF: the PDF of the ticked messages (two or more) or of this one, put in Slop Drive and opened there. */
  A.openInPdf = function () {
    const picked = app().checkedDocs();
    const docs = picked.length > 1 ? picked : window.EmlExport.scope('current');
    if (!docs.length) { toast(t('eml.toast.open_first')); return null; }
    return window.EmlExport.toApp('pdf', 'pdf', docs, { attachments: true });
  };
})();
