/* Slop Watermark: Apply to all (one output per file, through the one watermark call, SlopWatermark.apply: pictures,
 * videos and PDFs alike), the ZIP of the results, and each result's Download, Save to Slop Drive and Open in…
 * Classic script. Exposes window.WMExport. Outputs are kept in memory until the setup changes or the list is cleared. */
(function () {
  'use strict';
  const ZIP_NAME = 'watermarked-files.zip';   // i18n-ignore: a file name
  const t = (k, v) => window.WMUtil.t(k, v);

  /** "photo.jpg" → "photo-watermarked.jpg"; a name already used in this batch gets "-2", "-3"... */
  function outName(name, blob, used) {
    const full = window.SlopWatermark.outName(name, blob), dot = full.lastIndexOf('.'), base = full.slice(0, dot), ext = full.slice(dot);
    let out = full, n = 2;
    while (used.has(out.toLowerCase())) out = base + '-' + n++ + ext;
    used.add(out.toLowerCase());
    return out;
  }

  /** Watermarks every file in order, each with specOf(item) (its own group's watermark). progress(done, total, name, part)
   *  before each one and while a video runs (part 0..1); signal stops the run. Resolves with { done, failed, stopped }.
   *  A file that fails keeps its error and no output. */
  async function applyAll(items, specOf, progress, signal) {
    const used = new Set();
    window.WMItems.clearOuts();
    let done = 0, failed = 0;
    for (const item of items) {
      if (signal.aborted) break;
      progress(done + failed, items.length, item.name, 0);
      let note = '';
      try {
        const blob = await window.SlopWatermark.apply(item.file, specOf(item), { signal, progress: (p) => progress(done + failed, items.length, item.name, p), notice: (msg) => { note = msg; } });
        window.WMItems.setOut(item.id, { blob, name: outName(item.name, blob, used) }, note);
        done++;
      } catch (err) {
        if (err && err.name === 'AbortError') break;
        window.WMItems.setError(item.id, (err && err.message) || t('watermark.probe.not_written'));
        failed++;
      }
    }
    return { done, failed, stopped: signal.aborted && done + failed < items.length };
  }

  /** One ZIP of every finished output (store only: pictures and videos are already compressed). */
  async function zipAll(items) {
    const entries = items.filter((x) => x.out).map((x) => ({ name: x.out.name, data: x.out.blob, time: Date.now() }));
    return window.SlopZip.zip(entries);
  }
  function downloadOne(item) { if (item.out) window.SlopUI.download(item.out.blob, item.out.name); }
  /** Open in… and Save to Slop Drive for one result, as a menu at (x, y): the site's one outbound menu (SlopOuttake). */
  function moreMenu(item, x, y) {
    if (!item.out) return;
    if (!window.SlopOuttake) { window.SlopUI.toast(t('watermark.toast.no_drive')); return; }
    const o = item.out;
    window.SlopOuttake.menu({ x, y }, { get: () => o.blob, name: o.name, type: o.blob.type, from: 'watermark' });
  }
  /** Every finished output into one Slop Drive folder the person picks. */
  async function saveAllToDrive(items) {
    const H = window.SlopHub, outs = items.filter((x) => x.out);
    if (!H || !outs.length) return 0;
    const folderId = await H.pickFolder({ title: t('watermark.drive.title', { n: outs.length }), start: await H.appFolderId('watermark') });
    if (folderId === undefined) return 0;
    for (const x of outs) await H.put(x.out.blob, { name: x.out.name, from: 'watermark', folderId });
    window.SlopUI.toast(t('watermark.toast.saved_n', { n: outs.length }));
    return outs.length;
  }

  window.WMExport = { applyAll, zipAll, downloadOne, moreMenu, saveAllToDrive, outName, ZIP_NAME };
})();
