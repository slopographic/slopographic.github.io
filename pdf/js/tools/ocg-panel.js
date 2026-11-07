/* Slop PDF — the PDF's own layers (optional content groups) in the Layers section, under the annotation layers: one row per
   layer of each file in the document, with show/hide (the page view, thumbnails, page images and the saved file's default
   view follow it) and Delete layer (its content leaves every page of the file). Both are undoable (io/ocg.js). The list is
   read with pdf.js once per file; the section draws again when it is in. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, X = SP.ocg, D = SP.dock, h = U.h, t = U.t;

  /** The files of the document's pages (each opened file once, in page order). */
  function files() {
    var seen = new Set(), out = [];
    // one entry per opened file: its derived copies (edits) have the same layers, shown and hidden together
    E.state.pages.forEach(function (p) { var f = p.f && E.files.get(p.f), r = f && X.root(f.id); if (f && !seen.has(r)) { seen.add(r); out.push(f); } });
    return out;
  }
  function row(f, g) {
    var off = X.hidden(f.id, g);
    var vis = h('button', { type: 'button', class: 'lyr-b lyr-vis' + (off ? ' off' : ''), 'data-key': 'ocv:' + g.name, 'aria-pressed': off ? 'false' : 'true',
      'aria-label': t(off ? 'pdf.tool.ocg.show_aria' : 'pdf.tool.ocg.hide_aria', { name: g.name }), title: t(off ? 'pdf.tool.ocg.show_tip' : 'pdf.tool.ocg.hide_tip'), html: U.icon('eye') });
    vis.addEventListener('click', function () { X.set(f.id, g.name, !off); });
    var del = h('button', { type: 'button', class: 'lyr-b lyr-del', 'data-key': 'ocd:' + g.name, 'aria-label': t('pdf.tool.ocg.delete_aria', { name: g.name }), title: t('pdf.tool.ocg.delete_tip'), html: U.icon('trash') });
    del.addEventListener('click', function () {
      SlopUI.confirm(t('pdf.tool.ocg.confirm_title', { name: g.name }), t('pdf.tool.ocg.confirm_msg'), t('pdf.tool.ocg.delete')).then(function (ok) {
        if (!ok) return;
        SP.app.busy(t('pdf.tool.ocg.busy'), 0);
        X.remove(f.id, g.name).then(function (done) {
          SP.app.busy(null);
          SlopUI.toast(done ? t('pdf.tool.ocg.deleted', { name: g.name }) : t('pdf.tool.ocg.failed'));
        });
      });
    });
    return h('li', { class: 'ocg' + (off ? ' is-off' : ''), 'data-ocg': g.name }, vis, h('span', { class: 'ocg-name', title: g.name }, g.name), del);
  }
  /** The PDF layers part of the Layers section. */
  SP.ocgPanel = function (body) {
    var list = files(), pending = list.filter(function (f) { return !X.cached(f); });
    pending.forEach(function (f) { X.list(f).then(function () { D.refresh(); }); });
    var withLayers = list.filter(function (f) { return (X.cached(f) || []).length; });
    if (!withLayers.length) return;
    var sec = h('div', { class: 'ocg-sec' }, h('h4', { class: 'lyr-group-h' }, t('pdf.tool.ocg.heading')));
    withLayers.forEach(function (f) {
      if (withLayers.length > 1) sec.appendChild(h('p', { class: 'ocg-file' }, f.name || t('pdf.tool.ocg.document')));
      sec.appendChild(h('ul', { class: 'ocg-list', 'aria-label': f.name ? t('pdf.tool.ocg.list_aria', { name: f.name }) : t('pdf.tool.ocg.list_aria_doc') }, X.cached(f).map(function (g) { return row(f, g); })));
    });
    sec.appendChild(h('p', { class: 'pp-hint' }, t('pdf.tool.ocg.hint')));
    body.appendChild(sec);
  };
})();
