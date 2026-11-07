/* Slop EML: messages as PDF. Classic script; exposes window.EmlPdf. The work is eml/js/pdf-out.js (an ES module, loaded on
 * first use), which lays the messages out with Slop Docs' engine, so text in every writing system is real text in the
 * PDF (language fonts download just in time, after asking). HTML layout and images of the body are not kept (Print keeps
 * them); the HTML body is reduced to text paragraphs with links as text.
 *   EmlPdf.build(doc, { attachments = true, append = false })  one message → Promise<{ bytes, pages, info, ... }>
 *   EmlPdf.combine(docs, { attachments, append, cover })       many messages, oldest first, each from a new page, with a
 *                                                               contents page → the same
 *   EmlPdf.fileName(doc)                                        the message's file name with .pdf
 *   EmlPdf.combinedName(docs)                                   "12 messages, 2024-03-01 to 2024-04-05.pdf" */
(function () {
  'use strict';
  const P = (window.EmlPdf = {});
  const out = () => import('./pdf-out.js');

  P.build = async function (doc, opts = {}) {
    return (await out()).build([doc], { cover: false, list: opts.attachments !== false, append: !!opts.append, order: false });
  };
  P.combine = async function (docs, opts = {}) {
    return (await out()).build(docs, { cover: opts.cover, list: opts.attachments !== false, append: !!opts.append, title: opts.title });
  };
  P.fileName = function (doc) {
    return window.EmlBatch.safeName(window.EmlApp.baseName(doc), 'message') + '.pdf';
  };
  P.combinedName = function (docs) {
    const B = window.EmlBatch, t = docs.map((d) => d.time).filter((x) => x != null);
    const span = t.length ? ', ' + B.isoDate(Math.min(...t)).slice(0, 10) + (Math.min(...t) === Math.max(...t) ? '' : ' to ' + B.isoDate(Math.max(...t)).slice(0, 10)) : '';
    return B.safeName(docs.length + ' messages' + span, 'messages') + '.pdf';
  };
})();
