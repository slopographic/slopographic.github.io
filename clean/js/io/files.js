/* SlopClean: reading pictures, previews, decode checks and copy names. Classic script; sets window.CL.io.
 * An item is one picture: { id, name, size, blob, bytes, driveId, format, label, findings, out, error, thumb }. */
(function () {
  'use strict';
  const CL = (window.CL = window.CL || {});
  let seq = 0;
  const ACCEPT = 'image/jpeg,image/png,image/webp,image/tiff,.jpg,.jpeg,.png,.webp,.tif,.tiff';

  /** "photo.jpg" -> "photo (clean).jpg" */
  function copyName(name) {
    const i = name.lastIndexOf('.');
    return i > 0 ? `${name.slice(0, i)} (clean)${name.slice(i)}` : `${name} (clean)`;
  }

  /** Read one picture and list what it holds. Never throws: a file that cannot be read gets an error instead. */
  async function load(blob, name, { driveId = null } = {}) {
    const item = { id: 'p' + (++seq), name: name || 'picture', size: blob.size, blob, bytes: null, driveId, format: null, label: '', findings: [], out: null, error: '', thumb: null };
    try {
      item.bytes = new Uint8Array(await blob.arrayBuffer());
      const ins = C().inspect(item.bytes);
      item.format = ins.format; item.label = ins.label; item.findings = ins.findings || [];
      if (!ins.supported) {   // error stays English (the assistant reads it); errorMsg is the key the card shows (ui/report.js)
        item.error = ins.format ? `${ins.label} files are not supported. Export the picture as JPEG, PNG, WebP or TIFF first.` : 'This is not a JPEG, PNG, WebP or TIFF picture.';   // i18n-ignore
        item.errorMsg = ins.format ? { k: 'clean.err.unsupported', v: { format: ins.label } } : { k: 'clean.err.not_picture' };
      }
      else if (ins.format !== 'tiff') item.thumb = URL.createObjectURL(blob);
    } catch (err) {
      item.error = err.message || 'This file could not be read.';   // i18n-ignore (shown as clean.err.unreadable)
      item.errorMsg = err.message ? null : { k: 'clean.err.unreadable' };
    }
    return item;
  }

  /** Clean one item with the chosen categories. The result is checked by decoding it (TIFF: the structure only). */
  async function clean(item, remove) {
    item.out = null; item.error = ''; item.errorMsg = null;
    if (!item.bytes || !item.format || item.error) return item;
    try {
      const out = C().strip(item.bytes, { remove });
      if (out.format !== 'tiff') {
        const bmp = await createImageBitmap(new Blob([out.bytes], { type: out.mime }));
        const ok = bmp.width > 0 && bmp.height > 0;
        bmp.close();
        if (!ok) throw new Error('The cleaned picture would not decode');
      }
      item.out = out;
    } catch (err) {
      const reason = String(err.message || err).replace(/\.+$/, '');
      item.error = `Could not clean this picture: ${reason}. The original is untouched.`;   // i18n-ignore (shown as clean.err.clean_failed)
      // a format the core cannot write (HEIC...): the card says so in the person's language; else the core's reason
      item.errorMsg = /^(jpeg|png|webp|tiff)$/.test(item.format) ? { k: 'clean.err.clean_failed', v: { reason } } : { k: 'clean.err.cannot_write', v: { format: String(item.format).toUpperCase() } };
    }
    return item;
  }

  const C = () => window.SlopClean;
  CL.io = { ACCEPT, copyName, load, clean };
})();
