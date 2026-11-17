/* Slop Isolate on a device too low on memory for the model (iOS 16/17: "no available backend found. ERR: [wasm]
 * RangeError: Out of memory"). The real app and worker run with a fake ONNX Runtime (through SlopCutout.configure's
 * sources, as an offline build passes its files) whose every session creation throws RangeError: Out of memory. The
 * engine retries lighter and with the smallest model, then gives up with code 'low-memory'; the app says so in words
 * (never the raw error), keeps the whole photo, and the Keep / Remove brushes still cut it by hand. On iOS / iPadOS before
 * 17 (stood in for through configure's ios / ua) the engine refuses at once with code 'unavailable'. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const f = document.getElementById('app');
  const FAKE_ORT = [
    'export const env = { wasm: {} };',
    'export class Tensor { constructor(t, d, dims) { this.data = d; this.dims = dims; } }',
    "export const InferenceSession = { create: async () => { throw new Error('no available backend found. ERR: [wasm] RangeError: Out of memory'); } };",
  ].join('\n');
  const blob = (parts, type) => URL.createObjectURL(new Blob(parts, { type }));

  let w = null;
  const toasts = [];
  async function open() {
    if (w) return w;
    f.src = '../../slopisolate/index.html';
    await waitFor(() => f.contentWindow && f.contentWindow.CO && f.contentWindow.CO.process && f.contentWindow.SlopCutout && f.contentWindow.document.readyState === 'complete', { timeout: 30000 });
    w = f.contentWindow;
    // synthetic pointer ids cannot be captured; the capture is not what is under test
    w.Element.prototype.setPointerCapture = function () {};
    w.Element.prototype.releasePointerCapture = function () {};
    const ort = blob([FAKE_ORT], 'text/javascript'), wasm = blob([new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])], 'application/wasm');
    w.SlopCutout.configure({ sources: { 'ort.wasm.min.mjs': ort, 'ort.min.mjs': ort, 'ort-wasm-simd-threaded.wasm': wasm, 'ort-wasm-simd-threaded.jsep.wasm': wasm } });
    const toast = w.SlopUI.toast;
    w.SlopUI.toast = function (msg) { toasts.push(String(msg)); return toast.apply(this, arguments); };
    return w;
  }

  describe('AI out of memory', () => {
    it('the engine rejects with code low-memory and words for people, after trying lighter and the Fast model', async () => {
      const win = await open();
      let err = null;
      try { await win.SlopCutout.load('quality'); } catch (e) { err = e; }
      expect(!!err).toBe(true);
      expect(err.code).toBe('low-memory');
      expect(err.message).toBe(win.SlopCutout.lowMemoryText('low_memory'));
      expect(/RangeError|no available backend/.test(err.message)).toBe(false);
      expect(/RangeError: Out of memory/.test(err.detail)).toBe(true);
    }, { timeout: 60000 });

    it('the sample opens without the AI: the friendly message, the whole photo kept, no raw error', async () => {
      const win = await open(), CO = win.CO;
      await CO.files.sample();
      await waitFor(() => CO.state.items.length === 1 && CO.state.items[0].status !== 'working' && CO.state.items[0].status !== 'queued', { timeout: 60000, polling: 200 });
      const it = CO.state.items[0];
      expect(it.status).toBe('done');
      expect(it.manual).toBe('manual');
      await waitFor(() => CO.process.active && CO.process.active.mask, { timeout: 30000 });
      const msg = win.document.getElementById('statusMsg').textContent;
      expect(msg).toBe(win.SlopCutout.lowMemoryText('manual'));
      expect(/low on memory/i.test(msg)).toBe(true);
      expect(toasts.filter((t) => t === win.SlopCutout.lowMemoryText('manual')).length).toBe(1);
      expect(toasts.some((t) => /RangeError|no available backend/.test(t))).toBe(false);
      expect(CO.process.active.mask.every((v) => v === 255)).toBe(true);
      expect(win.document.getElementById('btnDownload').disabled).toBe(false);
    }, { timeout: 90000 });

    it('the Remove brush still cuts the photo by hand, and the stroke can be undone', async () => {
      const win = await open(), CO = win.CO, act = CO.process.active;
      await sleep(150);
      CO.state.setTool('remove');
      const g = CO.view.geom(), r = win.document.getElementById('stage').getBoundingClientRect();
      const ix = act.w >> 1, iy = act.h >> 1, idx = iy * act.w + ix;
      const cx = r.left + ix * g.scale + g.ox, cy = r.top + iy * g.scale + g.oy;
      const at = (x, y, type, extra) => win.document.getElementById('stage').dispatchEvent(new win.PointerEvent(type, Object.assign({ clientX: x, clientY: y, bubbles: true, pointerId: 7, pointerType: 'mouse', isPrimary: true }, extra)));
      at(cx, cy, 'pointerdown', { button: 0 });
      for (let k = 1; k <= 6; k++) at(cx + k * 2, cy, 'pointermove', { buttons: 1 });
      at(cx + 12, cy, 'pointerup', { button: 0 });
      await waitFor(() => CO.process.active && CO.process.active.mask[idx] < 128, { timeout: 20000 });
      expect(CO.history.can(CO.state.current(), 'undo')).toBe(true);
    }, { timeout: 60000 });

    it('iOS / iPadOS before 17: the engine says at once that it cannot run here, without starting ORT', async () => {
      const win = await open(), t0 = Date.now();
      win.SlopCutout.configure({ ios: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
      let err = null;
      try { await win.SlopCutout.load('quality'); } catch (e) { err = e; }
      expect(!!err).toBe(true);
      expect(err.code).toBe('unavailable');
      expect(err.message).toBe(win.SlopCutout.lowMemoryText('unavailable'));
      expect(/iOS \/ iPadOS 17/.test(err.detail)).toBe(true);
      expect(/no available backend|RangeError/.test(err.detail)).toBe(false);
      expect(Date.now() - t0 < 5000).toBe(true);
      win.SlopCutout.configure({ ios: false, ua: '' });
    }, { timeout: 30000 });
  });
})();
