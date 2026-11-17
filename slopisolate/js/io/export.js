/* SlopIsolate — export. One image: its look rendered at full resolution, encoded in S.exportOpts.format and
 * downloaded. Many images: every finished item into one zip. A fresh worker job is built per item so the
 * export always matches the item's settings and brush edits; the job and the decoded bitmap are freed after. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, C = CO.compose, P = CO.process, t = U.t;
  const MIME = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg' };
  const toast = (msg) => { if (window.SlopUI) SlopUI.toast(msg); };
  const busy = (on, msg, progress) => CO.emit('busy', { on, msg, progress: progress == null ? null : progress });

  /** Encode a canvas in the chosen format. JPG has no alpha, so the JPG background fills first. */
  async function encode(canvas, format) {
    const o = S.exportOpts;
    const fmt = MIME[format || o.format] ? format || o.format : 'png';
    let src = canvas;
    if (fmt === 'jpg') {
      src = U.canvas(canvas.width, canvas.height);
      const g = U.ctx(src);
      g.fillStyle = o.jpgBg || '#ffffff';
      g.fillRect(0, 0, src.width, src.height);
      g.drawImage(canvas, 0, 0);
    }
    const q = fmt === 'png' ? undefined : U.clamp(Number(o.quality) || 0.92, 0.01, 1);
    const blob = await U.blobOf(src, MIME[fmt], q);
    // Browsers without WebP encoding fall back to PNG: name the file after what was really written.
    const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
    return { blob, ext };
  }

  /** Build a fresh record for an item, hand its full-resolution render to fn, then free the job and bitmap. */
  async function withPicture(it, fn) {
    const act = await P.build(it);
    try { return await fn(C.render(it, act)); }
    finally {
      if (act.bitmap && act.bitmap.close) act.bitmap.close();
      Promise.resolve(SlopCutout.release(act.jobId)).catch(() => {});
    }
  }

  /** Render and encode one item. */
  const encodeItem = (it, format) => withPicture(it, (canvas) => encode(canvas, format));

  CO.export = {};
  /** One item's finished picture, encoded (format: png|webp|jpg, default the chosen export format) → { blob, ext }.
   *  Open in…, Save to Slop Drive and Run a workflow… send this. */
  CO.export.encode = encodeItem;

  /** Export one image and download it as <name>-cutout.<ext>. */
  CO.export.one = async function (it) {
    it = it || S.current();
    if (!it) return toast(t('cutout.menu.open_first'));
    if (it.status !== 'done') return toast(t('cutout.export.wait'));
    busy(true, t('cutout.export.exporting'));
    try {
      const { blob, ext } = await encodeItem(it);
      const name = U.baseName(it.name) + '-cutout.' + ext;
      if (window.SlopUI) SlopUI.download(blob, name);
      SlopSupport.afterExport('slopisolate');
      toast(t('cutout.export.saved', { name, size: U.fmtBytes(blob.size) }));
    } catch (e) {
      console.error(e);
      toast(t('cutout.export.failed', { error: String(e.message || e) }));
    } finally { busy(false); }
  };

  /** Export every finished image (or those of `list`: the selected pictures) into one zip (slop-cutouts.zip). Names are
   *  made unique. */
  CO.export.all = async function (list) {
    const items = (Array.isArray(list) ? list : S.items).filter((it) => it.status === 'done' && it.kind !== 'video');
    if (!items.length) return toast(t('cutout.export.none'));
    const entries = [], used = new Set();
    let failed = 0;
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        busy(true, t('cutout.export.exporting_i', { i: i + 1, n: items.length }), i / items.length);
        try {
          const { blob, ext } = await encodeItem(it);
          const base = U.baseName(it.name) + '-cutout';
          let name = base + '.' + ext;
          for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}.${ext}`;
          used.add(name.toLowerCase());
          entries.push({ name, blob });
        } catch (e) { failed++; console.error(e); }
      }
      if (!entries.length) return toast(t('cutout.export.failed_all'));
      busy(true, t('cutout.export.zipping'), 1);
      const zip = await CO.zip(entries);
      if (window.SlopUI) SlopUI.download(zip, 'slop-cutouts.zip');
      SlopSupport.afterExport('slopisolate');
      toast(t(failed ? 'cutout.export.saved_zip_failed' : 'cutout.export.saved_zip', { n: entries.length, failed }));
    } catch (e) {
      console.error(e);
      toast(t('cutout.export.failed', { error: String(e.message || e) }));
    } finally { busy(false); }
  };
})();
