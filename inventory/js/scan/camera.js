// Camera scanning with the browser's own BarcodeDetector (Chromium today) and getUserMedia. No library, no network.
// support() says plainly why the camera cannot be used here. start() shows the live video and reads a frame
// about five times a second. A code held in view is reported once; it is reported again only after it has
// left the view for three frames in a row, so one label never makes several movements.
(function (g) {
  'use strict';
  const NS = (g.SlopInv = g.SlopInv || {});
  const FRAME_MS = 200;
  const LEAVE_FRAMES = 3;
  const WANTED = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** { ok: true } or { ok: false, message } naming the missing piece. */
  function support() {
    if (typeof g.BarcodeDetector !== 'function') {
      return { ok: false, message: t('inventory.cam.no_detector') };
    }
    if (!g.navigator || !g.navigator.mediaDevices || !g.navigator.mediaDevices.getUserMedia) {
      return { ok: false, message: t('inventory.cam.no_camera') };
    }
    return { ok: true };
  }

  /** Plain words for a camera that would not start. */
  function cameraError(e) {
    const name = e && e.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return t('inventory.cam.refused');   // i18n-ignore: browser error names and search keywords, not shown
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return t('inventory.cam.none');   // i18n-ignore: browser error names and search keywords, not shown
    if (name === 'NotReadableError') return t('inventory.cam.busy');   // i18n-ignore: browser error names and search keywords, not shown
    return t('inventory.cam.failed', { why: e && e.message ? e.message : t('inventory.cam.unknown') });
  }

  async function formats() {
    const all = g.BarcodeDetector && typeof g.BarcodeDetector.getSupportedFormats === 'function'
      ? await g.BarcodeDetector.getSupportedFormats().catch(() => []) : [];
    const pick = WANTED.filter((f) => !all.length || all.includes(f));
    return pick.length ? pick : WANTED;
  }

  /** Creates a camera reader bound to a video element. onCode(text, { source: 'camera' }); onStatus(text). */
  function createCamera({ video, onCode, onStatus }) {
    let stream = null, timer = 0, detector = null, busy = false, held = null, blanks = 0;
    const say = (msg) => onStatus && onStatus(msg);

    async function tick() {
      if (busy || !detector || video.readyState < 2) return;
      busy = true;
      try {
        const found = await detector.detect(video);
        handle(found);
      } catch (e) {
        // A frame that fails to decode is skipped; the next frame is tried.
      } finally {
        busy = false;
      }
    }

    function handle(found) {
      const codes = (found || []).map((x) => x.rawValue).filter(Boolean);
      if (!codes.length) {
        if (++blanks >= LEAVE_FRAMES) held = null;
        return;
      }
      blanks = 0;
      if (codes[0] === held) return;
      held = codes[0];
      onCode(codes[0], { source: 'camera' });
    }

    /** Starts the camera. Resolves true when it is reading, false (with a message) when it is not. */
    async function start() {
      if (stream) return true;
      const s = support();
      if (!s.ok) { say(s.message); return false; }
      try {
        detector = new g.BarcodeDetector({ formats: await formats() });
      } catch (e) {
        say(t('inventory.cam.reader', { why: e.message }));
        return false;
      }
      try {
        stream = await g.navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (e) {
        say(cameraError(e));
        return false;
      }
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.srcObject = stream;
      await video.play().catch(() => {});
      timer = setInterval(tick, FRAME_MS);
      say(t('inventory.cam.point'));
      return true;
    }

    /** Stops the camera and releases it. Safe to call when it is not running. */
    function stop() {
      clearInterval(timer);
      timer = 0;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
      held = null;
      blanks = 0;
    }

    return { start, stop, support, get running() { return !!stream; } };
  }

  NS.camera = { support, cameraError, createCamera, WANTED, FRAME_MS, LEAVE_FRAMES };
})(typeof window !== 'undefined' ? window : globalThis);
