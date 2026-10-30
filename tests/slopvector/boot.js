/* Shared setup for the SlopVector test pages: waits for the app in #app (a same-origin iframe)
   and exposes its modules plus small geometry helpers as globals for the test files. */
/* exported W, SV, G, IO, UI, HUB, bootVector, appReady, area, square, circlePts, blank, ascii, frameApp */
var W, SV, G, IO, UI, HUB;
function appReady(win) {
  try { const a = win && win.document && win.document.getElementById('app'); return !!(a && a.classList.contains('ready') && win.SV); } catch (e) { return false; }
}
async function bootVector() {
  const frame = document.getElementById('app');
  await SlopTest.waitFor(() => appReady(frame.contentWindow), { timeout: 30000 });
  W = frame.contentWindow; SV = W.SV; G = W.SVGeom; IO = SV.io; UI = SV.ui; HUB = SV.hub;
  return W;
}
/** Open another copy of the app in a fresh iframe (e.g. with ?drive=<id>) and wait for it. */
async function frameApp(src) {
  const f = document.createElement('iframe');
  f.style.cssText = 'width:900px;height:600px;border:0';
  f.src = src; document.body.append(f);
  await SlopTest.waitFor(() => appReady(f.contentWindow), { timeout: 30000 });
  return f;
}
const area = (subs) => subs.reduce((a, sp) => a + G.polyArea(G.flatten([sp], 0.25)[0].pts), 0);
const square = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
const circlePts = (cx, cy, r) => G.flatten(G.ellipseSubs(cx, cy, r, r), 0.25)[0].pts;
const blank = () => { SV.loadDoc(SV.newDoc(1200, 800, 'Test'), { fit: false }); SV.resetHistory(); };
const ascii = (bytes, a = 0, b = bytes.length) => { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(bytes[i]); return s; };
SlopTest.describe('boot', () => {
  SlopTest.it('loads SlopVector with the Sloppo sample, tools and the shared kits', async () => {
    await bootVector();
    const { expect } = SlopTest;
    expect(SV.state.doc.layers.map((l) => l.name)).toEqual(['Background', 'Sloppo', 'Type']);
    expect(W.document.querySelectorAll('.tool').length).toBe(22);
    expect(typeof W.SlopUI.dialog).toBe('function');
    expect(typeof W.SlopHub.put).toBe('function');
    expect(W.document.title).toContain('SlopVector');
  }, { timeout: 40000 });
});
