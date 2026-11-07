/* SlopCut test helpers: boot the real app in an iframe and reach its SE namespace.
   Exposes window.ST = { boot, win, SE, M, E, reset, matte, pixel, colorVideo, errors }. */
(function () {
  'use strict';
  const { waitFor } = SlopTest;
  const ST = window.ST = { errors: [] };

  /** Load slopcut/index.html into an iframe and wait until it is ready. */
  ST.boot = async function (frameId = 'app', query = '') {
    const fr = document.getElementById(frameId);
    fr.src = 'about:blank';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.href === 'about:blank');
    fr.src = '../../slopcut/index.html' + query;
    await waitFor(() => { const w = fr.contentWindow; return w && w.document && w.document.body && w.document.body.classList.contains('ready') && w.SE && w.SE.app; }, { timeout: 30000 });
    const win = fr.contentWindow;
    win.addEventListener('error', (e) => ST.errors.push(frameId + ': ' + e.message));
    win.addEventListener('unhandledrejection', (e) => ST.errors.push(frameId + ': ' + (e.reason && e.reason.message || e.reason)));
    if (frameId === 'app') Object.assign(ST, { win, SE: win.SE, M: win.SE.model, E: win.SE.edit });
    return win;
  };
  /** Fresh empty project without dialogs. */
  ST.reset = async function () {
    await ST.SE.session.newProject(false);
    ST.SE.app.select([]);
  };
  /** A bare project (no UI): tracks V1, V2, A1, A2 at 160×90, 10 fps. */
  ST.project = (o = {}) => ST.M.newProject(Object.assign({ w: 160, h: 90, fps: 10 }, o));
  /** Add a colour matte clip to a project. */
  ST.matte = function (p, trackIdx, start, dur, color, extra = {}) {
    const t = ST.M.videoTracks(p)[trackIdx];
    return ST.E.addGenerated(p, 'color', t.id, start, dur, Object.assign({ color }, extra));
  };
  /** Render a project at time t into a canvas and return [r,g,b,a] at (x, y). */
  ST.renderAt = function (p, t, opts = {}) {
    const c = ST.win.document.createElement('canvas');
    c.width = opts.W || p.w; c.height = opts.H || p.h;
    ST.SE.compositor.render(c.getContext('2d'), p, t, { W: c.width, H: c.height, source: opts.source || (() => null) });
    return c;
  };
  ST.px = (c, x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data];
  ST.near = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  /** Can this browser encode video with WebCodecs? */
  ST.canEncode = async function () {
    const w = ST.win;
    if (typeof w.VideoEncoder !== 'function') return false;
    return !!(await ST.SE.synth.pickVideoCodec(64, 64, 10, 2e5));
  };
  /** A synthetic test video: frame i is a flat colour (R = i*12) with a white bar at x = i (encoded in the page). */
  ST.colorVideo = async function (frames = 20, fps = 10, tone = true) {
    const blob = await ST.SE.synth.video({ w: 160, h: 90, fps, dur: frames / fps, draw: (g, t, i) => { g.fillStyle = 'rgb(' + Math.min(255, i * 12) + ',40,90)'; g.fillRect(0, 0, 160, 90); g.fillStyle = '#fff'; g.fillRect(i * 4, 70, 4, 20); }, tone: tone ? (t) => { const v = Math.sin(2 * Math.PI * 440 * t) * 0.3; return [v, v]; } : null });
    return new ST.win.File([blob], 'colors.' + (blob.type.includes('mp4') ? 'mp4' : 'webm'), { type: blob.type });
  };
  /** The first frame of an exported video blob (MP4 or WebM) as a canvas at the video's size. */
  ST.firstFrame = async function (blob) {
    const url = URL.createObjectURL(blob), v = document.createElement('video');
    v.muted = true; v.src = url;
    try {
      await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('decode failed')); });
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      const g = c.getContext('2d');
      // A seek to exactly 0 can leave the picture blank for a moment (as in export-size.spec.js), so retry until a picture is drawn.
      for (let tries = 0; tries < 10; tries++) {
        await new Promise((r) => { v.onseeked = r; v.currentTime = 0.01; });
        await new Promise((r) => setTimeout(r, 150));
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(v, 0, 0);
        if (g.getImageData(c.width >> 1, c.height >> 1, 1, 1).data[3] > 0) return c;
      }
      throw new Error('no picture was decoded from the exported video');
    } finally { URL.revokeObjectURL(url); }
  };
  /** Count pixels whose red, green and blue are all above min (white text on a dark or mid frame). */
  ST.countBright = function (c, min = 235) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > min && d[i + 1] > min && d[i + 2] > min) n++;
    return n;
  };
})();
