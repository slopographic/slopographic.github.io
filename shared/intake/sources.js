/* SlopIntake sources: the adapters that turn each way of giving an app files into one SlopIntake.take(files, { source }).
   Classic script; loads after intake.js. See shared/intake/HANDOFF.md.
     paste      one paste listener for the page: a pasted file (or a picture copied from a web page) goes to the first
                registered spec that takes it (paste: false opts a spec out)                       source 'paste'
     pick       SlopIntake.pick({ to, multiple, accept, folder, mode, data }): the file picker (File ▸ Open, Ctrl+O,
                Choose files, Insert from file...; folder: true picks a whole folder, each file keeping its path in
                webkitRelativePath)                                                                source 'picker'
     drive      SlopIntake.fromDrive({ to, accept, title, mode, data }): Open from Slop Drive        source 'drive'
     launch     SlopIntake.launch({ to }): a file another app sent here (?drive=<id>, Slop Hub's Send to…) or the
                files the system opened the installed app with (launchQueue)                      source 'launch'
     convert    SlopIntake.fromConvert(outputs, { to }): the Convert dialog's results handed back   source 'convert'
     sample     SlopIntake.sample(files, { to }): Try it with a sample                             source 'sample'
     drop       SlopIntake.dropTarget(el, { to, mode(e), data(e) }): a plain drop area without the zone UI
                (shared/drop's SlopDrop.attach is the drop source with the zone, outlines and rows) source 'drop' */
