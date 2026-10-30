/* Slop Recorder: what happens to a recording. Download, Save to Slop Drive and Open in… (SlopCut and every app that takes
 * the file, through SlopOuttake, the one way out). Each makes the file once (output.js: trimmed, in the chosen format) and
 * keeps it until the recording, the trim or the format changes. Classic script: SlopRec.save.
 *   use(rec)            the recording to save (null: none); drops the file made for the last one
 *   file(o)             → Promise<{ blob, name, type }> for the current trim and format (o: { progress, signal })
 *   download(), toDrive() → the Drive record id, openInItems() → SlopOuttake menu items
 *   stale()             the trim or the format changed: the next save makes the file again */
(function (g) {
  'use strict';
  const R = (g.SlopRec = g.SlopRec || {});
  let rec = null, made = null, key = '', name = '', busy = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const toast = (m) => { if (g.SlopUI && g.SlopUI.toast) g.SlopUI.toast(m); };

  function want() {
    const trim = R.view.trim(), f = R.settings.format();
    return { trim: trim, format: f, key: `${f}|${trim.start}|${trim.end}` };
  }
  function use(r) { rec = r; made = null; key = ''; name = r ? (r.name || R.plan.fileName(new Date(), 'x')) : ''; }
  function stale() { made = null; key = ''; }
  async function file(o = {}) {
    if (!rec) throw new Error(t('recorder.err.nothing'));
    const w = want();
    if (made && key === w.key) return made;
    if (busy && busy.key === w.key) return busy.p;
    const p = R.output.make(rec, { format: w.format, trim: w.trim, opts: R.settings.get(), name, progress: o.progress, signal: o.signal })
      .then((out) => { made = out; key = w.key; return out; })
      .finally(() => { if (busy && busy.p === p) busy = null; });
    busy = { key: w.key, p };
    return p;
  }
  async function download(o) {
    const out = await file(o);
    g.SlopUI.download(out.blob, out.name);
    return out;
  }
  async function toDrive(o) {
    const out = await file(o);
    if (!g.SlopHub) throw new Error(t('recorder.err.no_drive'));
    const id = await g.SlopHub.put(out.blob, { name: out.name, from: 'recorder' });
    toast(t('recorder.app.saved_drive', { name: out.name }));
    return { id, name: out.name };
  }
  /** Open in…: SlopCut first (it takes every video), then every other app that takes the file, then Save to Slop Drive…. */
  function openInItems() {
    const O = g.SlopOuttake;
    if (!O || !rec) return [];
    const f = R.settings.format(), type = f === 'gif' ? 'image/gif' : f === 'mp4' ? 'video/mp4' : f === 'wav' ? 'audio/wav' : (rec.blob.type || 'video/webm');
    const items = O.items({ get: () => file().then((x) => x.blob), name: () => (made ? made.name : name.replace(/\.[^.]+$/, '') + '.' + (f === 'webm' ? rec.ext : f)), type, from: 'recorder' });
    const cut = items.findIndex((i) => i.to === 'slopedit');
    if (cut > 0) items.unshift(items.splice(cut, 1)[0]);
    return items;
  }
  R.save = { use, file, download, toDrive, openInItems, stale, current: () => rec };
})(typeof window !== 'undefined' ? window : globalThis);
