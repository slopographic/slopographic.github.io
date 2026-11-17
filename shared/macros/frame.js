/* Headless replay: runs an app's macro on a file without the app's window. The app's commands need the app (its document
 * model, its filters, its dialogs' code), so the app itself is loaded in a hidden same-origin iframe at
 * <app>/?macro-host=1. In that mode the app keeps nothing (no autosave, no recovery, no welcome) and serves
 * window.SlopMacroHost (shared/macros/macros.js serve): open the file, replay the steps with SlopCmd.exec (the same replay
 * as Play, shared/macros/core.js), write the result. One iframe per app, reused for every file of a run, one file at a
 * time, and removed after a minute of rest. ES module; used by shared/ops/macros.js (the Workflows step).
 *   runInHost({ app, url }, file, steps, options, { signal, timeout, progress }) → { blob, kind, info? }
 *   dropHosts()   removes the hidden apps now */
const SITE = new URL('../../', import.meta.url).href;
const hosts = new Map();
const IDLE_MS = 60000;

function frameFor(app, url) {
  let h = hosts.get(app);
  if (h) { clearTimeout(h.idle); return h; }
  const f = document.createElement('iframe');
  f.src = new URL(url, SITE).href;
  f.title = globalThis.SlopI18n ? globalThis.SlopI18n.t('ui.macro.frame_title', { app }) : app;   // shared/i18n/ui/<code>/macros.js
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.inert = true;
  f.dataset.macroHost = app;
  // in the page and drawn (an iframe that is not shown is slowed down by the browser), but out of sight and out of the way
  Object.assign(f.style, { position: 'fixed', left: '0', top: '0', width: '1024px', height: '768px', border: '0', opacity: '0', pointerEvents: 'none', zIndex: '-1' });
  document.body.append(f);
  h = { app, frame: f, idle: 0, busy: 0 };
  h.ready = new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      let host = null;
      try { host = f.contentWindow && f.contentWindow.SlopMacroHost; } catch (e) { host = null; }
      if (host) { host.ready.then(() => resolve(host), reject); return; }
      if (Date.now() - t0 > 45000) { reject(new Error(`${app} did not start in the background.`)); return; }
      setTimeout(tick, 50);
    };
    tick();
  });
  h.ready.catch(() => drop(app));
  hosts.set(app, h);
  return h;
}

function drop(app) {
  const h = hosts.get(app);
  if (!h) return;
  clearTimeout(h.idle);
  h.frame.remove();
  hosts.delete(app);
}
export function dropHosts() { for (const app of [...hosts.keys()]) drop(app); }

export async function runInHost({ app, url }, file, steps, options = {}, { signal = null, timeout = 120000, progress = null } = {}) {
  if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const h = frameFor(app, url);
  h.busy++;
  try {
    const host = await h.ready;
    let timer = 0;
    const late = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('The macro took too long and was stopped.')), timeout); });
    const r = await Promise.race([host.run(file, steps, options, { signal, progress }), late]).finally(() => clearTimeout(timer));
    // a Blob of this window (the iframe's own goes away with it)
    return { blob: new Blob([r.blob], { type: r.blob.type }), kind: r.kind, info: r.info ? JSON.parse(JSON.stringify(r.info)) : undefined };
  } finally {
    h.busy--;
    if (!h.busy && hosts.get(app) === h) h.idle = setTimeout(() => drop(app), IDLE_MS);
  }
}
