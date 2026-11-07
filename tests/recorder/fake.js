/* Fake capture devices for the Slop Recorder tests: a moving picture from a canvas (captureStream) and a tone from a WebAudio
 * oscillator, made (the screen red, the webcam blue, each with a moving counter) in the app's own frame and handed out in place of getDisplayMedia and getUserMedia.
 *   RecFake.install(win, { display: { w, h }, camera: { w, h }, refuse: 'display' | 'camera' | 'mic' })  → { calls }
 *   calls: [{ kind: 'display' | 'user', constraints }] */
(function (g) {
  'use strict';
  function picture(W, w, h, hue) {
    const c = W.document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    let n = 0;
    const draw = () => { n++; x.fillStyle = `hsl(${hue} 70% 50%)`; x.fillRect(0, 0, w, h); x.fillStyle = `hsl(${hue} 70% ${30 + (n % 2) * 10}%)`; x.font = `${Math.round(h / 5)}px sans-serif`; x.fillText(String(n), 10, h / 2); };
    draw();
    const id = W.setInterval(draw, 33);
    const s = c.captureStream(30);
    s.getVideoTracks()[0].addEventListener('ended', () => W.clearInterval(id));
    return s;
  }
  function tone(W, freq) {
    const ac = new W.AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination();
    o.frequency.value = freq; o.connect(d); o.start();
    return d.stream;
  }
  function refused(W) { return new W.DOMException('Permission denied', 'NotAllowedError'); }
  function install(W, o = {}) {
    const calls = [], md = W.navigator.mediaDevices, dw = (o.display || { w: 640, h: 360 }), cw = (o.camera || { w: 320, h: 240 });
    md.getDisplayMedia = async (c) => {
      calls.push({ kind: 'display', constraints: c });
      if (o.refuse === 'display') throw refused(W);
      const s = picture(W, dw.w, dw.h, 0);
      if (c && c.audio && !o.noSystemAudio) for (const t of tone(W, 330).getAudioTracks()) s.addTrack(t);
      return s;
    };
    md.getUserMedia = async (c) => {
      calls.push({ kind: 'user', constraints: c });
      if (c && c.video) { if (o.refuse === 'camera') throw refused(W); return picture(W, cw.w, cw.h, 200); }
      if (o.refuse === 'mic') throw refused(W);
      return tone(W, 440);
    };
    return { calls };
  }
  g.RecFake = { install };
})(window);
