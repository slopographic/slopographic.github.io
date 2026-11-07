/* Slop Drive — ui/viewer: Drive's side of SlopPreview. Images and PDFs are shown by the shared viewer (zoom, pan,
 * open in a new tab, download, share) in Quick look, the details panel and the columns alike. This file only gives the
 * viewer the file's blob URL and its PDF pages, rendered with the PDF.js path in core/thumbs.js. Classic script. */
'use strict';
(function (DR) {
  /** The width of a Quick look page at 100%: the window, at most 900 px. */
  const pageWidth = () => Math.min(900, innerWidth - 80);
  /** A viewer for a file (image or PDF). big: Quick look (every page, up to 20); otherwise the first page only.
   * sink: the array that keeps the object URL (the caller frees it). */
  /** The tabs of a PDF: its original, then each saved version (newest first). Each version has its PDF and its change list.
   * A document saved before versions existed has its one edited copy as a single version. */
  function tabsOf(r) {
    const p = r && r.meta && r.meta.pdf;
    if (!p || p.role === 'edited' || p.role === 'changes' || DR.kindOf(r) !== 'pdf') return [];
    let list = (p.versions && p.versions.length ? p.versions.slice() : (p.edited ? [{ edited: p.edited, changes: p.changes || null }] : []));
    const out = [];
    list.forEach((v, i) => {
      const ed = v.edited && DR.item('f:' + v.edited);
      if (!ed || !ed.blob) return;
      const ch = v.changes && DR.item('f:' + v.changes);
      const n = v.n || i + 1, when = v.at ? DR.fmtDate(v.at) : '';
      const name = DR.t('drive.pv.version_n', { n: String(n) });
      out.push({ label: when ? DR.t('drive.pv.version_at', { version: name, when }) : name, name, rec: ed, changes: ch && ch.blob ? ch : null, n });
    });
    out.reverse(); // newest first, after the original
    return [{ label: DR.t('drive.pv.original'), rec: r, changes: null }, ...out];
  }
  DR.viewerFor = function (r, big, sink) {
    const tabs = tabsOf(r);
    if (tabs.length > 1) return versionTabs(tabs, big, sink);
    return plainViewer(r, big, sink);
  };
  /** How many saved versions a PDF has (0 for anything else, and for the copies that are versions themselves). */
  DR.versionCount = function (r) {
    const p = r && r.meta && r.meta.pdf;
    if (!p || p.role === 'edited' || p.role === 'changes' || DR.kindOf(r) !== 'pdf') return 0;
    return p.versions && p.versions.length ? p.versions.length : (p.edited ? 1 : 0);
  };
  /** The tabs above a PDF's preview. A version with a change list also has a Preview | Changes switch. */
  function versionTabs(tabs, big, sink) {
    const wrap = document.createElement('div'), bar = document.createElement('div'), mode = document.createElement('div'), body = document.createElement('div');
    wrap.className = 'pv-versions';
    bar.className = 'pv-tabs'; bar.setAttribute('role', 'tablist');
    mode.className = 'pv-tabs pv-mode'; mode.setAttribute('role', 'tablist');
    body.className = 'pv-version-body';
    let current = 0, view = 'preview';
    const tabEls = tabs.map((t, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pv-tab'; b.setAttribute('role', 'tab'); b.textContent = t.label;
      b.addEventListener('click', () => { current = i; view = 'preview'; show(); });
      bar.append(b);
      return b;
    });
    const useBtn = document.createElement('button');
    useBtn.type = 'button'; useBtn.className = 'pv-tab'; useBtn.textContent = DR.t('drive.pv.use_version');
    useBtn.addEventListener('click', async () => {
      const t = tabs[current];
      useBtn.disabled = true;
      try {
        const orig = await window.SlopHub.get(tabs[0].rec.id);
        const done = await window.SlopVersions.restore(window.SlopHub, orig, t.rec.id);
        if (window.DR && DR.toast) DR.toast(DR.t('drive.pv.restored', { version: t.name, n: String(done.version) }));
      } catch (e) {
        if (window.DR && DR.toast) DR.toast(e.message || DR.t('drive.pv.restore_failed'));
      } finally { useBtn.disabled = false; }
    });
    const previewBtn = document.createElement('button'), changesBtn = document.createElement('button');
    previewBtn.type = changesBtn.type = 'button'; previewBtn.className = changesBtn.className = 'pv-tab';
    previewBtn.textContent = DR.t('drive.pv.preview'); changesBtn.textContent = DR.t('drive.pv.changes');
    previewBtn.addEventListener('click', () => { view = 'preview'; show(); });
    changesBtn.addEventListener('click', () => { view = 'changes'; show(); });
    mode.append(previewBtn, changesBtn, useBtn);
    const show = async () => {
      tabEls.forEach((b, j) => b.setAttribute('aria-selected', j === current ? 'true' : 'false'));
      const t = tabs[current];
      const hasChanges = !!t.changes;
      mode.hidden = false;
      changesBtn.hidden = !hasChanges;
      useBtn.hidden = current < 2; // the newest version (1) is already current; the Original is not a version
      if (!hasChanges) view = 'preview';
      previewBtn.setAttribute('aria-selected', view === 'preview' ? 'true' : 'false');
      changesBtn.setAttribute('aria-selected', view === 'changes' ? 'true' : 'false');
      body.replaceChildren(document.createTextNode(DR.t('drive.pv.loading')));
      if (view === 'changes' && t.changes) body.replaceChildren(await changeList(t.changes));
      else body.replaceChildren(plainViewer(t.rec, big, sink).el);
    };
    wrap.append(bar, mode, body);
    show();
    return { el: wrap };
  }
  /** The change list of a document as a readable list (each change: what, from, to). */
  async function changeList(rec) {
    let items = [];
    try { items = JSON.parse(await rec.blob.text()); } catch (e) { items = []; }
    if (!Array.isArray(items) || !items.length) {
      const pre = document.createElement('pre'); pre.className = 'pv-changes-raw'; pre.textContent = DR.t('drive.pv.no_changes');
      return pre;
    }
    const ul = document.createElement('ul'); ul.className = 'pv-changes';
    for (const c of items.slice(0, 200)) {
      const li = document.createElement('li');
      li.textContent = c && c.label ? `${c.label}: ${c.from ?? ''} → ${c.to ?? ''}` : JSON.stringify(c);
      ul.append(li);
    }
    return ul;
  }
  function plainViewer(r, big, sink) {
    const kind = DR.isAi(r) ? 'pdf' : DR.kindOf(r), blobUrl = URL.createObjectURL(r.blob); // an .ai file shows its PDF page
    sink.push(blobUrl);
    const o = { title: r.name, blobUrl, kind, chrome: false };
    if (kind === 'pdf') o.renderPages = () => pdfPages(r.blob, big);
    if (DR.isAi(r)) o.renderPages = () => DR.aiPdfBlob(r.blob).then((pdf) => (pdf ? pdfPages(pdf, big) : { pages: [], note: DR.t('drive.pv.ai_no_pdf') }));
    return window.SlopPreview.create(o);
  };
  /** The pages as canvases, each sized in CSS px (at 100%) and rendered at up to 2× for sharpness. */
  async function pdfPages(blob, big) {
    const doc = await DR.openPdf(blob);
    try {
      const n = big ? Math.min(doc.numPages, 20) : 1, base = big ? pageWidth() : 560, ratio = Math.min(2, devicePixelRatio || 1);
      const pages = [];
      for (let i = 1; i <= n; i++) {
        const c = await DR.renderPdfPage(doc, i, base * ratio);
        c.style.width = base + 'px';
        c.style.height = (base * c.height / c.width) + 'px';
        pages.push(c);
      }
      const note = doc.numPages > n ? DR.t(big ? 'drive.pv.pages_some_big' : 'drive.pv.pages_some', { n, total: doc.numPages }) : '';
      return { pages, note };
    } finally { doc.destroy(); }
  }
})(window.DR);
