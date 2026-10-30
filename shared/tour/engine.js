/* SlopTour engine: tours are data. SlopTour.define() registers one; start(app) loads the app's tour file
 * (tours/<app>.js) on demand, resumes it from saved progress and drives the spotlight and the panel.
 * A tour never changes app data: steps only point, scroll and focus. Closing leaves the page as it was.
 * The words come from the app's tables (SlopTour.logic.words) on every render, and an open tour re-renders when the
 * language changes (SlopI18n.on), so it follows a live switch.
 * Classic script. Sets window.SlopTour (see core.js, spot.js, panel.js). HANDOFF.md has the full contract. */
(function () {
  'use strict';
  const T = (window.SlopTour = window.SlopTour || {});
  const BASE = document.currentScript && document.currentScript.src ? new URL('./', document.currentScript.src).href : '';
  const defs = Object.create(null);
  const L = T.logic;
  /** A word from the shared tables (ui.tour.* in shared/i18n/ui/<code>.js); the key itself without SlopI18n. */
  const tr = (key, vars) => { const I = globalThis.SlopI18n; return I && I.t ? I.t(key, vars) : key; };
  let cur = null;          // { app, tour, index, done: Set, status }
  const subs = [];

  /** Register a tour. Invalid tours are refused with a console warning and never shown. */
  function define(t) {
    const bad = L.problems(t);
    if (bad.length) { console.warn('SlopTour.define: ' + ((t && t.app) || '?') + ' — ' + bad.join('; ')); return false; }
    defs[t.app] = t;
    return true;
  }
  /** Load tours/<app>.js (once) and resolve with its definition. */
  function load(app) {
    if (defs[app]) return Promise.resolve(defs[app]);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = BASE + 'tours/' + app + '.js';
      s.onload = () => (defs[app] ? resolve(defs[app]) : reject(new Error('tour file did not define ' + app)));
      s.onerror = () => reject(new Error('no tour for ' + app));
      document.head.append(s);
    });
  }
  function persist() {
    if (!cur) return;
    L.write(cur.app, { index: cur.index, done: [...cur.done], status: cur.status, at: Date.now() });
  }
  function view(w) {
    const steps = cur.tour.steps;
    const i = cur.index, s = steps[i];
    return {
      name: w.title, counter: tr('ui.tour.counter', { i: i + 1, n: steps.length }), index: i, n: steps.length,
      title: w.steps[i].title, text: w.steps[i].text, last: i === steps.length - 1,
      hint: s.target && !T.spot.target ? tr('ui.tour.offscreen') : '',
      steps: steps.map((x, k) => ({ title: w.steps[k].title, done: cur.done.has(x.id) })),
    };
  }
  function show() {
    const w = L.words(cur.tour), s = cur.tour.steps[cur.index];
    T.spot.show(s, w.steps[cur.index].title, w.steps[cur.index].text);
    T.panel.render(view(w));
    emit();
  }
  /** The language changed: the same step again in the new words, without scrolling or moving focus. */
  function retext() {
    if (!cur) return;
    const w = L.words(cur.tour);
    T.spot.retext(w.steps[cur.index].title, w.steps[cur.index].text);
    T.panel.render(view(w));
  }
  if (globalThis.SlopI18n && SlopI18n.on) SlopI18n.on(retext);
  function go(i) {
    cur.index = L.clamp(i, cur.tour.steps.length);
    cur.status = 'active';
    persist();
    show();
  }
  /** Open a tour. Resumes at the saved step unless restart is set. Resolves true when the panel is up. */
  async function start(app, { restart = false } = {}) {
    const tour = await load(app);
    if (cur) close();
    const saved = L.read(app);
    cur = { app, tour, index: restart ? 0 : L.resumeIndex(saved, tour.steps.length), done: new Set(restart ? [] : saved.done), status: 'active' };
    T.panel.open({
      next, back, skip, close, restart: () => { cur.done.clear(); go(0); },
      jump: (i) => go(i),
    });
    persist();
    show();
    return true;
  }
  function next() {
    if (!cur) return;
    if (cur.index >= cur.tour.steps.length - 1) return finish();
    cur.done.add(cur.tour.steps[cur.index].id);
    go(cur.index + 1);
  }
  function back() { if (cur && cur.index > 0) go(cur.index - 1); }
  function skip() {
    if (!cur) return;
    if (cur.index >= cur.tour.steps.length - 1) return finish();
    go(cur.index + 1);
  }
  function finish() {
    cur.done.add(cur.tour.steps[cur.index].id);
    cur.status = 'finished';
    cur.index = cur.tour.steps.length - 1;
    persist();
    end();
  }
  /** Close the tour and keep its place: the next start resumes here. */
  function close() {
    if (!cur) return;
    if (cur.status !== 'finished') cur.status = 'closed';
    persist();
    end();
  }
  function end() {
    T.spot.hide();
    T.panel.close();
    const was = cur;
    cur = null;
    if (was) emit(was.app);
  }
  function emit(app) {
    const info = current();
    subs.forEach((fn) => { try { fn(info, app); } catch (e) { console.warn(e); } });
  }
  /** Where the viewer is in a tour: { app, index, n, status } or null when no tour is open. */
  function current() {
    return cur ? { app: cur.app, index: cur.index, n: cur.tour.steps.length, status: cur.status } : null;
  }
  /** Saved progress for an app, without opening it: { index, done, status, at }. */
  function status(app) { return L.read(app); }
  /** Forget an app's saved progress. The page itself is not touched. */
  function reset(app) { if (cur && cur.app === app) close(); L.clear(app); }
  /** Listen for 'change' (step moved) and 'close' (the tour ended). Returns an off function. */
  function on(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }

  T.define = define;
  T.load = load;
  T.start = start;
  T.resume = start;
  T.next = next;
  T.back = back;
  T.skip = skip;
  T.close = close;
  T.restart = (app) => start(app, { restart: true });
  T.reset = reset;
  T.current = current;
  T.status = status;
  T.isOpen = () => !!cur;
  T.on = on;
  T.base = BASE;
})();
