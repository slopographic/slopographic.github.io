/* SlopMacros: macros in an app. Record a run of the app's own commands (SlopCmd commands with args), name and keep it
 * (SlopMacroStore, IndexedDB), play it again, export and import it, and hand it to Slop Workflows as a step. The pure part
 * is core.js (the one recorder and the one replay); the panel, the recording bar and the Macros button are panel.js.
 * Classic script; load after shared/commands/commands.js, core.js and store.js. See shared/macros/HANDOFF.md.
 *
 *   SlopMacros.init({ app, label, host })   app: the SlopCmd / registry app id ('photoslop'); label: its name
 *     host: { open(file, options), save(options, { signal, progress }) → { blob, kind }, ready? () → Promise }  how a hidden copy of the app
 *       (an iframe at <app>/?macro-host=1, shared/macros/frame.js) opens a file and writes the result. With ?macro-host=1
 *       in the address the page serves window.SlopMacroHost = { ready, run(file, steps, options, { signal, progress }) } for it.
 *   record() stop() cancel() note(cmd, args, title) play(id) list() get(id) rename(id) remove(id) exportFile(ids?)
 *   importFile(file?) addToWorkflow(id) on(fn) → off (fn({ type: 'record' | 'steps' | 'list' | 'play' }))
 *   recording, steps(), isHost
 * Commands: macro.record, macro.stop, macro.cancel, macro.panel ("Macros…") and macro.play (arg: name). */
