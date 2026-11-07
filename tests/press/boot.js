/* Shared setup for the Slop Press app tests: waits for the app in #app (a same-origin iframe) and exposes
   its namespace. The app runs with ?new so autosave never leaks between test pages. */
/* exported W, PR, bootPress, freshDoc, frameApp, ascii, loadPdfjs */
var W, PR;
function appReady(win) { try { return !!(win && win.document.querySelector('#app.ready') && win.PR); } catch (e) { return false; } }
async function bootPress() {
  const frame = document.getElementById('app');
  await SlopTest.waitFor(() => appReady(frame.contentWindow), { timeout: 30000 });
  W = frame.contentWindow; PR = W.PR;
  PR.store.enabled = false;
  return W;
}
/** A new blank document; returns { doc, page }. */
function freshDoc(o) {
  const doc = PR.model.create(Object.assign({ pages: 1, facing: false }, o || {}));
  PR.setDoc(doc);
  return { doc: PR.state.doc, page: PR.state.doc.pages[0] };
}
async function frameApp(src) {
  const f = document.createElement('iframe');
  f.style.cssText = 'width:1000px;height:700px;border:0';
  f.src = src; document.body.append(f);
  await SlopTest.waitFor(() => appReady(f.contentWindow), { timeout: 30000 });
  return f;
}
const ascii = (bytes, a = 0, b = bytes.length) => { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(bytes[i]); return s; };
async function loadPdfjs() {
  const base = new URL('../../vendor/pdfjs/', location.href).href;
  const lib = await import(base + 'pdf.min.js');
  lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
  return { lib, base };
}
SlopTest.describe('boot', () => {
  SlopTest.it('loads Slop Press with its panels, tools and the shared kits', async () => {
    await bootPress();
    const { expect } = SlopTest;
    expect(W.document.title).toContain('Slop Press');
    expect(W.document.querySelectorAll('#toolbar .tool').length).toBe(9);
    expect(typeof W.SlopUI.dialog).toBe('function');
    expect(typeof W.SlopHub.put).toBe('function');
    expect(PR.state.doc.pages.length).toBeGreaterThan(0);
  }, { timeout: 40000 });
});
