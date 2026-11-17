/* Slop Resize: formats, names and what this browser can write. Classic script; exposes window.SlopResize.format.
 *   kind(file)              'image' | 'video' | null (by MIME type, then by extension)
 *   IMAGE_OUT               the image types we can write, with their extension and whether they have alpha or quality
 *   imageSupport()          Promise<Set<mime>> of the image types this browser encodes (probed once, cached)
 *   outName(name, w, h, ext) "photo-500x500.jpg" (the base name of the original, never the original's own name)
 *   bytes(n)                "1.2 MB", "480 KB", "96 B"
 *   baseName(name)          the name without its extension */
(function (g) {
  'use strict';
  const NS = (g.SlopResize = g.SlopResize || {});
  const F = (NS.format = {});
  const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv)$/i;
  const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i;

  F.IMAGE_OUT = [
    { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG', lossy: true, alpha: false },
    { mime: 'image/png', ext: 'png', label: 'PNG', lossy: false, alpha: true },
    { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true, alpha: true },
    { mime: 'image/avif', ext: 'avif', label: 'AVIF', lossy: true, alpha: true },
  ];
  F.byMime = (mime) => F.IMAGE_OUT.find((f) => f.mime === mime) || null;

  F.kind = function (file) {
    const type = (file && file.type) || '', name = (file && file.name) || '';
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (VIDEO_EXT.test(name)) return 'video';
    if (IMAGE_EXT.test(name) || (g.SlopRaw && g.SlopRaw.isRawName(name))) return 'image';   // camera RAW: shared/raw
    return null;
  };

  F.baseName = (name) => { const s = String(name || ''), b = s.replace(/\.[^./\\]+$/, ''); return b || s || 'picture'; };
  F.outName = (name, w, h, ext) => `${F.baseName(name)}-${w}x${h}.${ext}`;

  F.bytes = function (n) {
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
  };

  let support = null;
  /** The image MIME types this browser can write. A type the browser cannot write quietly comes back as PNG, so we
   *  check the type that comes back, not just that toBlob ran. */
  F.imageSupport = function () {
    if (!support) support = (async () => {
      const ok = new Set(['image/png']);
      const cv = document.createElement('canvas');
      cv.width = cv.height = 4;
      if (!cv.getContext) return ok;
      for (const f of F.IMAGE_OUT) {
        if (f.mime === 'image/png') continue;
        try {
          const b = await new Promise((res) => cv.toBlob(res, f.mime, 0.8));
          if (b && b.type === f.mime) ok.add(f.mime);
        } catch (e) { /* not supported */ }
      }
      return ok;
    })();
    return support;
  };
})(typeof window !== 'undefined' ? window : globalThis);
