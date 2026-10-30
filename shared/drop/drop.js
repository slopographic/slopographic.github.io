/* SlopDrop: the drop zone and progress UI on top of the one intake pipeline (shared/intake, SlopIntake). SlopDrop.attach(zone, o)
   draws the drop zone (message, Choose files, progress list), outlines the targets and labels "Drop to add N files" while
   a file drag is over the window, and is the drop, Choose files and sample source for one app: every file it is given
   goes to SlopIntake.take(files, { source: 'drop' | 'picker' | 'sample' }). The pipeline checks the rules (refusals say
   why), runs the gates and the app's reader, and this zone shows each file's row, the result line, the toast and the new
   item (o.reveal). o.intake: the id of a spec the app registered with SlopIntake.register (the zone is then only its UI);
   without it, attach registers a spec from o (accept, process, begin, done, limit), so older callers work unchanged.
   Loads after shared/intake/{rules,normalize,pipeline,intake,sources}.js and panel.js. See shared/drop/HANDOFF.md. */
(function (root) {
  'use strict';
  const SD = (root.SlopDrop = root.SlopDrop || {});
  const R = SD.rules, PN = SD.panel, doc = root.document;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }

  const isFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  /** One MIME type per file in the drag ('' when the browser does not say). The names are hidden until the drop. */
  function dragTypes(dt) {
    const files = Array.from(dt.items || []).filter((i) => i.kind === 'file');
    return files.length ? files.map((i) => i.type || '') : [''];
  }
  function reveal(el) {
    if (!el) return;
    try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* older browsers */ }
    el.classList.remove('sd-flash');
    void el.offsetWidth;
    el.classList.add('sd-flash');
    setTimeout(() => el.classList.remove('sd-flash'), 1300);
  }

  let seq = 0;
  /** Attach the drop zone to an app. o:
   *   intake?: the id of the app's registered spec (SlopIntake.register); the zone is then its drop/pick/sample source
   *     and its feedback. Without it these options make the spec: accept (rules, see shared/intake/rules.js),
   *     process(file, progress, ctx) (the app's reader: resolves a value or throws Error(reason); ctx: { at, index,
   *     source, mode, data }), begin(files)?, limit?, id? (the spec id; default 'drop-<n>'), main?, paste? (false: no
   *     paste; { hasOpen, openName, onAdd }: ask Add or New on a paste).
   *   done(summary)?: after each batch, summary = { added: [{ name, value }], skipped: [{ name, reason }], source }.
   *   reveal(summary)?: returns the element to scroll into view and flash.
   *   files?(dataTransfer, event) → File[] (or a Promise): the files of a drop, read inside the drop event (folders).
   *   mode?(event) → 'add' | 'new' | null and data?(event): what the drop's own place decides (a zone it landed on).
   *   targets?, input?, overlay?, window?, label?, hint?, toast?, multiple?, compact?, quiet?, preview?, sample?: the
   *     zone's look and where it takes drops (see shared/drop/HANDOFF.md). The words (label, hint, chooseLabel,
   *     preview.steps[i], preview.picture.alt, sample.label) may be i18n keys: translated, and again on a language change.
   *  Returns { id, choose(), run(files, at), sample(), empty(v), destroy() }. */
  SD.attach = function (zone, o) {
    if (!zone) return null; // the page has no drop zone: nothing to attach, and no error
    o = o || {};
    const SI = root.SlopIntake;
    if (!SI || !SI.take) { console.error('SlopDrop needs shared/intake (SlopIntake) on the page'); return null; }
    let id = o.intake, unregister = null;
    if (!id) {
      id = o.id || 'drop-' + ++seq;
      const P = o.paste && typeof o.paste === 'object' ? o.paste : {};
      unregister = SI.register({
        id, main: o.main, accept: o.accept || { any: true }, limit: o.limit, toast: o.toast, paste: o.paste !== false,
        hasOpen: P.hasOpen || null, openName: P.openName || null, ask: ['paste'], onAdd: P.onAdd ? (files) => P.onAdd(files) : null,
        before: o.begin ? (batch) => { try { o.begin(batch.take.slice()); } catch (err) { console.error('SlopDrop begin', err); } } : null,
        process: (file, ctx) => o.process(file, ctx.progress, { at: ctx.at, index: ctx.index, source: ctx.source, mode: ctx.mode, data: ctx.data }),
      });
    }
    const spec = () => SI.spec(id) || {};
    const rules = () => (spec().accept && typeof spec().accept === 'object' ? spec().accept : { any: true });
    // A target that is missing from this page (a page without that element, a null from $('id')) is skipped, never an
    // error. When none is left, the zone itself takes the drops, so the zone still works.
    const listed = (o.targets || []).filter(Boolean);
    const targets = listed.length ? listed : [zone];
    // A strip whose drops land on a bigger area (the app's targets) is not a second place to add files: at rest it is
    // hidden (.sd-quiet), and it shows only while files are added or a result is shown. quiet: false keeps it on view.
    if (o.compact && o.window !== false && o.quiet !== false && listed.some((t) => t !== zone)) zone.classList.add('sd-quiet');
    const ui = PN.build(zone, { label: o.label, hint: o.hint || rules().hint, chooseLabel: o.chooseLabel, compact: o.compact, preview: o.preview, sample: o.sample });
    const input = o.input || doc.createElement('input');
    input.type = 'file';
    input.multiple = o.multiple != null ? o.multiple !== false : spec().limit !== 1;
    input.accept = R.acceptAttr(rules());
    if (!o.input) { input.hidden = true; zone.append(input); }
    ui.choose.addEventListener('click', () => input.click());

    /** Every file the zone is given, from any of its sources, goes into the pipeline. */
    function run(list, at, source, extra) {
      return SI.take(list, Object.assign({ source: source || 'drop', to: id, at: at || null }, extra));
    }
    /** The sample's files, through the same pipeline as a drop. Making them can take a moment (recorded clips): the
     *  status line says so and the button waits. */
    const trySample = () => {
      if (!o.sample) return Promise.resolve();
      if (ui.sample) ui.sample.disabled = true;
      ui.status.textContent = tr('ui.drop.preparing', 'Preparing the sample…');
      const files = Promise.resolve().then(() => o.sample.files()).finally(() => { if (ui.sample) ui.sample.disabled = false; });
      return run(files, null, 'sample');
    };
    if (ui.sample) ui.sample.addEventListener('click', trySample);
    const onPick = () => { const files = Array.from(input.files || []); input.value = ''; if (files.length) run(files, null, 'picker'); };
    input.addEventListener('change', onPick);

    let tidy = null;
    /** After a batch with no problems the file rows and the status line go, so the strip is its plain prompt again. */
    /** The timers are optional: a host without them (a test sandbox) just keeps the rows. */
    const cancelTidy = () => { if (tidy && typeof clearTimeout === 'function') clearTimeout(tidy); tidy = null; };
    const tidyLater = () => {
      cancelTidy();
      if (typeof setTimeout !== 'function') return;
      tidy = setTimeout(() => { ui.list.replaceChildren(); ui.status.textContent = ''; }, 3000);
      if (tidy && tidy.unref) tidy.unref(); // a node test does not wait on this tidy-up
    };
    // The zone is the spec's feedback view, whichever source the batch came from (a drop, Open, Slop Drive, a paste).
    const offView = SI.view(id, {
      begin() { cancelTidy(); ui.list.replaceChildren(); ui.status.textContent = ''; },
      refuse(r) { cancelTidy(); PN.row(ui.list, r.name, R.size(r.file && r.file.size)).set('error', r.reason); },
      row(file) { cancelTidy(); return PN.row(ui.list, file.name, R.size(file.size)); },
      end(summary) {
        if (summary.cancelled && !summary.added.length) { ui.status.textContent = ''; return; }
        if (!summary.added.length && !summary.skipped.length) { ui.status.textContent = ''; return; }
        const { added, skipped } = summary;
        if (added.length && ui.wrap) ui.wrap.classList.add('sd-has');
        const text = R.describe(summary);
        ui.status.textContent = text;
        if (!skipped.length) tidyLater();
        if (o.done) { try { o.done(summary); } catch (err) { console.error('SlopDrop done', err); } }
        if (added.length && o.reveal) { try { reveal(o.reveal(summary)); } catch (err) { console.error('SlopDrop reveal', err); } }
        if (o.toast !== false && spec().toast !== false) PN.toast(text, added.length ? '' : 'warn');
      },
    });

    // Window: a file drag shows the outlines and the label over every target; a drop elsewhere says where to drop.
    let depth = 0, shown = false;
    const hide = () => { depth = 0; shown = false; PN.hideHints(); };
    const onEnter = (e) => {
      if (!isFiles(e)) return;
      depth++;
      if (!shown) { shown = true; if (o.overlay !== false) PN.showHints(targets, R.dragLabel(dragTypes(e.dataTransfer), rules())); }
    };
    const onLeave = (e) => { if (!isFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) hide(); };
    const onOver = (e) => { if (!isFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (shown) PN.placeHints(); };
    const onWindowDrop = (e) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      hide();
      if (!e.sdHandled && !e.sdSeen) PN.toast(tr('ui.drop.on_area', 'Drop files on the highlighted area'), 'warn');
      e.sdSeen = true;
    };
    const onScroll = () => { if (shown) PN.placeHints(); };
    const onTargetDrop = (e) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      // A nearer target (a lane, a list) took this drop: the outer target must not import it again.
      if (e.sdHandled) return;
      e.sdHandled = true;
      hide();
      // o.files(dataTransfer) is read now, inside the drop event (folder entries must be), and may resolve later.
      const list = o.files ? o.files(e.dataTransfer, e) : Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      run(list, { x: e.clientX, y: e.clientY }, 'drop', { mode: o.mode ? o.mode(e) : null, data: o.data ? o.data(e) : undefined });
    };
    const win = root;
    // window: false leaves the page alone (no window outline, no drops taken elsewhere): only the targets react.
    const winOn = o.window !== false;
    if (winOn) {
      win.addEventListener('dragenter', onEnter);
      win.addEventListener('dragleave', onLeave);
      win.addEventListener('dragover', onOver);
      win.addEventListener('drop', onWindowDrop);
      win.addEventListener('scroll', onScroll, { capture: true, passive: true });
    }
    const onTargetOver = (e) => { if (isFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
    const onTargetEnter = (e) => { if (isFiles(e)) e.currentTarget.classList.add('sd-over'); };
    const onTargetLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('sd-over'); };
    const onTargetEnd = (e) => e.currentTarget.classList.remove('sd-over');
    for (const t of targets) {
      t.addEventListener('dragover', onTargetOver);
      t.addEventListener('dragenter', onTargetEnter);
      t.addEventListener('dragleave', onTargetLeave);
      t.addEventListener('drop', onTargetEnd);
      t.addEventListener('drop', onTargetDrop);
    }

    return {
      id,
      choose: () => input.click(),
      run: (list, at) => run(list, at, 'drop'),
      sample: trySample,
      /** Whether the app has nothing in it yet: the preview and the sample button show only then. A batch that adds files
       *  sets it to false; an app's Clear sets it back with empty(true). */
      empty(v) { if (ui.wrap) ui.wrap.classList.toggle('sd-has', !v); },
      destroy() {
        if (winOn) {
          win.removeEventListener('dragenter', onEnter);
          win.removeEventListener('dragleave', onLeave);
          win.removeEventListener('dragover', onOver);
          win.removeEventListener('drop', onWindowDrop);
          win.removeEventListener('scroll', onScroll, { capture: true });
        }
        for (const t of targets) {
          t.removeEventListener('dragover', onTargetOver);
          t.removeEventListener('dragenter', onTargetEnter);
          t.removeEventListener('dragleave', onTargetLeave);
          t.removeEventListener('drop', onTargetEnd);
          t.removeEventListener('drop', onTargetDrop);
        }
        input.removeEventListener('change', onPick);
        ui.off();
        offView();
        if (unregister) unregister();
        hide();
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
