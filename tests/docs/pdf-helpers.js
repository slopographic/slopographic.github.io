/* Helpers for the Slop Docs PDF and header/footer tests (classic script, after tests/harness.js).
 * - DocsTest.installPacks(): the Noto language packs, as small subsets of the real fonts (tests/docs/fixtures, OFL), stored
 *   in this origin's IndexedDB the way SlopFontJIT stores a download, so the app finds them installed and asks nothing.
 * - DocsTest.open(): the real app (docs/index.html) in an iframe; DocsTest.close().
 * - DocsTest.readPdf(bytes): the PDF read back with pdf.js (vendor/pdfjs): { n, pages: [{ w, h, lines: [{ y, x, text }] }] },
 *   lines grouped by baseline from the text items, top to bottom, each line's items left to right. */
(function () {
  'use strict';
  const FX = new URL('fixtures/', document.currentScript.src).href;
  const PACKS = [
    ['noto-arabic', 'Noto Sans Arabic', 'noto-arabic-test.ttf'], ['noto-hebrew', 'Noto Sans Hebrew', 'noto-hebrew-test.ttf'],
    ['noto-devanagari', 'Noto Sans Devanagari', 'noto-devanagari-test.ttf'], ['noto-jp', 'Noto Sans JP', 'noto-jp-test.otf'],
    ['noto-sc', 'Noto Sans SC', 'noto-sc-test.otf'],
  ];
  const frames = [];
  const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });

  async function installPacks(ids) {
    if (!window.SlopLibraryStore) { await load('../../shared/library/manifest.js'); await load('../../shared/library/store.js'); }
    for (const [id, family, file] of PACKS) {
      if (ids && !ids.includes(id)) continue;
      const buf = await (await fetch(FX + file)).arrayBuffer();
      const name = file.replace('-test', '-Regular');
      await SlopLibraryStore.savePack({ id, kind: 'font', name: family, licence: 'OFL-1.1', licenceUrl: '', description: 'test subset', size: buf.byteLength,
        files: [{ name, url: '', size: buf.byteLength, sha256: '', family, weight: '400', style: 'normal' }] }, { [name]: new Blob([buf]) });
    }
  }
  async function removePacks(ids) { for (const [id] of PACKS) if (!ids || ids.includes(id)) await SlopLibraryStore.removePack(id); }

  async function open(src = '../../docs/', width = 1100) {
    const f = document.createElement('iframe');
    f.style.cssText = `width:${width}px;height:800px;border:0`;
    f.src = src;
    document.body.append(f);
    frames.push(f);
    await SlopTest.waitFor(() => f.contentWindow && f.contentWindow.SlopDocs && f.contentWindow.SlopDocs.ready && f.contentWindow.document.querySelector('#pages .page'), { timeout: 20000 });
    return f.contentWindow;
  }
  async function closeAll() {
    for (const f of frames.splice(0)) f.remove();
    await SlopTest.sleep(300);
    localStorage.removeItem('slop.doctabs.docs.v1');
    await new Promise((res) => { const r = indexedDB.deleteDatabase('slop-doctabs'); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  }

  let pdfjs = null;
  async function readPdf(bytes) {
    if (!pdfjs) {
      pdfjs = await import('../../vendor/pdfjs/pdf.min.js');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.js', location.href).href;
    }
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i), vp = p.getViewport({ scale: 1 }), tc = await p.getTextContent();
      const rows = new Map();
      for (const it of tc.items) {
        if (!it.str) continue;
        const y = Math.round(it.transform[5] * 2) / 2;
        let key = [...rows.keys()].find((k) => Math.abs(k - y) < 3);
        if (key === undefined) { key = y; rows.set(key, []); }
        rows.get(key).push({ x: it.transform[4], str: it.str, dir: it.dir });
      }
      const lines = [...rows].sort((a, b) => b[0] - a[0]).map(([y, its]) => ({ y: vp.height - y, x: Math.min(...its.map((t) => t.x)), text: its.sort((a, b) => a.x - b.x).map((t) => t.str).join('') }));
      pages.push({ w: vp.width, h: vp.height, lines, page: p });
    }
    return { n: doc.numPages, pages, doc };
  }
  /** Text with the invisible joiner the PDF maps Arabic dot glyphs to, and all spacing, removed (for comparing words). */
  const squash = (s) => String(s).replace(/[\u034f\u200b-\u200f\s]/g, '');

  window.DocsTest = { installPacks, removePacks, open, closeAll, readPdf, squash, PACKS, lib: () => pdfjs };
})();
