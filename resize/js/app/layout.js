/* Slop Resize: the page as the suite's View · Panel (shared/frame): the queue in the middle, and on the right the settings
 * (Size, Output, Saved settings), the results' actions (Download, Save to Slop Drive, Open in…, Clear) and, stuck to the
 * panel's foot, the main button: Resize / Resize N files, Cancel while it runs. Phones: the panel is a bottom sheet whose
 * foot (Settings + Resize) always shows. Runs as soon as it loads (the markup is above it), so the first paint has the
 * panel; the controller (app/main.js) calls paint(api) after every change of the queue. Classic script.
 *   SlopResize.layout = { frame, panel, paint(api) } */
(function (g) {
  'use strict';
  const NS = g.SlopResize, $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const fr = g.SlopFrame.mount($('rs-main'), {
    list: null, view: $('rs-left'), panel: $('rs-panel'), phone: '(max-width: 900px)', panelLabel: 'resize.app.settings',
    storageKey: 'resize', button: document.querySelector('.rs-tools'), phoneButton: false, width: 340, min: 280,
  });
  const groups = [...$('rs-panel').querySelectorAll('.rs-group')];
  const panel = g.SlopFrame.panel($('rs-panel'), { title: t('resize.app.run') });

  function resultActions(api, items, busy) {
    const done = items.filter((i) => i.status === 'done'), one = done.length === 1 ? done[0] : null;
    return [
      { el: $('rs-zip'), label: done.length > 1 ? t('resize.app.zip_n', { n: done.length }) : t('resize.app.download'), title: t('resize.app.zip_tip'), disabled: busy || !done.length, run: () => api.downloadAll() },
      { el: $('rs-save-all'), label: t('resize.app.save_drive'), title: t('resize.app.save_drive_tip'), disabled: busy || !done.some((i) => !i.drive), run: () => api.saveAll() },
      { id: 'rs-openin', label: t('resize.app.open_in'), title: one ? t('resize.app.open_in_tip') : t('resize.app.open_in_one'), disabled: busy || !one || !g.SlopOuttake,
        menu: () => (one && g.SlopOuttake ? g.SlopOuttake.items({ from: 'resize', get: () => one.out.blob, name: one.outName, type: one.out.blob.type }) : []) },
      { el: $('rs-clear'), label: t('resize.app.clear'), disabled: busy || !items.length, run: () => api.clear() },
    ];
  }

  let shape = '';
  /** Redraw the sections when the queue's shape changes (not on every progress tick, and not while someone types in a
   * setting: the settings are the app's own elements and render() moves them); the footer on every call. */
  function paint(api) {
    const items = NS.queue.items(), busy = NS.queue.busy(), ready = items.filter((i) => i.src);
    const now = JSON.stringify([items.length, items.map((i) => i.status + (i.drive ? 'd' : '')), busy]);
    if (now !== shape) {
      shape = now;
      panel.render([
        ...groups.map((gr) => ({ title: t(gr.dataset.key), key: gr.dataset.title, settings: gr })),
        { title: t('resize.app.results'), key: 'results', actions: resultActions(api, items, busy) },
      ]);
    }
    panel.footer([
      { el: $('rs-run'), label: ready.length > 1 ? t('resize.app.run_n', { n: ready.length }) : t('resize.app.run'), hidden: busy, disabled: !ready.length, run: () => api.run() },
      { el: $('rs-cancel'), hidden: !busy, run: () => api.cancel() },
    ], { note: t('resize.app.keys_note'), more: t('resize.app.settings') });
  }
  /** A language change: the sections are drawn again on the next paint, under the panel's title in the new language. */
  function reset() { shape = ''; if (panel.setTitle) panel.setTitle(t('resize.app.run')); }

  NS.layout = { frame: fr, panel, paint, groups, reset };
})(typeof window !== 'undefined' ? window : globalThis);
