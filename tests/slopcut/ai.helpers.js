/* Helpers for SlopCut's AI command tests (ai-edit, ai-panel, ai-ops): decode an exported video (length, size, a frame at
   a time, its tracks), put a generated clip into Slop Drive, and load the AI kit into the app's frame.
   Exposes window.AIT. Uses window.ST (slopedit.helpers.js) when the page boots the app. */
(function () {
  'use strict';
  const AIT = (window.AIT = {});
  /** { w, h, dur, frame(t) → canvas } of a video blob, decoded with a <video> element. */
  AIT.decode = async function (blob) {
    const url = URL.createObjectURL(blob), v = document.createElement('video');
    v.muted = true; v.src = url; v.preload = 'auto';
    await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('the export could not be decoded')); });
    const out = { w: v.videoWidth, h: v.videoHeight, dur: v.duration, close: () => URL.revokeObjectURL(url) };
    out.frame = async (t) => {
      await new Promise((r) => { v.onseeked = r; v.currentTime = t; });
      await new Promise((r) => setTimeout(r, 120));
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      return c;
    };
    return out;
  };
  /** The kinds of the tracks of an MP4 (SlopCut's own demuxer). */
  AIT.tracks = async (SE, blob) => (await SE.demux.mp4(blob)).tracks.map((t) => t.type);
  /** Pixels with r, g and b above min (white text). */
  AIT.bright = function (c, min = 225) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > min && d[i + 1] > min && d[i + 2] > min) n++;
    return n;
  };
  /** A dark test clip with a tone (no white in it, so white text stands out): frame i is rgb(i*6, 30, 80). */
  AIT.clip = async function (SE, win, { frames = 20, fps = 10, w = 160, h = 90, name = 'clip' } = {}) {
    const blob = await SE.synth.video({ w, h, fps, dur: frames / fps, draw: (g, t, i) => { g.fillStyle = 'rgb(' + Math.min(200, i * 6) + ',30,80)'; g.fillRect(0, 0, w, h); },
      tone: (t) => { const v = Math.sin(2 * Math.PI * 330 * t) * 0.3; return [v, v]; } });
    return new win.File([blob], name + '.' + (blob.type.includes('mp4') ? 'mp4' : 'webm'), { type: blob.type });
  };
  /** Put a File into the app's Slop Drive; resolves its id. */
  AIT.toDrive = (win, file) => win.SlopHub.put(file, { name: file.name, from: 'test' });
  /** Load scripts into the app frame (the AI kit: tools.js, cmdtools.js…). */
  AIT.load = async function (win, paths) {
    for (const p of paths) {
      if ([...win.document.scripts].some((s) => s.src.endsWith(p))) continue;
      await new Promise((r, j) => { const s = win.document.createElement('script'); s.src = '../' + p; s.onload = r; s.onerror = () => j(new Error('no ' + p)); win.document.head.append(s); });
    }
  };
  AIT.SRT = '1\n00:00:00,500 --> 00:00:01,000\nHELLO THERE\n\n2\n00:00:02,000 --> 00:00:02,500\nBYE NOW\n';
})();
