/* Slop Docs — ui/intake: the one way files come in (shared/intake, spec 'docs'). File ▸ Open from Slop Drive (Ctrl+O),
 * Import Word, Markdown or text from Slop Drive, a drop on the page, ?drive=<id> (another app's Send to…, Drive's
 * Open with) and a PWA launch all call SlopIntake.take and reach one reader. A .sdoc from Slop Drive opens linked to its
 * record (Save writes back); Word, Markdown, text and HTML open as a new, unlinked document; mode 'import' opens even a
 * .sdoc unlinked. The reader waits for the tabs (main.js boot). Classic script, after files.js and tabs.js. */
(function () {
  'use strict';
  const S = window.SlopDocs, SI = window.SlopIntake;
  const SDOC_MIME = 'application/x-slop-doc', DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const IMPORT = [DOCX_MIME, 'text/markdown', 'text/plain', 'text/html'];
  const baseName = (n) => String(n || S.untitled()).replace(/\.(sdoc|docx|md|txt|html?)$/i, '') || S.untitled();
  let tabsReady = null, ready = null;
  /** Called by boot before the tabs come back; ready() once they have. */
  S.intakeWait = () => { tabsReady = new Promise((r) => { ready = r; }); return () => ready(); };

  async function read(file, ctx) {
    try { return await readOne(file, ctx); } catch (e) { if (window.SlopUI) SlopUI.toast(S.t('docs.file.open_failed', { error: e.message })); throw e; }
  }
  async function readOne(file, ctx) {
    const rec = ctx.drive ? Object.assign({}, ctx.drive.record, { blob: file }) : { name: file.name, type: file.type, blob: file };
    if (ctx.mode === 'import') {
      const r = await S.readRecord(rec);
      S.tabsApi().openDoc(S.makeTab(r.doc, { name: baseName(rec.name) + '.sdoc' }), { origName: rec.name });
      if (window.SlopUI) SlopUI.toast(S.t('docs.file.opened_new', { name: rec.name }));
    } else await S.openRecord(rec, { silent: ctx.source === 'launch' });
    return file.name;
  }
  SI.register({
    id: 'docs', process: read, toast: false, // the reader says what it opened, or why not
    accept: { types: [SDOC_MIME, ...IMPORT], exts: ['.sdoc', '.docx', '.md', '.txt', '.html', '.htm'], noun: 'a document', allowEmpty: true },
    before: () => tabsReady,
  });
  /** File ▸ Open from Slop Drive: a .sdoc, linked to its record. */
  S.openFromDrive = () => SI.fromDrive({ to: 'docs', accept: [SDOC_MIME], title: S.t('docs.file.open_title') });
  /** File ▸ Import: a Word, Markdown or text file from Slop Drive, as a new tab that is not linked to the file. */
  S.importFromDrive = () => SI.fromDrive({ to: 'docs', mode: 'import', accept: IMPORT, title: S.t('docs.file.import_title') });
  /** What the page was opened with; resolves true when a document opened. */
  S.launch = async () => { const r = await SI.launch({ to: 'docs' }); return !!(r && r.added && r.added.length); };
  SI.dropTarget(document.getElementById('stage'), { to: 'docs' });
})();
