/* What the Convert dialog (dialog.js) needs on a page that did not load it: the dialog kit (SlopUI), the drop zone
 * (SlopDrop), the dialog's own styles, and Slop Hub (Save to Slop Drive, Open in…) once there are results. Each file loads
 * once, in order; a file the page already has (same URL, or its global) is skipped. Through SlopLoad where the page has it.
 *   deps() -> Promise   hub() -> Promise<SlopHub>   url(rel) -> absolute URL of a site-root path */
const ROOT = new URL('../../', import.meta.url);
const done = new Map();

export const url = (rel) => new URL(rel, ROOT).href;

function script(rel) {
  const src = url(rel);
  if (window.SlopLoad && window.SlopLoad.script) return window.SlopLoad.script(src);
  if ([...document.scripts].some((s) => s.src === src && !s.dataset.cvtLoading)) return Promise.resolve();
  if (!done.has(src)) done.set(src, new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src, async: false });
    s.dataset.cvtLoading = '1';
    s.onload = () => { delete s.dataset.cvtLoading; res(); };
    s.onerror = () => { done.delete(src); s.remove(); rej(new Error('Could not load ' + rel)); };
    document.head.append(s);
  }));
  return done.get(src);
}

function css(rel) {
  const href = url(rel);
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return;
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
}

let ready = null;
/** SlopUI, the intake pipeline (shared/intake), SlopDrop (panel, drop) and dialog.css. */
export function deps() {
  if (!ready) ready = (async () => {
    css('shared/convert/dialog.css');
    if (!window.SlopUI) { css('shared/slopui.css'); await script('shared/slopui.js'); }
    const SI = () => window.SlopIntake || {};
    if (!SI().rules) await script('shared/intake/rules.js');
    if (!SI().normalize) await script('shared/intake/normalize.js');
    if (!SI().createPipeline) await script('shared/intake/pipeline.js');
    if (!SI().take) await script('shared/intake/intake.js');
    if (!SI().pick) await script('shared/intake/sources.js');
    if (!(window.SlopDrop || {}).panel) await script('shared/drop/panel.js');
    if (!(window.SlopDrop || {}).attach) await script('shared/drop/drop.js');
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

/** Slop Hub (and the app registry it reads), for saving results to Slop Drive and opening them in another app. */
export async function hub() {
  if (!window.SLOP_APPS) await script('shared/apps.js');
  if (!window.SlopHub) await script('shared/hub.js');
  if (!window.SlopOuttake) await script('shared/intake/outtake.js');   // the one "Open in…" builder (SlopHub.openIn)
  if (!window.SlopWorkflowEntry) await script('shared/ops/entry.js');  // its Run a workflow… and Add to a workflow… items
  return window.SlopHub;
}
