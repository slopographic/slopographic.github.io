/* SlopFmpView.exporter(db, table, o): the Export button of one table, CSV and JSON. Its menu lists "Download CSV" and
   "Download JSON", then what the shared one-way-out builder (SlopOuttake.items, shared/intake/outtake.js) offers for each
   file: the apps that take it ("CSV in Slop Sheets") and Save to Slop Drive. The files are built when an item is chosen
   (db.csv(id), db.json(id)), not before. A page without SlopOuttake and SlopUI.menu gets two plain download buttons.
     o: { from? (the app id for SlopOuttake) }     → { el, destroy() }     Classic script, after view-util.js. */
(function () {
  'use strict';
  const V = window.SlopFmpView;
  const FORMATS = [
    { id: 'csv', label: 'CSV', ext: '.csv', type: 'text/csv', make: (db, table) => db.csv(table.id) },
    { id: 'json', label: 'JSON', ext: '.json', type: 'application/json', make: (db, table) => db.json(table.id) },
  ];
  const fileName = (table, f) => (String(table.name || 'table').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'table') + f.ext;
  const toast = (m) => { if (window.SlopUI && window.SlopUI.toast) window.SlopUI.toast(m); };

  /** Builds the file and saves it with the browser (a link to a blob URL, clicked). */
  async function download(db, table, f) {
    try {
      const blob = await f.make(db, table), name = fileName(table, f);
      if (window.SlopUI && window.SlopUI.download) { window.SlopUI.download(blob, name); return; }
      const url = URL.createObjectURL(blob), a = V.el('a', null, null, { href: url, download: name, rel: 'noopener' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { toast(V.tr('ui.fmp.export_failed', { error: (e && e.message) || String(e) })); }
  }

  V.exporter = function (db, table, o) {
    o = o || {};
    const W = V.words(), wrap = V.el('div', 'sfv-export');
    const OT = window.SlopOuttake, UI = window.SlopUI;
    const downloads = () => FORMATS.map((f) => ({ label: V.tr('ui.fmp.download', { format: f.label }), act: () => download(db, table, f), format: f.id }));
    if (!OT || !OT.items || !UI || !UI.menu) {
      // intake-ok: no outtake on this page, so the plain download of each format
      for (const f of FORMATS) {
        const b = V.el('button', 'sfv-btn', null, { type: 'button' });
        W.text(b, () => V.tr('ui.fmp.download', { format: f.label }));
        b.addEventListener('click', () => download(db, table, f));
        wrap.append(b);
      }
      return { el: wrap, destroy: () => W.destroy() };
    }
    const btn = V.el('button', 'sfv-btn sfv-btn-main', null, { type: 'button', 'aria-haspopup': 'menu' });
    W.text(btn, () => V.tr('ui.fmp.export'));
    W.attr(btn, 'title', () => V.tr('ui.fmp.export_title'));
    btn.addEventListener('click', () => {
      const out = [];
      for (const f of FORMATS) {
        const items = OT.items({ get: () => f.make(db, table), name: fileName(table, f), type: f.type, from: o.from, verb: ({ app }) => V.tr('ui.fmp.' + f.id + '_in', { app }) });
        // every format has its own Save to Slop Drive…: each says which file it saves
        for (const it of items) out.push(it.save ? Object.assign({}, it, { label: V.tr('ui.fmp.save_' + f.id) }) : it);
      }
      const r = btn.getBoundingClientRect();
      UI.menu(out.length ? [...downloads(), '-', ...out] : downloads(), r.left, r.bottom + 4);
    });
    wrap.append(btn);
    return { el: wrap, destroy: () => W.destroy() };
  };
})();
