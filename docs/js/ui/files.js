/* Slop Docs — ui/files: Slop Drive (reading a record for the intake, ui/intake.js; Save and Ctrl+S), the saved templates store,
 * and exports (.sdoc, .docx, .pdf, .md, .txt). Classic script; window.SlopDocs.
 * Open tabs and their autosave are the tab strip's job (ui/tabs.js and shared/doctabs). Save and Open from Slop Drive
 * go through the strip, so each tab writes its own .sdoc (a native record is saved back under its own id). A Word,
 * Markdown or text file is imported as a new, unlinked tab: saving it creates a new .sdoc. */
(function () {
  'use strict';
  const S = window.SlopDocs;
  const E = () => window.SlopDocEngine;
  const H = () => window.SlopHub || null;
  const SD = () => E().SD, DX = () => E().DX;
  const SDOC_MIME = 'application/x-slop-doc', DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const toast = (m) => { if (window.SlopUI) SlopUI.toast(m); };

  /* ---------- IndexedDB 'slop-docs' (store 'templates'; 'drafts' is kept for old data and no longer written) ---------- */
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB is unavailable')); return; }
      const r = indexedDB.open('slop-docs', 2);
      r.onupgradeneeded = (e) => {
        // v1 had 'drafts' only; v2 (oldVersion < 2) adds 'templates'. Existing drafts are kept as they are.
        const d = r.result;
        if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts', { keyPath: 'key' });
        if ((e.oldVersion || 0) < 2 && !d.objectStoreNames.contains('templates')) d.createObjectStore('templates', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  function store(mode, fn, name = 'templates') {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(name, mode), req = fn(t.objectStore(name));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
  }
  /** My templates (IndexedDB 'slop-docs', store 'templates'). */
  S.tplStore = (mode, fn) => store(mode, fn, 'templates');

  /* ---------- reading ---------- */
  function htmlText(t) {
    const d = new DOMParser().parseFromString(t, 'text/html');
    const parts = [...d.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return parts.length ? parts.join('\n') : d.body.textContent;
  }
  /** A Drive record ({ blob, name, type, id, folderId, modified }) -> { doc, native }. native: a .sdoc, saved back to the same record. */
  async function readRecord(rec) {
    const name = rec.name || '', ext = ((/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '').toLowerCase(), blob = rec.blob;
    const native = ext === 'sdoc' || rec.type === SDOC_MIME;
    if (!blob || !blob.size) {
      if (native) return { doc: E().M.newDoc(), native: true };
      throw new Error(S.t('docs.file.empty'));
    }
    if (native) return { doc: SD().readSdoc(await blob.text()), native: true };
    if (rec.type === DOCX_MIME || ext === 'docx') return { doc: await DX().importDocx(blob), native: false };
    if (ext === 'md' || rec.type === 'text/markdown') return { doc: SD().fromMarkdown(await blob.text()), native: false };
    if (ext === 'html' || ext === 'htm' || rec.type === 'text/html') return { doc: SD().fromText(htmlText(await blob.text())), native: false };
    if ((rec.type || '').indexOf('text/') === 0 || ext === 'txt') return { doc: SD().fromText(await blob.text()), native: false };
    throw new Error(S.t('docs.file.cannot_open', { name: name || S.t('docs.file.this_file') }));
  }
  S.readRecord = readRecord;
  const baseName = (n) => String(n || S.untitled()).replace(/\.(sdoc|docx|md|txt|html?)$/i, '') || S.untitled();

  /* ---------- the URL: ?drive=<id> names the open document (the strip's activate keeps it set) ---------- */
  function setUrl(id) {
    try {
      const u = new URL(location.href);
      if (id) u.searchParams.set('drive', id); else u.searchParams.delete('drive');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* sandboxed */ }
  }
  S.setUrl = setUrl;

  /** Show a Drive record: a tab already showing it is brought forward, else it opens in a new tab. */
  S.openRecord = async function (rec, { silent = false } = {}) {
    const r = await readRecord(rec);
    const driveId = r.native ? rec.id : null;
    const open = driveId && S.tabsApi().tabs().find((t) => t.driveId === driveId);
    if (open) S.tabsApi().activate(open.doc);
    else {
      const file = { folderId: rec.folderId == null ? null : rec.folderId, name: r.native ? rec.name : baseName(rec.name) + '.sdoc', dirty: false, saved: 0 };
      S.tabsApi().openDoc(S.makeTab(r.doc, file), { driveId, origName: rec.name });
    }
    if (!silent) toast(r.native ? S.t('docs.file.opened', { name: baseName(rec.name) }) : S.t('docs.file.opened_new', { name: rec.name }));
    return r;
  };
  // Open, Import and ?drive= are sources of the one intake (ui/intake.js), whose reader is openRecord.

  S.confirmDiscard = async function () {
    if (!S.file.dirty || !window.SlopUI) return true;
    return SlopUI.confirm(S.t('docs.file.discard_title'), S.t('docs.file.discard_body'), S.t('docs.file.discard'), { danger: true });
  };

  /* ---------- saving ---------- */
  S.displayName = () => baseName(S.file.name);
  S.saveName = () => S.displayName() + '.sdoc';
  /** Save the open document to Slop Drive through the strip (the first save asks for a folder). Resolves true when saved. */
  let saving = false;
  S.save = async function () {
    if (!S.doc || saving || !S.tabsApi()) return false;
    saving = true;
    try {
      S.syncTab();
      return !!(await S.tabsApi().saveToDrive(S.tabsApi().current()));
    } catch (e) {
      toast(S.t('docs.file.save_failed', { error: e.message }));
      return false;
    } finally { saving = false; }
  };
  S.saveLabel = () => {
    const linked = !!S.driveId();
    if (S.file.dirty) return S.t(linked ? 'docs.save.unsaved' : 'docs.save.not_in_drive');
    return S.t(linked ? 'docs.save.saved' : 'docs.save.draft');
  };

  /* ---------- export ---------- */
  /** Blob for a format: sdoc, docx, pdf, md or txt. */
  S.exportBlob = async function (kind) {
    if (kind === 'docx') return DX().exportDocx(S.doc);
    if (kind === 'pdf') return S.pdfBlob();
    if (kind === 'md') return new Blob([SD().toMarkdown(S.doc)], { type: 'text/markdown' });
    if (kind === 'txt') return new Blob([SD().toText(S.doc)], { type: 'text/plain' });
    return SD().sdocBlob(S.doc);
  };
  S.download = async function (kind) {
    const blob = await S.exportBlob(kind), name = S.displayName() + '.' + kind;
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(S.t('docs.file.downloaded', { name }));
    SlopSupport.afterExport('docs');
  };
  /** "Send to…" menu rows for the other Slopographic apps: the one builder, SlopOuttake, with the document as DOCX. */
  S.sendItems = function () {
    if (!H() || !window.SlopOuttake) return [];
    return SlopOuttake.items({ get: () => S.exportBlob('docx'), name: () => S.displayName() + '.docx', type: DOCX_MIME, from: 'docs', verb: 'ui.outtake.send_to', folder: false });
  };
  /** Convert… in the header (shared/convert/provided.js): the open document, as DOCX. */
  addEventListener('slop:convert-files', (e) => e.detail.provide(async () => {
    if (!S.doc) return null;
    return [{ name: S.displayName() + '.docx', blob: new Blob([await S.exportBlob('docx')], { type: DOCX_MIME }) }];
  }));
})();
