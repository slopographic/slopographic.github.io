/* Slop Gallery: content hashing. SHA-256 of the original bytes (crypto.subtle), used to find exact duplicates.
 * Classic script, exposes window.SlopGallery.hash. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});

  /** SHA-256 of an ArrayBuffer or Blob, as lowercase hex. */
  async function sha256(data) {
    const buf = data instanceof Blob ? await data.arrayBuffer() : data;
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  G.hash = { sha256, isHex64: (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s) };
})();
