/* SlopIntake: the one way files get into an app. Every source (a drop, Choose files, File ▸ Open, a paste, Slop Drive,
   ?drive= and Send to…, a PWA launch, the sample, the Convert dialog's results) ends in SlopIntake.take(files, { source }),
   and the page's one pipeline (pipeline.js) runs the app's registered spec over them. This file makes that pipeline with
   the page's side: the slop:intake-* events, the first-use notice (shared/firstrun), the "Add to <doc> or New document"
   question, the feedback (the drop zone's rows when the app has one, else a toast). Classic script; loads after
   rules.js, normalize.js and pipeline.js, before sources.js. See shared/intake/HANDOFF.md.
     SlopIntake.register({ id, accept, noun, process(file, ctx), ... })  → unregister()
     SlopIntake.take(files, { source, to?, mode?, at?, data? })          → Promise<summary>
     SlopIntake.on('before' | 'file' | 'after', fn(detail))              → off()
   Events on document: 'slop:intake-before' (cancelable), 'slop:intake-file', 'slop:intake-after'; detail has app,
   source, mode, files, and results / the file's result. */
(function () {
  'use strict';
  const SI = (window.SlopIntake = window.SlopIntake || {});
  if (SI.take) return; // loaded once per page: a second copy would make a second pipeline
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  const R = SI.rules;
  const views = new Map();
  const EVENTS = { before: 'slop:intake-before', file: 'slop:intake-file', after: 'slop:intake-after' };
  const warn = (...a) => console.warn(...a);

  function toast(text, kind) {
    const P = window.SlopDrop && window.SlopDrop.panel;
    if (P && P.toast) P.toast(text, kind || '');
    else if (window.SlopUI && window.SlopUI.toast) window.SlopUI.toast(text);
  }

  /** "Add to <name>" or "New document" (or Cancel): the one question for every source (a drop, a pick, a paste, a file
   *  from Slop Drive), asked by the pipeline's Add or New gate. Resolves 'add', 'new' or null.
   *  o: { count, names, name, source, labels: { title, message, add, new, cancel } }. The dialog is .si-choose. */
  SI.choose = function (o, legacyName) {
    if (typeof o === 'number') o = { count: o, name: legacyName }; // the old choose(count, name)
    const L = Object.assign({}, o.labels);
    const name = o.name || tr('ui.intake.open_doc', 'the open document'), n = o.count || 1, names = o.names || [];
    if (!window.SlopUI || !window.SlopUI.dialog) return Promise.resolve('add');
    const what = n === 1 && names[0] ? '“' + names[0] + '”' : o.source === 'paste' ? (n === 1 ? tr('ui.intake.this_image', 'This image') : tr('ui.intake.n_images', '{n} images', { n })) : n === 1 ? tr('ui.intake.this_file', 'This file') : tr('ui.intake.n_files', '{n} files', { n });
    return new Promise((res) => {
      let pick = null;
      window.SlopUI.dialog({
        title: L.title || (o.source === 'paste' ? tr('ui.paste', 'Paste') : tr('ui.intake.add_files', 'Add files')),
        body: L.message ? L.message + ' ' + (n === 1 && names[0] ? names[0] : tr('ui.intake.n_files', '{n} files', { n })) : tr('ui.intake.can_go', '{what} can go into {name}, or open as a new document.', { what, name }),
        cls: 'si-choose',
        buttons: [
          { label: L.cancel || tr('menu.cancel', 'Cancel') },
          { label: L.new || tr('ui.new_document', 'New document'), act: () => { pick = 'new'; } },
          { label: L.add || tr('ui.intake.add_to', 'Add to {name}', { name }), primary: true, act: () => { pick = 'add'; } },
        ],
        onClose: () => res(pick),
      });
    });
  };

  const pipe = SI.createPipeline({
    emit(type, detail) {
      const ev = new CustomEvent(EVENTS[type], { detail, cancelable: type === 'before' });
      document.dispatchEvent(ev);
      if (ev.defaultPrevented && detail.batch) detail.batch.cancel();
      return !ev.defaultPrevented;
    },
    /** The first-use notice, once per batch (whichever source). notice: { app?, title, lines, downloads }. */
    notice(spec, notice, batch) {
      const F = window.SlopFirstRun;
      if (!F) return Promise.resolve(true);
      return F.once(notice.app || spec.noticeApp || spec.id, notice);
    },
    choose: (o) => SI.choose(o),
    view: (id) => views.get(id) || null,
    report(summary) {
      const s = pipe.spec(summary.app);
      if ((s && s.toast === false) || (!summary.added.length && !summary.skipped.length)) return;
      toast(R.describe(summary), summary.added.length ? '' : 'warn');
    },
    toast,
    warn,
  });

  /** Registers the app's spec (see HANDOFF.md for its fields). Returns a function that unregisters it. */
  SI.register = (spec) => pipe.register(spec);
  SI.unregister = (id) => pipe.unregister(id);
  SI.spec = (id) => pipe.spec(id);
  SI.specs = () => pipe.specs();
  /** Does the spec take this file? (its rules or accept function) */
  SI.accepts = (id, file) => { const s = typeof id === 'object' ? id : pipe.spec(id); return !!s && pipe.check(s, file).ok; };
  /** The <input accept> value for a spec: its pickAccept, else its rules' types and extensions ('' takes anything). */
  SI.acceptAttr = (id) => { const s = typeof id === 'object' ? id : pipe.spec(id); if (!s) return ''; return s.pickAccept || (s.accept && typeof s.accept === 'object' ? R.acceptAttr(s.accept) : ''); };
  /** The one entry: every source calls this. */
  SI.take = (files, opts) => pipe.take(files, typeof opts === 'string' ? { source: opts } : opts);
  /** A feedback view for a spec (the drop zone's rows): { begin(batch), row(file) → { progress, set }, end(summary) }. */
  SI.view = (id, adapter) => { if (adapter) views.set(id, adapter); else views.delete(id); return () => { if (views.get(id) === adapter) views.delete(id); }; };
  /** Listens to the pipeline's events: 'before' (fn may return false to cancel), 'file', 'after'. Returns off(). */
  SI.on = function (type, fn, opts) {
    const name = EVENTS[type] || type;
    const only = opts && opts.app;
    const h = (e) => { if (only && e.detail.app !== only) return; if (fn(e.detail, e) === false && e.cancelable) e.preventDefault(); };
    document.addEventListener(name, h);
    return () => document.removeEventListener(name, h);
  };
  SI.toast = toast;
  SI.EVENTS = EVENTS;

  // The old paste-only API (SlopIntake.attach) is a spec too: its files go through the same pipeline, source 'paste'.
  let legacy = 0;
  /** Attaches an app to pastes: { accept(file), hasOpen?(), openName?(), onAdd(files), onNew(files), first? }.
   *  Kept for apps not yet migrated; new code registers a spec. Returns a function that detaches it. */
  SI.attach = function (o) {
    const id = o.id || 'paste-' + ++legacy;
    return pipe.register({
      id, main: false, first: !!o.first, paste: true, pasteOnly: true, toast: false,
      accept: (f) => !!o.accept(f), hasOpen: o.hasOpen ? () => o.hasOpen() : null, openName: o.openName ? () => o.openName() : null,
      onAdd: o.onAdd || o.onNew, onNew: o.onNew || o.onAdd,
    });
  };
  /** The old helpers, kept: the files on a clipboard (sync), and a data: image as a File. */
  SI.filesOf = function (cd) {
    const list = SI.listOf(cd);
    const files = list.filter((x) => typeof x !== 'string'), url = list.find((x) => typeof x === 'string') || null;
    return { files, dataUrl: url, mime: url ? url.slice(5, url.indexOf(';')) : null };
  };
  SI.imageFromDataUrl = async (url) => SI.dataUrlFile(url);
})();
