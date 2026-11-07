/* Slop Drive — core/dupes: find duplicate files. Files are grouped by size first; only same-size files
 * are hashed (SHA-256 via crypto.subtle). Optionally flags near-duplicate images with a 64-bit dHash. */
'use strict';
(function (DR) {
  const hashes = new Map();
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  async function sha256(r) {
    const k = r.id + ':' + r.size + ':' + r.modified;
    if (!hashes.has(k)) hashes.set(k, crypto.subtle.digest('SHA-256', await r.blob.arrayBuffer()).then(hex));
    return hashes.get(k);
  }
  DR.sha256 = sha256;
  /** 64-bit difference hash of an image as a BigInt (9×8 greyscale, compare neighbours). */
  async function dHash(blob) {
    const bmp = await createImageBitmap(blob, { resizeWidth: 9, resizeHeight: 8, resizeQuality: 'medium' }).catch(() => createImageBitmap(blob));
    const c = document.createElement('canvas'); c.width = 9; c.height = 8;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, 9, 8); bmp.close();
    const d = g.getImageData(0, 0, 9, 8).data, lum = (i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    let h = 0n;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const i = (y * 9 + x) * 4; h = (h << 1n) | (lum(i) > lum(i + 4) ? 1n : 0n); }
    return h;
  }
  DR.dHash = dHash;
  const bits = (x) => { let n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };
  DR.hamming = (a, b) => bits(a ^ b);

  /** Resolves with { groups: [{ hash, size, files, wasted }], wasted, scanned, near: [{ files, distance }] }. */
  DR.findDupes = async function ({ near = false, onProgress = () => {}, threshold = 6 } = {}) {
    const files = DR.liveFiles().filter((r) => r.size > 0 && r.blob);
    const bySize = new Map();
    for (const r of files) { if (!bySize.has(r.size)) bySize.set(r.size, []); bySize.get(r.size).push(r); }
    const cands = [...bySize.values()].filter((g) => g.length > 1).flat();
    const byHash = new Map();
    let i = 0;
    for (const r of cands) {
      onProgress(DR.t('drive.dupes.hashing', { i: ++i, n: cands.length }));
      const h = await sha256(r);
      if (!byHash.has(h)) byHash.set(h, []);
      byHash.get(h).push(r);
    }
    const groups = [...byHash.entries()].filter(([, g]) => g.length > 1)
      .map(([hash, g]) => ({ hash, size: g[0].size, files: g.sort((a, b) => (b.modified || b.time) - (a.modified || a.time)), wasted: g[0].size * (g.length - 1) }))
      .sort((a, b) => b.wasted - a.wasted);
    const out = { groups, wasted: groups.reduce((n, g) => n + g.wasted, 0), scanned: files.length, near: [] };
    if (near) {
      const exact = new Set(groups.flatMap((g) => g.files.slice(1).map((r) => r.id)));
      const imgs = files.filter((r) => DR.kindOf(r) === 'image' && !DR.isSvg(r) && !exact.has(r.id)), hs = [];
      for (const r of imgs) { onProgress(DR.t('drive.dupes.comparing', { i: hs.length + 1, n: imgs.length })); try { hs.push({ r, h: await dHash(r.blob) }); } catch (e) { /* undecodable */ } }
      const seen = new Set();
      for (let a = 0; a < hs.length; a++) {
        if (seen.has(a)) continue;
        const grp = [hs[a].r]; let worst = 0;
        for (let b = a + 1; b < hs.length; b++) {
          if (seen.has(b)) continue;
          const d = DR.hamming(hs[a].h, hs[b].h);
          if (d <= threshold && !(hs[a].r.size === hs[b].r.size && groups.some((g) => g.files.includes(hs[a].r) && g.files.includes(hs[b].r)))) { grp.push(hs[b].r); seen.add(b); worst = Math.max(worst, d); }
        }
        if (grp.length > 1) out.near.push({ files: grp, distance: worst });
      }
    }
    return out;
  };
  /** Which files to trash so one per group stays. keep: 'newest' | 'oldest' | a file id. */
  DR.dupesToTrash = function (group, keep = 'newest') {
    const by = (r) => r.modified || r.time;
    let k;
    if (keep === 'newest') k = group.files.reduce((a, b) => (by(b) > by(a) ? b : a));
    else if (keep === 'oldest') k = group.files.reduce((a, b) => (by(b) < by(a) ? b : a));
    else k = group.files.find((r) => r.id === keep) || group.files[0];
    return group.files.filter((r) => r !== k);
  };
})(window.DR);
