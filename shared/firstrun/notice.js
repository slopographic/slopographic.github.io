/* First-use notice: a short dialog the first time an app is given a file, saying where the work happens and what
 * the app downloads (with sizes) before it can start. Shown once per app and kept in localStorage (key 'slop-firstrun:<app>').
 * If storage is unavailable the notice is shown each time, and nothing else changes. Classic script: window.SlopFirstRun.
 *   SlopFirstRun.once(app, { title, lines: [string], downloads: [{ name, bytes }] })  ->  Promise<boolean> (true = carry on)
 *   title, each line and each download's name may be i18n keys or functions (SlopI18n.label), read when the notice shows;
 *   the notice's own words are ui.firstrun.* (shared/i18n/ui/<code>/firstrun.js).
 * Only the notice is shown on the first use; an app with no downloads passes downloads: [] and gets a plain privacy note.
 *   SlopFirstRun.mark(app)  counts the notice as seen (another consent step covered it); SlopFirstRun.seen(app) -> boolean
 *   SlopFirstRun.size(bytes) -> '64 MB': the one way a download's size is written (1 MB = 1024 × 1024 bytes, as the
 *                               library's Get more and the rest of the site do). A page that names a model's size takes it
 *                               from here and the model's byte count, so the page and this notice cannot disagree. */
(function () {
  'use strict';
  const KEY = (app) => 'slop-firstrun:' + app;
  /** A word of the notice (ui.firstrun.*, menu.cancel), or an app's label: a key, a function or text (SlopI18n.label). */
  const lab = (v, vars) => { const I = window.SlopI18n; return String(I && I.label ? I.label(v, vars) : typeof v === 'function' ? v() : v); };
  const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  function seen(app) {
    try { return localStorage.getItem(KEY(app)) === '1'; } catch (e) { return false; }
  }
  function remember(app) {
    try { localStorage.setItem(KEY(app), '1'); } catch (e) { /* storage blocked: the notice shows again next time */ }
  }

  /** Resolves true at once when the app has been used before; otherwise shows the notice and waits for the choice. */
  function once(app, o) {
    if (seen(app) || !window.SlopUI) return Promise.resolve(true);
    return new Promise((resolve) => {
      const body = document.createElement('div');
      o.lines.concat(['ui.firstrun.privacy']).forEach((line) => { const p = document.createElement('p'); p.className = 'sui-p'; p.textContent = lab(line); body.append(p); });   // the last line: where the files go
      if (o.downloads && o.downloads.length) {
        const total = o.downloads.reduce((n, d) => n + d.bytes, 0), one = o.downloads.length === 1;
        const ul = document.createElement('ul');
        ul.className = 'sui-p';
        o.downloads.forEach((d) => { const li = document.createElement('li'); li.textContent = `${lab(d.name)}, ${size(d.bytes)}`; ul.append(li); });
        const p = document.createElement('p');
        p.className = 'sui-p';
        p.textContent = lab(one ? 'ui.firstrun.download_one' : 'ui.firstrun.download_many', { size: size(total) });
        body.append(p, ul);
      }
      let done = false;
      const finish = (ok) => { if (done) return; done = true; if (ok) remember(app); resolve(ok); };
      SlopUI.dialog({
        title: lab(o.title),
        body,
        buttons: [
          { label: lab('menu.cancel'), act: () => finish(false) },
          { label: lab('ui.firstrun.continue'), primary: true, act: () => finish(true) },
        ],
        onClose: (ok) => finish(!!ok),
      });
    });
  }

  /** Another consent step already covered the notice (AI Tools' Get more dialog names the download and its licence). */
  const mark = (app) => remember(app);

  window.SlopFirstRun = { once, size, mark, seen };
})();
