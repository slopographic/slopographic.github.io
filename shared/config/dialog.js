/* SlopConfigDialog: the reusable "Import config…", "Export config…" and "Make one with AI…" dialogs, built on SlopUI.
 *   SlopConfigDialog.open('import' | 'export' | 'ai', { app })   or   SlopConfigDialog.menuItems({ app }) for a menu.
 * app defaults to SlopHub's app id. Needs shared/slopui.js and the shared/config scripts; dialog-ai.js adds the AI dialog.
 * Nothing is applied except a value that passed validation (io.js). Classic script, exposes window.SlopConfigDialog. */
(function (g) {
  'use strict';
  if (g.SlopConfigDialog) return;
  const C = g.SlopConfig, UI = () => g.SlopUI;

  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);   // dialog words: shared/i18n/ui/<code>/config.js
  /** The four actions' words (shared/i18n/ui/<code>/widgets.js): menu items read them when drawn, commands are retitled
   *  after a language change. */
  const WORDS = { export: 'ui.config.export_current', template: 'ui.config.export_template', import: 'ui.config.import', ai: 'ui.config.ask_ai' };
  const issued = new Map();   // command id → key, for the retitle
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(() => { for (const [id, key] of issued) { const c = g.SlopCmd && g.SlopCmd.get(id); if (c) c.title = tr(key); } });
  const appOf = (o = {}) => o.app || (g.SlopHub && g.SlopHub.self && g.SlopHub.self.app) || C.consts.SHARED_APP;
  const note = (msg) => { try { UI().toast(msg); } catch (e) { /* no toast layer on this page */ } };
  const errorList = (errors) => UI().el('ul', { class: 'sui-errors' },
    (errors || []).map((e) => UI().el('li', null, e.path ? `${e.path}: ${e.message}` : e.message)));

  /** Shows the outcome of an import or an apply. Success is a toast; anything else lists what was wrong. */
  function showResult(res, title = tr('ui.config.not_imported')) {
    if (!res || res.cancelled) return;
    if (res.ok) { note(tr('ui.config.applied', { name: res.value.name })); return; }
    const body = UI().el('div', null, UI().el('p', { class: 'sui-p' }, tr('ui.config.nothing_applied')), errorList(res.errors));
    UI().dialog({ title, body, buttons: [{ label: tr('menu.ok'), primary: true }] });
  }

  /* A config file comes in one way where the page has the intake (shared/intake): the part 'config' (From this computer…,
     From Slop Drive…, the dialog's zone, a .slop.json dropped anywhere on the page). Its reader checks and imports it. */
  const ACCEPT = '.json,.slop.json,application/json';
  const SI = () => (g.SlopIntake && g.SlopIntake.part ? g.SlopIntake : null);
  const part = () => SI().part({
    id: 'config', limit: 1,
    accept: (f) => /\.slop\.json$/i.test(f.name || '') || tr('ui.config.not_slop', { name: f.name || 'file' }),
    process: async (f, ctx) => { showResult(await C.importFile(f, { app: (ctx.data && ctx.data.app) || (zone && zone.dataset.app) || appOf() })); return f.name; },
  });
  async function runFile(app) {
    if (SI()) { await SI().pick({ to: part(), multiple: false, data: { app }, accept: ACCEPT }); return; }
    const files = await UI().pickFiles({ accept: ACCEPT }); // intake-ok: a page without shared/intake
    if (files && files[0]) showResult(await C.importFile(files[0], { app }));
  }
  function runDrive(app) {
    if (SI()) return SI().fromDrive({ to: part(), data: { app }, accept: ['application/json', 'text/plain'], title: tr('ui.config.from_drive_title') });
    return C.importFromDrive({ app }).then((res) => showResult(res)); // intake-ok: a page without shared/intake
  }

  /** The import dialog's drop zone: one SlopDrop instance (shared/drop), moved into each dialog that opens. A .slop.json
   *  file dropped on it, or chosen there, is checked and imported. Null when the page has no SlopDrop. */
  let zone = null;
  function importZone() {
    if (!g.SlopDrop || !SI()) return null;
    if (!zone) {
      zone = document.createElement('div');
      zone.className = 'sd-config-zone';
      g.SlopDrop.attach(zone, { intake: part(), compact: true, window: false, overlay: false, data: () => ({ app: zone.dataset.app }) });
    }
    return zone;
  }

  /** "Import config…": a file from this computer, or from Slop Drive. The file is checked before anything changes. */
  function importDialog(o = {}) {
    const app = appOf(o);
    const kids = [UI().el('p', { class: 'sui-p' }, tr('ui.config.import_body'))];
    const z = importZone();
    if (z) { z.dataset.app = app; kids.push(z); }
    const body = UI().el('div', null, ...kids);
    UI().dialog({
      title: o.title || tr('ui.config.import_title'), body,
      buttons: [
        { label: tr('menu.cancel') },
        { label: tr('ui.config.from_drive'), act: () => { runDrive(app); } },
        { label: tr('ui.config.from_computer'), primary: true, act: () => { runFile(app); } },
      ],
    });
  }

  /** "Export config…": pick a kind the app can export, name it, and download <name>.slop.json. */
  function exportDialog(o = {}) {
    const app = appOf(o);
    const choices = C.kinds(app).filter((e) => e.read);
    if (!choices.length) { note(tr('ui.config.nothing_export')); return; }
    const sel = UI().select(choices.map((e) => [e.kind, e.label]), choices[0].kind);
    const name = UI().el('input', { class: 'sui-input', type: 'text', value: `${app}-${choices[0].kind}`, maxlength: 120 });
    const desc = UI().el('input', { class: 'sui-input', type: 'text', placeholder: tr('ui.config.optional'), maxlength: 1000 });
    const body = UI().el('div', null, UI().field(tr('ui.config.kind'), sel), UI().field(tr('ui.config.name'), name), UI().field(tr('ui.config.description'), desc));
    UI().dialog({
      title: o.title || tr('ui.config.export_title'), body,
      buttons: [
        { label: tr('menu.cancel') },
        { label: tr('menu.export'), primary: true, act: async () => {
          try {
            const file = await C.exportKind(sel.value, app, name.value.trim() || 'config', { description: desc.value.trim() || undefined });
            UI().download(file, file.name);
          } catch (e) { note(tr('ui.config.export_failed', { err: e.message })); return false; }
        } },
      ],
    });
  }

  /** The AI dialog is in dialog-ai.js; it sets makeAi when loaded. */
  function aiDialog(o = {}) {
    if (!api.makeAi) { note(tr('ui.config.no_ai')); return; }
    api.makeAi({ ...o, app: appOf(o) });
  }

  function open(which, o = {}) {
    if (which === 'import') return importDialog(o);
    if (which === 'export') return exportDialog(o);
    if (which === 'ai') return aiDialog(o);
    if (which === 'template') return templateDialog(o);
    throw new Error(`SlopConfigDialog.open: unknown dialog "${which}"`);
  }

  /** "Export plain template…": a valid example file (every key, example values) to fill in and import again. */
  function templateDialog(o = {}) {
    const app = appOf(o);
    const choices = C.kinds(app);
    if (!choices.length) { note(tr('ui.config.no_kinds')); return; }
    const sel = UI().select(choices.map((e) => [e.kind, e.label]), choices[0].kind);
    const body = UI().el('div', null, UI().field(tr('ui.config.kind'), sel),
      UI().el('p', { class: 'sui-p' }, tr('ui.config.template_body')));
    UI().dialog({
      title: o.title || tr('ui.config.template_title'), body,
      buttons: [
        { label: tr('menu.cancel') },
        { label: tr('menu.export'), primary: true, act: () => {
          try {
            const example = o.example && o.example.kind === sel.value ? o.example.value : C.exampleValue(sel.value, app);
            const file = C.exportFile(sel.value, app, `${app}-${sel.value}-template`, example,
              { description: tr('ui.config.template_desc') });
            UI().download(file, file.name);
          } catch (e) { note(tr('ui.config.export_failed', { err: e.message })); return false; }
        } },
      ],
    });
  }

  /** o.example = { kind, value }: a hand-made example for one kind (an app can show its own shape). */
  /** Drag and drop: a .slop.json file dropped on the page is checked and imported. The drop is taken only when it holds
   * such a file; other drops reach the app as usual. Bound once per page, in the capture phase. */
  let dropBound = false;
  function bindDrop(o = {}) {
    if (dropBound || !g.addEventListener) return;
    dropBound = true;
    const app = appOf(o);
    if (o.dragover) { // opt-in for apps with no page-wide file drop: lets a config file land on the page
      const hasFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      g.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); }, true);
    }
    // A .slop.json dropped anywhere on the page, before the app's own drop places see it: a source of the part 'config'.
    g.addEventListener('drop', (e) => { // intake-ok: the drop source of the config part (it hands the file to SlopIntake.take)
      const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
      const cfg = files.find((f) => /\.slop\.json$/i.test(f.name || ''));
      if (!cfg) return;
      e.preventDefault();
      e.stopPropagation();
      if (SI()) SI().take([cfg], { to: part(), source: 'drop', data: { app } });
      else C.importFile(cfg, { app }).then((res) => showResult(res));
    }, true);
  }

  /** Call once per page: binds drag and drop. Returns the four menu items (see menuItems). */
  function install(o = {}) { bindDrop(o); return menuItems(o); }

  /** The four Config items for a SlopUI.menu: export current config, plain template, import, ask AI. Each label is a
   *  getter: a menu drawn again (SlopMenuBar after a language change, a menu built on open) reads the current language. */
  function menuItems(o = {}) {
    const item = (w, act) => ({ get label() { return tr(WORDS[w]); }, act });
    return [
      item('export', () => exportDialog(o)),
      item('template', () => templateDialog(o)),
      item('import', () => importDialog(o)),
      item('ai', () => aiDialog(o)),
    ];
  }

  /** The same four actions as palette commands (SlopCmd shape): ids '<prefix>.config.export' and so on. The titles are in
   *  the current language; once registered in SlopCmd they are retitled after a language change (issued above). */
  function commands(o = {}) {
    const pre = o.prefix || appOf(o);
    const cmd = (w, keywords, run) => { const id = `${pre}.config.${w}`; issued.set(id, WORDS[w]); return { id, title: tr(WORDS[w]), group: 'Config', keywords, run }; };   // i18n-ignore: command group id
    return [
      cmd('export', ['save', 'json', 'slop'], () => exportDialog(o)),
      cmd('template', ['example', 'blank', 'empty'], () => templateDialog(o)),
      cmd('import', ['load', 'open', 'drop'], () => importDialog(o)),
      cmd('ai', ['make', 'generate', 'model'], () => aiDialog(o)),
    ];
  }

  const api = { open, importDialog, exportDialog, templateDialog, aiDialog, menuItems, commands, install, bindDrop, showResult, makeAi: null };
  g.SlopConfigDialog = api;
})(typeof window !== 'undefined' ? window : globalThis);
