/* SlopStorage.handle(err, opts): call it in a save's catch. A quota error opens one dialog that says the disk for this
 * site is full, names what is using the space and offers the fixes. Any other error is left to the caller (returns false).
 *   opts.app    the app's name for the message, e.g. 'Notes' (default: the page title)
 *   opts.what   what did not save, e.g. 'this note' (optional)
 *   opts.once   a key: after the first dialog for it, later quota errors with the same key are not shown again (autosave)
 *   opts.retry  async function that saves again. "Try again" runs it and closes the dialog when it resolves.
 *               The content stays in the editor meanwhile: a failed save must never clear the form, canvas or text.
 * Returns true when the error was a quota error (the person has been told), false otherwise.
 * Needs SlopUI (shared/slopui.js); without it, a window.alert. Classic script. */
(function (g) {
  'use strict';
  const SS = (g.SlopStorage = g.SlopStorage || {});
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup3.js (ui.storage.*)
  const lab = (v) => (g.SlopI18n && g.SlopI18n.label ? g.SlopI18n.label(v) : v);   // opts.what may be a key
  const FIXES = ['ui.storage.fix_thumbs', 'ui.storage.fix_models', 'ui.storage.fix_caches', 'ui.storage.fix_folder'];

  /** The parts that have a size: the browser's IndexedDB and Cache totals, measured localStorage, and Other. */
  function biggest(est) {
    return (est.parts || []).filter((p) => typeof p.bytes === 'number' && p.bytes > 0).sort((a, b) => b.bytes - a.bytes).slice(0, 4);
  }

  /** The dialog body for an estimate. Built again after each fix so the numbers stay true. */
  function contents(app, what, est, msg) {
    const el = g.SlopUI.el;
    const list = biggest(est);
    const usage = est.usage == null
      ? tr('ui.storage.no_estimate')
      : tr('ui.storage.usage', { used: SS.bytes(est.usage), quota: SS.bytes(est.quota), pct: Math.round(est.percent) });
    return [
      el('p', { class: 'sui-p' }, tr('ui.storage.not_saved', { app, what: what ? lab(what) : tr('ui.storage.your_work') })),
      el('p', { class: 'sui-p' }, usage),
      el('p', { class: 'sui-p' }, list.length ? tr('ui.storage.most') : tr('ui.storage.nothing_big')),
      list.length ? el('ul', { class: 'sui-list' }, list.map((p) => el('li', null, `${p.label}: ${SS.bytes(p.bytes)}`))) : null,
      el('p', { class: 'sui-p' }, tr('ui.storage.ways')),
      el('ul', { class: 'sui-list' }, FIXES.map((f) => el('li', null, tr(f)))),
      msg ? el('p', { class: 'sui-p', role: 'status' }, msg) : null,
    ].filter(Boolean);
  }

  const told = new Set();
  let shownBox = null; // the open dialog: several failed writes in a row show one dialog, not a stack
  const showing = () => !!(shownBox && g.document.body.contains(shownBox) && !shownBox.classList.contains('sui-out'));
  /** The app's name from the page title ("Slop Notes: ..." -> "Slop Notes"), when the caller gives none. */
  const titleApp = () => String((g.document && g.document.title) || '').split(/[:|·—–]/)[0].trim() || tr('ui.storage.this_app');

  function show(app, what, retry) {
    const el = g.SlopUI.el;
    const holder = el('div', { class: 'storage-full' });
    const paint = (est, msg) => holder.replaceChildren(...contents(app, what, est, msg));
    const refresh = async (msg) => paint(await SS.estimate(), msg);
    const clearThumbs = async () => {
      const r = await SS.clear('thumbs');
      await refresh(tr('ui.storage.cleared', { n: r.removed }));
      return false; // stay open so the person can see the change
    };
    const openElsewhere = (href) => () => { g.open(href, '_blank', 'noopener'); return false; };
    const tryAgain = async () => {
      if (!retry) return true;
      try { await retry(); return true; } catch (e) {
        const still = SS.classify(e).quota;
        await refresh(still ? tr('ui.storage.still_full') : tr('ui.storage.other_fail', { err: String((e && e.message) || e) }));
        return false;
      }
    };
    paint({ usage: null, quota: null, percent: 0, parts: [] }, tr('ui.storage.reading'));
    refresh(null).catch(() => {});
    const d = g.SlopUI.dialog({
      title: tr('ui.storage.full_title'),
      body: holder,
      buttons: [
        { label: retry ? tr('ui.storage.keep_editing') : tr('menu.close') },
        { label: tr('ui.storage.clear_thumbs'), act: clearThumbs },
        { label: tr('ui.storage.in_settings'), act: openElsewhere('/settings/#storage') },
        { label: tr('ui.storage.connect_folder'), act: openElsewhere('/drive/') },
        retry ? { label: tr('ui.storage.try_again'), primary: true, act: tryAgain } : null,
      ].filter(Boolean),
    });
    shownBox = d && d.box;
  }

  SS.handle = function (err, opts = {}) {
    if (!SS.classify(err).quota) return false;
    const app = opts.app || titleApp();
    if (showing()) return true;
    if (opts.once) { if (told.has(opts.once)) return true; told.add(opts.once); } // autosaves tell the person once per page
    if (!g.SlopUI || !g.SlopUI.dialog) {
      g.alert && g.alert(tr('ui.storage.full_alert', { app }));
      return true;
    }
    show(app, opts.what, opts.retry);
    return true;
  };
})(window);
