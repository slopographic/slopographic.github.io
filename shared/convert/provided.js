/* The files an app hands to the Convert dialog: what it has open. The contract (see HANDOFF.md) is one event, so an app
 * needs nothing loaded to take part and the order its scripts and the dialog load in does not matter. Once, at boot:
 *
 *   addEventListener('slop:convert-files', (e) => e.detail.provide(() => sheetAsXlsx()));
 *
 * provide(x) takes the files, or a function that returns them (called only when the dialog opens), or a Promise of them:
 * File objects or { name, blob }, one or an array, or null when nothing is open. The dialog opens preloaded with them, and
 * says where they came from (the page's app name, or provide(x, { app: 'Name' })).
 *   ask() -> Promise<{ files: File[], app: string }> */
export const EVENT = 'slop:convert-files';

function toFile(f) {
  if (!f) return null;
  if (typeof File !== 'undefined' && f instanceof File) return f;
  if (f.blob instanceof Blob) return new File([f.blob], String(f.name || 'file'), { type: f.blob.type || '' });
  return null;
}

export async function ask() {
  const offers = [];
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { provide: (x, o = {}) => offers.push({ x, app: o.app || '' }) } }));
  const files = [];
  let app = '';
  for (const { x, app: name } of offers) {
    try {
      const v = await (typeof x === 'function' ? x() : x);
      const got = [].concat(v || []).map(toFile).filter(Boolean);
      if (got.length) { files.push(...got); app = app || name; }
    } catch (e) { console.warn('Convert: the app could not hand over its file', e); }
  }
  const cur = window.SlopShell && window.SlopShell.currentApp;
  return { files, app: app || (cur && cur.name) || 'this app' };
}
