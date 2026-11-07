/* SlopIntake normalize: whatever a source hands over becomes a list of Files with names and types, and a bounded pool
   runs the app's reader over them. Pure (no DOM, no fetch). Attaches to window.SlopIntake (normalize, listOf, toFile,
   dataUrlFile, pool). See shared/intake/HANDOFF.md.
   A source may give: a File, a FileList or array, a DataTransfer (a drop) or clipboard data (a paste: its files, or an
   <img src="data:..."> in its HTML), a Slop Drive record { id, name, type, blob } (the File keeps it as file.slopDrive),
   a converted result { name, blob }, a Blob, a data: URL string, a file handle (launchQueue: getFile()), or a Promise of
   any of these. */
(function (root) {
  'use strict';
  const SI = (root.SlopIntake = root.SlopIntake || {});
  const DATA_IMG = /<img[^>]+src="(data:image\/[^"]+)"/;
  const EXT = { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'text/plain': 'txt', 'application/pdf': 'pdf' };

  const FileCtor = () => root.File || (typeof File !== 'undefined' ? File : null);
  const isFile = (x) => !!x && typeof x === 'object' && typeof x.name === 'string' && typeof x.size === 'number' && !x.blob && typeof x.getFile !== 'function';
  const isBlob = (x) => !!x && typeof x === 'object' && typeof x.size === 'number' && typeof x.slice === 'function';
  const extOf = (type) => EXT[type] || (String(type).split('/')[1] || 'bin').replace(/[^a-z0-9].*$/i, '') || 'bin';

  /** A data: URL as a File (base64 or percent-encoded). name defaults to "pasted-image.<ext>" from its type. */
  SI.dataUrlFile = function (url, name) {
    const m = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(String(url || ''));
    if (!m) throw new Error('not a data: URL');
    const type = (m[1] || 'application/octet-stream').toLowerCase(), b64 = /;base64/i.test(m[2]);
    let bytes;
    if (b64) {
      const bin = (root.atob || ((s) => Buffer.from(s, 'base64').toString('binary')))(m[3].replace(/\s+/g, ''));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else bytes = new TextEncoder().encode(decodeURIComponent(m[3]));
    const F = FileCtor();
    return new F([bytes], name || 'pasted-image.' + extOf(type), { type });
  };

  /** A blob with a name (a Drive record, a converted file) as a File. The record stays on file.slopDrive when it has an id. */
  SI.toFile = function (blob, name, type, record) {
    const F = FileCtor();
    let f;
    try { f = new F([blob], name || blob.name || 'file', { type: type || blob.type || '', lastModified: blob.lastModified || Date.now() }); }
    catch (e) { f = blob; try { f.name = name; } catch (er) { /* read-only */ } }
    if (record && record.id != null) { try { Object.defineProperty(f, 'slopDrive', { value: { id: record.id, record }, configurable: true }); } catch (e) { /* frozen */ } }
    return f;
  };

  /** The items of a source as a plain array (not yet Files). Read at once: a drop's and a paste's data go after the event. */
  SI.listOf = function (input) {
    if (input == null) return [];
    if (Array.isArray(input)) return input.slice();
    if (typeof input === 'string') return [input];
    // A DataTransfer (a drop) or clipboard data (a paste): its files, else its file items, else a data: image in its HTML.
    if (typeof input === 'object' && ('files' in input || 'items' in input) && (typeof input.getData === 'function' || 'dropEffect' in input || 'types' in input)) {
      let files = Array.from(input.files || []);
      if (!files.length) files = Array.from(input.items || []).filter((i) => i && i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean);
      if (!files.length && typeof input.getData === 'function') {
        let html = '';
        try { html = input.getData('text/html') || ''; } catch (e) { /* no html */ }
        const m = html.match(DATA_IMG);
        if (m) files = [m[1]];
      }
      return files;
    }
    if (typeof input === 'object' && typeof input.length === 'number' && !isBlob(input) && typeof input !== 'function') return Array.from(input); // FileList
    return [input];
  };

  /** One item as a File (or null when it holds no file). */
  SI.fileOf = async function (x) {
    x = await x;
    if (!x) return null;
    if (typeof x === 'string') return /^data:/.test(x) ? SI.dataUrlFile(x) : null;
    if (isFile(x)) return x;
    if (typeof x.getFile === 'function') return x.getFile(); // a FileSystemFileHandle (PWA launch)
    if (x.blob && isBlob(x.blob)) return SI.toFile(x.blob, x.name, x.type || x.blob.type, x.id != null ? x : null);
    if (isBlob(x)) return SI.toFile(x, x.name || 'file.' + extOf(x.type || ''), x.type);
    return null;
  };

  /** Any source's input → Promise<File[]>. Items that hold no file are dropped. */
  SI.normalize = async function (input) {
    const list = SI.listOf(await input);
    const out = await Promise.all(list.map((x) => SI.fileOf(x).catch(() => null)));
    return out.filter(Boolean);
  };

  /** Runs fn(item, i) over items with at most n at once, in order of start. Resolves the results in the items' order,
   *  each { ok: true, value } or { ok: false, error }. stop(): true ends the run early (the rest are { skipped: true }). */
  SI.pool = function (items, n, fn, stop) {
    const out = new Array(items.length);
    let next = 0;
    const lane = async () => {
      while (next < items.length) {
        const i = next++;
        if (stop && stop()) { out[i] = { ok: false, skipped: true }; continue; }
        try { out[i] = { ok: true, value: await fn(items[i], i) }; } catch (error) { out[i] = { ok: false, error }; }
      }
    };
    const lanes = Math.max(1, Math.min(Number(n) || 1, items.length || 1));
    return Promise.all(Array.from({ length: lanes }, lane)).then(() => out);
  };
})(typeof window !== 'undefined' ? window : globalThis);
