/* SlopFaces crops: a small square picture of each face, cut from its photo on this device. Each photo is decoded once for
 * all its faces, and the crops are object URLs kept in one cache per page (ref -> URL), so a long list does not decode a
 * picture again. The blob comes from the app (adapter.blobOf). Classic script; adds to window.SlopFaces.crops. */
(function (g) {
  'use strict';
  const F = (g.SlopFaces = g.SlopFaces || {});
  const C = (F.crops = F.crops || {});
  const SIZE = 96, PAD = 0.35;
  const urls = new Map();

  /** Cuts one face out of a decoded picture: a square around its box, with a margin. Returns a blob or null. */
  async function cut(bmp, box) {
    const side = Math.max(box.w, box.h) * (1 + 2 * PAD);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const c = g.document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(bmp, cx - side / 2, cy - side / 2, side, side, 0, 0, SIZE, SIZE);
    return new Promise((res) => c.toBlob((b) => res(b || null), 'image/jpeg', 0.85));
  }

  /** Fills the cache for the faces given ([{ ref, id, box }]). adapter.blobOf(id) gives the photo's blob or null. Faces
   * already cut are skipped. Resolves with how many were cut now. */
  C.load = async function (faces, adapter) {
    if (!g.createImageBitmap || !g.document) return 0;
    let cut_ = 0;
    const byPic = new Map();
    for (const f of faces) if (!urls.has(f.ref)) { if (!byPic.has(f.id)) byPic.set(f.id, []); byPic.get(f.id).push(f); }
    for (const [id, list] of byPic) {
      try {
        const blob = await adapter.blobOf(id);
        if (!blob) continue;
        const bmp = await g.createImageBitmap(blob);
        try {
          for (const f of list) {
            const b = await cut(bmp, f.box);
            if (b) { urls.set(f.ref, g.URL.createObjectURL(b)); cut_++; }
          }
        } finally { if (bmp.close) bmp.close(); }
      } catch (e) { /* a picture that cannot be read has no crops */ }
    }
    return cut_;
  };
  /** The crop URL of a face, or null while it is not cut. */
  C.url = (ref) => urls.get(ref) || null;
  /** Frees every crop URL (the panel does this when it closes). */
  C.clear = () => { for (const u of urls.values()) g.URL.revokeObjectURL(u); urls.clear(); };
})(typeof window !== 'undefined' ? window : globalThis);
