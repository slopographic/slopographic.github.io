/* Test helper for the Fonts panel tests (tests/fonts/*.test.html). Load it before shared/fonts/picker.js.
 * packs.json is served from memory with one test pack (its file is a real bundled WOFF2, so the hash is real). The pack's bytes
 * are only served on a confirmed download, and counted in window.__net.packBytes. Everything else is the real network.
 * window.FontTest: a Barlow file from the PDF fixtures, drop and pick helpers, and removal of the person's own fonts. */
(function () {
  'use strict';
  const PACK_URL = 'https://raw.githubusercontent.com/example/test-fonts/main/ofl/testpack/TestPackSans-Regular.woff2';
  const realFetch = window.fetch.bind(window);
  window.__net = { packBytes: 0 };
  const hex = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
  window.__ready = (async () => {
    const bytes = await (await realFetch('../../shared/fonts/library/lato/lato-400-normal.woff2')).arrayBuffer();
    const size = bytes.byteLength, sha = await hex(bytes);
    window.__bytes = bytes;
    window.__manifest = {
      note: 'test manifest', hosts: ['raw.githubusercontent.com'],
      packs: [{ id: 'test-pack', name: 'Test Pack Sans', licence: 'OFL-1.1', description: 'Test only', size,
        files: [{ name: 'TestPackSans-Regular.woff2', url: PACK_URL, size, sha256: sha, family: 'Test Pack Sans', weight: '400', style: 'normal' }] }],
    };
  })();
  window.fetch = async (input, init) => {
    const url = String(input && input.url ? input.url : input);
    if (/\/shared\/library\/packs\.json$/.test(url)) { await window.__ready; return new Response(JSON.stringify(window.__manifest), { status: 200, headers: { 'content-type': 'application/json' } }); }
    if (url === PACK_URL) { window.__net.packBytes++; await window.__ready; return new Response(window.__bytes, { status: 200 }); }
    return realFetch(input, init);
  };
  const fileList = (file) => { const dt = new DataTransfer(); dt.items.add(file); return dt; };
  window.FontTest = {
    /** Barlow Regular (TTF) from the PDF fixtures, as a File. */
    async barlowFile() { const r = await realFetch('../pdf/fixtures/Barlow-Regular.ttf'); return new File([await r.arrayBuffer()], 'Barlow-Regular.ttf', { type: 'font/ttf' }); },
    /** Drops a file on an element (a row or the panel). */
    drop(target, file) { target.dispatchEvent(new DragEvent('drop', { dataTransfer: fileList(file), bubbles: true, cancelable: true })); },
    /** Picks a file in a file input, as the person would in the file dialog. */
    pick(input, file) { input.files = fileList(file).files; input.dispatchEvent(new Event('change')); },
    /** Removes the fonts the person added on this device (so each test starts with Barlow missing). */
    async removeOwnFonts() {
      await window.SlopFonts.ready();
      for (const p of await window.SlopLibraryStore.listPacks()) if (p.licence === 'user') await window.SlopLibraryStore.removePack(p.id);
    },
    /** Closes whatever Fonts panel or library dialog is open. */
    closeAll() { document.querySelectorAll('.sf-ov, .slop-lib-ov').forEach((n) => n.remove()); },
  };
})();
