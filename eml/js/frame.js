/* Slop EML: the documents the message body is shown in. Pure string building (no DOM). Classic script; exposes window.EmlFrame.
 *   esc(s)                       HTML-escapes text
 *   bodyHtml(msg, withCids)      the message's HTML body, ready for a frame: sanitised by SlopSanitize (shared/sanitize: no
 *                                scripts, handlers, frames, forms, meta refresh or script URLs; its <head> styles kept),
 *                                cid: images replaced by their attachments when withCids is set
 *   preview(inner)               the srcdoc for the preview iframe: no scripts, no network (the CSP below), white paper
 *   printable(msg, view)         a complete page for the print window: the headers, then the body (HTML or text), print CSS only
 * The page's Content-Security-Policy allows data: and blob: images and nothing else, so a remote image or a script in
 * the mail cannot load. The preview iframe also has sandbox without allow-scripts (see eml/js/view.js). Remote images stay
 * in the markup (the CSP blocks them, and the app says so); the print window has no sandbox, so the sanitiser is what keeps
 * script out of it. */
(function () {
  'use strict';
  const F = (window.EmlFrame = {});
  const M = window.EmlMime;
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  F.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  F.bodyHtml = function (msg, withCids) {
    const h = String(msg.html || '');
    return window.SlopSanitize.html(withCids ? M.embedCids(h, msg.cids).html : h, { urls: 'web', whole: true });
  };

  /** The policy: nothing from the network, images only as data: or blob:, styles only inline. Mail is laid out on white. */
  const CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; form-action 'none'";
  const SCREEN_CSS = 'html,body{margin:0;background:#fff;color:#111;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}' +
    'body{padding:16px;overflow-wrap:anywhere;word-break:break-word}img{max-width:100%;height:auto}table{max-width:100%}';

  function page(inner, css, base, title) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      (title ? '<title>' + F.esc(title) + '</title>' : '') +
      '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      (base ? '<base target="_blank">' : '') +
      '<style>' + css + '</style></head><body>' + inner + '</body></html>';
  }

  /** The srcdoc of the preview: the body only. The app draws the headers around it. */
  F.preview = function (inner) { return page(inner, SCREEN_CSS, true); };

  const PRINT_CSS = '@page{size:A4;margin:16mm}' +
    'html,body{margin:0;padding:0;background:#fff;color:#000;font:11pt/1.45 Helvetica,Arial,sans-serif}' +
    '.em-ph{border-bottom:1px solid #888;padding-bottom:8px;margin-bottom:14px}' +
    '.em-ph h1{font-size:15pt;margin:0 0 6px;overflow-wrap:anywhere}' +
    '.em-ph dl{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;margin:0;font-size:10pt}' +
    '.em-ph dt{font-weight:bold}.em-ph dd{margin:0;overflow-wrap:anywhere}' +
    'pre{white-space:pre-wrap;font:inherit;margin:0;overflow-wrap:anywhere}' +
    'img{max-width:100%;height:auto}table{max-width:100%}' +
    '@media print{.em-noprint{display:none!important}}';

  /** A printable page: headers and body. No toolbar, no tabs, no notices. Images embedded so the print keeps them. */
  F.printable = function (msg, summary, view) {
    const rows = [['From', summary.from], ['To', summary.to], ['Cc', summary.cc], ['Bcc', summary.bcc], ['Date', summary.date]]
      .filter((r) => r[1])
      .map((r) => '<dt>' + F.esc(r[0]) + '</dt><dd>' + F.esc(r[1]) + '</dd>').join('');
    const head = '<header class="em-ph"><h1>' + F.esc(summary.subject || '(no subject)') + '</h1><dl>' + rows + '</dl></header>';
    const useHtml = view === 'html' && msg.html != null;
    const body = useHtml ? F.bodyHtml(msg, true) : '<pre>' + F.esc(msg.text != null ? msg.text : '') + '</pre>';
    return page(head + body, PRINT_CSS, false, summary.subject || 'Message');
  };
})();