(function () {
  'use strict';
  const SI = window.SlopIntake;
  if (!SI || !SI.take || SI.pick) return;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }

  /* ---------- paste ---------- */
  const typing = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !(t.classList && t.classList.contains('paste-catcher'));
  /** The first spec that takes a pasted item, judged from its type (a data: image is judged by a one-byte stand-in). */
  function pasteSpec(list) {
    const probe = list.map((x) => (typeof x === 'string' ? new File([new Uint8Array(1)], 'pasted-image.png', { type: x.slice(5, x.indexOf(';')) || 'image/png' }) : x));
    return SI.specs().find((s) => s.paste !== false && probe.some((f) => SI.accepts(s, f))) || null;
  }
  function onPaste(e) {
    if (e.defaultPrevented || typing(e.target) || (window.SlopUI && window.SlopUI.openDialogs)) return;
    const list = SI.listOf(e.clipboardData);
    if (!list.length) return;
    const spec = pasteSpec(list);
    if (!spec) return;
    e.preventDefault(); // taken here: the app's own paste (text, its internal clipboard) does not also run
    SI.take(list, { source: 'paste', to: spec.id });
  }
  document.addEventListener('paste', onPaste);

  /* ---------- the file picker ---------- */
  function pickFiles(accept, multiple, folder, capture) {
    if (!folder && window.SlopUI && window.SlopUI.pickFiles) return window.SlopUI.pickFiles({ accept, multiple, capture });
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept; i.multiple = multiple; i.style.cssText = 'position:fixed;left:-9999px';
      if (capture) i.setAttribute('capture', capture);
      if (folder) i.webkitdirectory = true;
      i.addEventListener('change', () => { res([...i.files]); i.remove(); }, { once: true });
      i.addEventListener('cancel', () => { res([]); i.remove(); }, { once: true });
      document.body.append(i);
      i.click();
    });
  }
  /** Opens the picker for a spec and takes what is picked. o: { to, multiple (default: the spec's, else true), accept
   *  (default: the spec's rules), folder (a whole folder), capture ('environment': a phone opens its back camera, the photo
   *  taken is the file; 'user': the front one; a computer shows its usual picker), mode, data }. Resolves the summary (an
   *  empty one when nothing was picked). */
  SI.pick = async function (o) {
    o = o || {};
    const spec = SI.spec(o.to);
    const multiple = o.multiple != null ? o.multiple : spec && spec.multiple != null ? spec.multiple : !(spec && spec.limit === 1);
    const files = await (SI.pickFiles || pickFiles)(o.accept != null ? o.accept : SI.acceptAttr(spec), multiple, !!o.folder, o.capture || '');
    if (!files || !files.length) return { app: spec && spec.id, source: 'picker', added: [], skipped: [], refused: [], cancelled: true };
    return SI.take(files, Object.assign({}, o, { source: o.source || 'picker', to: o.to }));
  };

  SI.pickFiles = null; // a test may stand in its own picker: (accept, multiple, folder, capture) → File[]

  /** A part of a page with files of its own (a logo, a backup, a config, presets, fonts): spec is registered once, with
   *  main: false, paste: false and toast: false unless it says otherwise. Returns its id, for pick / fromDrive / take:
   *  SlopIntake.pick({ to: SlopIntake.part({ id, accept, process }) }). */
  SI.part = function (spec) {
    if (!SI.spec(spec.id)) SI.register(Object.assign({ main: false, paste: false, toast: false }, spec));
    return spec.id;
  };

  /* ---------- Slop Drive ---------- */
  const hub = () => (document.documentElement.dataset.offline ? null : window.SlopHub || null);
  /** The MIME patterns the Drive picker lists for a spec: driveAccept, else its rules' types (all when it takes any). */
  function driveAccept(spec) {
    if (!spec) return undefined;
    if (spec.driveAccept) return spec.driveAccept;
    const a = spec.accept;
    return a && typeof a === 'object' && !a.any && a.types && a.types.length ? a.types : undefined;
  }
  SI.hasDrive = () => !!hub();
  /** Open from Slop Drive: the picker, then the record goes through take (the File keeps it as file.slopDrive). */
  SI.fromDrive = async function (o) {
    o = o || {};
    const H = hub(), spec = SI.spec(o.to);
    if (!H) { SI.toast(tr('ui.no_drive', 'Slop Drive is not available here'), 'warn'); return null; }
    const rec = await H.pickFromDrive({ accept: o.accept || driveAccept(spec), title: o.title });
    if (!rec) return null;
    const full = rec.blob ? rec : await H.get(rec.id);
    if (!full || !full.blob) return null;
    return SI.take([full], Object.assign({}, o, { source: 'drive' }));
  };

  /* ---------- launch: ?drive=<id> (Send to…) and launchQueue (the installed app opened with files) ---------- */
  const launched = [];
  let launchWaiter = null;
  if ('launchQueue' in window && window.launchQueue && typeof window.launchQueue.setConsumer === 'function') {
    window.launchQueue.setConsumer((params) => {
      const files = (params && params.files) || [];
      if (!files.length) return;
      if (launchWaiter) launchWaiter(files); else launched.push(...files);
    });
  }
  /** Takes what the page was opened with: a Slop Drive record (?drive=<id>, which also tidies the URL) and the files of a
   *  PWA launch. Call once the app is ready for files. Later launch files (the installed app opened again) come in too.
   *  Resolves the summary, or null when the page was opened with nothing. */
  SI.launch = async function (o) {
    o = Object.assign({}, o, { source: 'launch' });
    const H = hub();
    let rec = null;
    if (H && H.consumeLaunch) { try { rec = await H.consumeLaunch(); } catch (e) { rec = null; } }
    const items = (rec && rec.blob ? [rec] : []).concat(launched.splice(0));
    launchWaiter = (files) => SI.take(files, o);
    if (!items.length) return null;
    return SI.take(items, o);
  };

  /* ---------- the Convert dialog's hand-back, the sample ---------- */
  /** The Convert dialog's results ([{ name, blob }]) into the app (Slop PDF's onPdf). */
  SI.fromConvert = (outputs, o) => SI.take(outputs, Object.assign({}, o, { source: 'convert' }));
  /** A sample's files (or a Promise of them, or a function that makes them) into the app. */
  SI.sample = (files, o) => SI.take(typeof files === 'function' ? Promise.resolve().then(files) : files, Object.assign({}, o, { source: 'sample' }));

  /* ---------- a plain drop area ---------- */
  const isFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  /** A drop area without the zone UI (a panel, a list): a file drop on it goes through take. o: { to, mode?(e),
   *  data?(e), files?(dt, e) }. A drop it takes is marked e.sdHandled, so an outer SlopDrop target does not take it again.
   *  Returns destroy(). */
  SI.dropTarget = function (el, o) {
    if (!el) return () => {};
    o = o || {};
    const over = (e) => { if (!isFiles(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; };
    const drop = (e) => {
      if (!isFiles(e) || e.sdHandled) return;
      e.preventDefault(); e.stopPropagation();
      e.sdHandled = true;
      const files = o.files ? o.files(e.dataTransfer, e) : SI.listOf(e.dataTransfer);
      SI.take(files, { source: 'drop', to: o.to, at: { x: e.clientX, y: e.clientY }, mode: o.mode ? o.mode(e) : null, data: o.data ? o.data(e) : undefined });
    };
    el.addEventListener('dragenter', over);
    el.addEventListener('dragover', over);
    el.addEventListener('drop', drop);
    return () => { el.removeEventListener('dragenter', over); el.removeEventListener('dragover', over); el.removeEventListener('drop', drop); };
  };
})();