(function (g) {
  'use strict';
  if (g.SlopMacros) return;
  const M = g.SlopMacrosCore, ST = g.SlopMacroStore;
  const SCRIPT = document.currentScript;
  const BASE = SCRIPT && SCRIPT.src ? new URL('./', SCRIPT.src).href : null;
  const IS_HOST = /[?&]macro-host=1(&|$)/.test(location.search);
  const UI = () => g.SlopUI;
  const toast = (m, ms) => { if (UI()) UI().toast(m, ms); };
  const listeners = new Set();
  const emit = (type) => { for (const fn of [...listeners]) try { fn({ type }); } catch (e) { console.error(e); } };
  let app = '', label = '', rec = null, cache = [];
  // Words: shared/i18n/ui/<code>/macros.js (keys ui.macro.*), read when shown; the commands are titled again on a language change
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);

  const load = (src) => new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) { res(); return; }
    const s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s);
  });
  const panel = () => (g.SlopMacrosPanel ? Promise.resolve(g.SlopMacrosPanel) : load(BASE + 'panel.js').then(() => g.SlopMacrosPanel));
  const C = () => g.SlopCmd;
  const exec = (cmd, args) => C().exec(cmd, args, { source: 'macro' });
  const prepare = () => (C().prepare ? C().prepare() : null);

  async function refresh() { cache = await ST.list(app); emit('list'); return cache; }
  const list = () => cache.slice();
  const get = (id) => cache.find((m) => m.id === id) || null;
  const byName = (name) => { const n = String(name || '').trim().toLowerCase(); return cache.find((m) => m.name.toLowerCase() === n) || cache.find((m) => m.name.toLowerCase().includes(n)) || null; };

  function record() {
    if (rec.recording) return;
    rec.start(); emit('record');
    panel().then((P) => P.bar(api)).catch(() => {});
    toast(tr('ui.macro.rec_toast'), 3600);
  }
  function cancel() { if (!rec.recording) return; rec.cancel(); emit('record'); toast(tr('ui.macro.cancelled')); }
  async function stop() {
    if (!rec.recording) return null;
    const steps = rec.stop(); emit('record');
    if (!steps.length) { toast(tr('ui.macro.nothing'), 5200); return null; }
    const def = steps.slice(0, 3).map((s) => s.title).join(' + ');
    const name = UI() ? await UI().prompt(tr('ui.macro.save_title'), tr('ui.macro.name_steps', { n: steps.length }), def.slice(0, 80), { ok: tr('menu.save') }) : def;
    if (name === null) { toast(tr('ui.macro.not_saved')); return null; }
    const { macro } = M.normalize({ app, name: name || def, steps });
    try { await ST.save(macro); } catch (e) { if (UI()) UI().alert(tr('ui.macro.keep_failed'), e.message); return null; }
    await refresh();
    toast(tr('ui.macro.saved', { name: macro.name }));
    return macro;
  }

  async function play(id) {
    const m = typeof id === 'object' && id ? id : get(id);
    if (!m) throw new Error(tr('ui.macro.no_such'));
    if (rec.recording) throw new Error(tr('ui.macro.stop_first'));
    emit('play');
    try {
      await rec.playing(() => M.replay(m.steps, { exec, prepare }));
      toast(tr('ui.macro.played', { name: m.name, n: m.steps.length }));
      return `Played ${m.name}`;
    } catch (e) { toast(e.message, 5200); throw e; }
  }

  async function rename(id, name) {
    const m = get(id); if (!m) return null;
    const v = name != null ? name : UI() ? await UI().prompt(tr('ui.macro.rename_title'), tr('ui.macro.name'), m.name, { ok: tr('ui.rename') }) : null;
    if (v === null || !String(v).trim()) return null;
    const saved = await ST.save(Object.assign({}, m, { name: String(v).trim().slice(0, 80) }));
    await refresh(); return saved;
  }
  async function remove(id, { ask = true } = {}) {
    const m = get(id); if (!m) return false;
    if (ask && UI() && !(await UI().confirm(tr('ui.macro.delete_q'), tr('ui.macro.delete_body', { name: m.name }), tr('ui.delete'), { danger: true }))) return false;
    await ST.remove(id); await refresh(); toast(tr('ui.macro.deleted', { name: m.name })); return true;
  }

  function exportFile(ids) {
    const list = ids ? [].concat(ids).map(get).filter(Boolean) : cache;
    if (!list.length) { toast(tr('ui.macro.none_export')); return null; }
    const blob = new Blob([M.toText(list, app)], { type: 'application/json' });
    const name = (list.length === 1 ? list[0].name.replace(/[\\/:*?"<>|]+/g, '-') : `${app}-macros`) + M.EXT;
    if (UI()) UI().download(blob, name);
    return { blob, name };
  }
  async function importFile(file) {
    if (!file) { const picked = UI() ? await UI().pickFiles({ accept: M.EXT + ',.json,application/json' }) : []; file = picked[0]; }
    if (!file) return 0;
    const { macros, errors } = M.fromText(await file.text(), app);
    if (!macros.length) { if (UI()) UI().alert(tr('ui.macro.import_failed'), errors[0] || tr('ui.macro.no_macro_file')); return 0; }
    const foreign = macros.filter((m) => m.app && m.app !== app);
    if (foreign.length && UI() && !(await UI().confirm(tr('ui.macro.import_title'), tr('ui.macro.import_foreign', { app: foreign[0].app }), tr('ui.import')))) return 0;
    for (const m of macros) await ST.save(Object.assign({}, m, { app, id: get(m.id) ? M.newId() : m.id }));
    await refresh();
    toast(tr('ui.macro.imported', { n: macros.length }));
    return macros.length;
  }

  async function addToWorkflow(id) {
    const m = get(id); if (!m) return null;
    if (!g.SlopFlowDoc) await load(new URL('../ops/flowdoc.js', BASE).href);
    return g.SlopFlowDoc.addToWorkflow({ kind: 'macro', id: M.opId(app, m.id), app, macroId: m.id, options: {} }, { name: m.name });
  }
  const openPanel = () => panel().then((P) => P.open(api));

  function commands() {
    const SC = C(); if (!SC || !SC.register) return;
    SC.register([
      { id: 'macro.record', title: tr('ui.macro.cmd_record'), group: 'Macros', keywords: ['macro', 'record', 'automate', 'actions', 'repeat'], when: () => !rec.recording, run: record },   // i18n-ignore: command group id and the AI tool text
      { id: 'macro.stop', title: tr('ui.macro.cmd_stop'), group: 'Macros', keywords: ['macro', 'stop', 'save'], when: () => rec.recording, run: () => stop() },   // i18n-ignore: command group id and the AI tool text
      { id: 'macro.cancel', title: tr('ui.macro.cmd_cancel'), group: 'Macros', keywords: ['macro', 'discard'], when: () => rec.recording, run: cancel },   // i18n-ignore: command group id and the AI tool text
      { id: 'macro.panel', title: tr('ui.macro.cmd_panel'), group: 'Macros', keywords: ['macro', 'play', 'recorded', 'actions', 'workflow'], run: openPanel },   // i18n-ignore: command group id and the AI tool text
      { id: 'macro.play', title: tr('ui.macro.cmd_play'), group: 'Macros', hidden: true, description: 'Play one of the saved macros of this app by its name.',   // i18n-ignore: command group id and the AI tool text
        args: [{ name: 'name', type: 'string', required: true, maxLength: 80, description: 'the macro’s name' }],   // i18n-ignore: command group id and the AI tool text
        when: () => cache.length > 0 && !rec.recording, run: (a) => { const m = a && byName(a.name); if (!m) throw new Error('No macro called ' + (a && a.name)); return play(m); } },
    ]);
  }

  /** The hidden copy of the app the workflows use: open the file, replay, write the result. One file at a time. */
  function serve(host) {
    let chain = Promise.resolve();
    const ready = Promise.resolve(host.ready ? host.ready() : null).then(() => true);
    g.SlopMacroHost = {
      app, ready,
      run(file, steps, options = {}, { signal = null, progress = null } = {}) {
        const job = chain.then(async () => {
          await ready;
          const f = new File([file], file.name || 'picture', { type: file.type || '' });   // this window's own File
          await host.open(f, options || {});   // options may carry more files (SlopCut: the media of an edit list)
          await rec.playing(() => M.replay(steps, { exec: (cmd, args) => C().exec(cmd, args, { source: 'macro', signal }), prepare, signal }));
          return host.save(options || {}, { signal, progress });
        });
        chain = job.catch(() => {});
        return job;
      },
    };
  }

  function init(o = {}) {
    if (rec) return api;
    app = String(o.app || (C() && C().app) || 'app'); label = o.label || app;
    rec = M.createRecorder(C(), { onChange: () => emit('steps') });
    commands();
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(commands);   // the palette's titles in the new language
    if (IS_HOST && o.host) serve(o.host);
    ST.onChange((a) => { if (!a || a === app) refresh(); });
    refresh();
    return api;
  }

  const api = {
    init, record, stop, cancel, play, list, get, refresh, rename, remove, exportFile, importFile, addToWorkflow, openPanel,
    note: (cmd, args, title, o) => (rec ? rec.note(cmd, args, title, o) : false),
    removeStep: (i) => rec && rec.remove(i),
    steps: () => (rec ? rec.steps() : null),
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get recording() { return !!(rec && rec.recording); },
    get app() { return app; }, get label() { return label; },
    isHost: IS_HOST, base: BASE,
  };
  g.SlopMacros = api;
})(window);
