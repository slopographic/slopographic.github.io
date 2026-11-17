/* Slop Gallery: what a photo is, and the folder picker. Every way photos come in (Import, Ctrl+O, a drop of files or whole
 * folders, Import a folder, Import from Slop Drive, ?drive=<id>, a paste, the sample) is a source of the one intake
 * (shared/intake, registered in ui/main.js); this file only knows the photo types and walks a picked folder.
 *  - isImage(file, name)          a photo the library keeps (JPEG, PNG, WebP, GIF, AVIF, SVG, BMP, HEIC, camera RAW: CR2,
 *                                 CR3, NEF, ARW, DNG, RAF, ORF, RW2 and more); videos are not kept (they play in the Drive view)
 *  - rules()                      the intake rules (shared/intake/rules.js): the refusals, the picker and the drag label
 *  - fromDirectory()              showDirectoryPicker where the browser has it: its files, each with its path in
 *                                 file.slopPath ("Trip/a.jpg"); null where the browser cannot pick folders
 * Dropped folders are walked by SlopDrop.folders (shared/drop/folders.js), which sets the same slopPath.
 * Exposes window.SlopGallery.source. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml' };
  const isVideo = (file, name) => /^video\//.test(file.type || '') || /\.(webm|mp4|m4v|mov|mkv|ogv)$/i.test(name || file.name || '');
  const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(name || '') || [])[1]?.toLowerCase() || '';
  const isRaw = (name) => !!(window.SlopRaw && window.SlopRaw.isRawName(name));   // camera RAW (shared/raw): by extension here
  const mimeOf = (name) => EXT[extOf(name)] || (isRaw(name) ? 'image/x-' + extOf(name) : 'application/octet-stream');
  const isImage = (file, name) => /^image\//.test(file.type || '') || !!EXT[extOf(name || file.name)] || isRaw(name || file.name);

  const withPath = (file, path) => { try { Object.defineProperty(file, 'slopPath', { value: path, configurable: true }); } catch (e) { /* frozen */ } return file; };
  /** Walks a FileSystemDirectoryHandle; only where showDirectoryPicker exists (Chromium). */
  async function walkHandle(dir, prefix, out) {
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file') out.push(withPath(await h.getFile(), prefix + name));
      else if (h.kind === 'directory') await walkHandle(h, prefix + name + '/', out);
    }
    return out;
  }
  async function fromDirectory() {
    if (!window.showDirectoryPicker) return null;
    let dir;
    try { dir = await window.showDirectoryPicker({ mode: 'read' }); } catch (e) { return []; }
    return walkHandle(dir, '', []);
  }
  /** The intake rules (camera RAW by extension once shared/raw is on the page). */
  const rules = () => ({
    types: ['image/*'],
    exts: ['.jpg', '.jpeg', '.jpe', '.png', '.webp', '.gif', '.avif', '.bmp', '.heic', '.heif', '.svg', ...(window.SlopRaw ? window.SlopRaw.EXTS.map((e) => '.' + e) : [])],
    noun: 'a photo',
  });

  G.source = { fromDirectory, mimeOf, isImage, isVideo, rules, EXT };
})();
