/* SlopSamples.media: sample sound and video for the audio and video apps' "Try it with a sample", made in the page.
 * Classic script; load it after shared/samples/samples.js (it extends window.SlopSamples).
 *   SlopSamples.media.melody(seconds = 8, { tune }) -> File   a short tune as a 16-bit mono WAV ("Sample morning chords.wav").
 *       tune is a name from TUNES or an index; each has chords, an arpeggio, a bass line and soft drums.
 *   SlopSamples.media.melodies(n = 3, seconds) -> File[]      the first n tunes.
 *   SlopSamples.media.clip(seconds = 3, { scene, width, height, sound }) -> Promise<File>
 *       a painted moving scene ("hills" or "sea") recorded as WebM (canvas.captureStream + MediaRecorder), with the melody
 *       as its sound when the page may play audio. The recording's length is written into the file, so players know it.
 *       Without MediaRecorder it gives the scene's first frame as a JPEG instead.
 *   SlopSamples.media.wav(Float32Array, rate) -> Blob          16-bit mono PCM WAV from samples in -1..1.
 *   SlopSamples.media.withDuration(Uint8Array, ms) -> Uint8Array | null   a WebM with its Duration set (null: not WebM).
 *   SlopSamples.media.TUNES, .SCENES                           the names, in order. */
(function (g) {
  'use strict';
  const S = g.SlopSamples;
  if (!S || S.media) return;
  const doc = g.document, TAU = Math.PI * 2, RATE = 22050;
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const MAJ = [0, 4, 7], MIN = [0, 3, 7];
  /** Each tune: beats a minute, beats a bar, its chords (root as a MIDI note, and the chord's shape). */
  const TUNES = {
    'morning chords': { bpm: 104, bar: 4, chords: [[60, MAJ], [55, MAJ], [57, MIN], [53, MAJ]] },
    'night drive': { bpm: 88, bar: 4, chords: [[57, MIN], [53, MAJ], [60, MAJ], [55, MAJ]] },
    'little waltz': { bpm: 132, bar: 3, chords: [[53, MAJ], [60, MAJ], [62, MIN], [58, MAJ]] },
  };
  const TUNE_NAMES = Object.keys(TUNES);

  /** The tune's samples, -1..1, at RATE. */
  function render(tune, seconds) {
    const n = Math.max(1, Math.round(seconds * RATE)), out = new Float32Array(n);
    const beat = 60 / tune.bpm, barLen = beat * tune.bar, eighth = beat / 2;
    let seed = 12345;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 1073741823.5) - 1;
    for (let i = 0; i < n; i++) {
      const t = i / RATE, bar = Math.floor(t / barLen), [root, shape] = tune.chords[bar % tune.chords.length];
      const inBar = t - bar * barLen, b = Math.floor(inBar / beat), ub = inBar - b * beat;
      let v = 0;
      for (const k of shape) v += Math.sin(TAU * hz(root + k) * t) * 0.045 * Math.min(1, inBar * 4); // the pad
      const e = Math.floor(inBar / eighth), ue = inBar - e * eighth, note = root + 12 + shape[e % 3] + (e % 6 > 2 ? 12 : 0);
      const env = Math.exp(-ue * 7);
      v += (Math.sin(TAU * hz(note) * t) + 0.25 * Math.sin(TAU * 2 * hz(note) * t)) * 0.16 * env; // the arpeggio
      v += Math.sin(TAU * hz(root - 12) * t) * 0.14 * Math.exp(-ub * 3); // the bass, on each beat
      if (b === 0 || (tune.bar === 4 && b === 2)) v += Math.sin(TAU * (50 + 90 * Math.exp(-ub * 30)) * ub) * 0.5 * Math.exp(-ub * 9); // kick
      if (ue < 0.05 && e % 2 === 1) v += noise() * 0.05 * Math.exp(-ue * 80); // hat, off the beat
      const fade = Math.min(1, t / 0.03, (seconds - t) / 0.6);
      out[i] = Math.tanh(v * 1.2) * fade;
    }
    return out;
  }
  function wav(samples, rate = RATE) {
    const n = samples.length, buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, rate, true);
    d.setUint32(28, rate * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); str(36, 'data'); d.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    return new Blob([buf], { type: 'audio/wav' });
  }
  const tuneName = (tune) => (typeof tune === 'number' ? TUNE_NAMES[tune % TUNE_NAMES.length] : TUNES[tune] ? tune : TUNE_NAMES[0]);
  function melody(seconds = 8, o = {}) {
    const name = tuneName(o.tune || 0);
    return S.file(`Sample ${name}.wav`, wav(render(TUNES[name], seconds)), 'audio/wav');
  }
  const melodies = (n = 3, seconds = 8) => Array.from({ length: Math.min(n, TUNE_NAMES.length) }, (_, i) => melody(seconds, { tune: i }));

  /** The scenes: a picture at time t (seconds). */
  const SCENES = {
    hills(x, w, h, t) {
      const sky = x.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#5aa9e6'); sky.addColorStop(1, '#ffe8a3');
      x.fillStyle = sky; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff3b0'; x.beginPath(); x.arc(w * (0.15 + t * 0.06), h * (0.32 - t * 0.02), h * 0.1, 0, TAU); x.fill();
      [['#7fb069', 0.62, 0.06, 20], ['#3f7d20', 0.76, 0.05, 55]].forEach(([c, base, amp, speed]) => {
        x.fillStyle = c; x.beginPath(); x.moveTo(0, h);
        for (let px = 0; px <= w; px += 8) x.lineTo(px, h * (base + amp * Math.sin((px + t * speed) / (w * 0.12))));
        x.lineTo(w, h); x.fill();
      });
      const bx = ((t * 0.3) % 1) * (w + 80) - 40, by = h * 0.76 - Math.abs(Math.sin(t * 4)) * h * 0.3 - h * 0.05;
      x.fillStyle = '#e63946'; x.beginPath(); x.arc(bx, by, h * 0.05, 0, TAU); x.fill();
    },
    sea(x, w, h, t) {
      const sky = x.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#2b2d6e'); sky.addColorStop(0.55, '#f08a5d'); sky.addColorStop(1, '#f9d56e');
      x.fillStyle = sky; x.fillRect(0, 0, w, h);
      x.fillStyle = '#ffe9a8'; x.beginPath(); x.arc(w * 0.5, h * (0.5 + t * 0.03), h * 0.13, 0, TAU); x.fill();
      for (let k = 0; k < 5; k++) {
        x.fillStyle = ['#1d4e89', '#215a9e', '#2767b0', '#2f75c2', '#3a83d3'][k]; x.beginPath(); x.moveTo(0, h);
        for (let px = 0; px <= w; px += 8) x.lineTo(px, h * (0.58 + k * 0.09) + Math.sin(px / 40 + t * (1.5 + k * 0.4) + k) * h * 0.015);
        x.lineTo(w, h); x.fill();
      }
      const bx = ((t * 0.12) % 1) * (w + 120) - 60, by = h * 0.6 + Math.sin(t * 2) * h * 0.02;
      x.fillStyle = '#f1faee'; x.beginPath(); x.moveTo(bx, by - h * 0.16); x.lineTo(bx + h * 0.1, by - h * 0.02); x.lineTo(bx, by - h * 0.02); x.fill();
      x.fillStyle = '#6d3b1e'; x.fillRect(bx - h * 0.08, by - h * 0.02, h * 0.22, h * 0.04);
    },
  };
  const SCENE_NAMES = Object.keys(SCENES);

  /** Reads an EBML variable-length number at i: { len, v }. */
  function vint(b, i) {
    let len = 1, mask = 0x80;
    while (len <= 8 && !(b[i] & mask)) { len++; mask >>= 1; }
    let v = b[i] & (mask - 1);
    for (let k = 1; k < len; k++) v = v * 256 + b[i + k];
    return { len, v, unknown: v === Math.pow(2, 7 * len) - 1 };
  }
  const hex = (b, i, n) => Array.from(b.subarray(i, i + n), (x) => x.toString(16).padStart(2, '0')).join('');
  /** MediaRecorder's WebM leaves out the Duration, so a player reports Infinity: write it into the Segment's Info. */
  function withDuration(b, ms) {
    if (hex(b, 0, 4) !== '1a45dfa3') return null;
    const hs = vint(b, 4), seg = 4 + hs.len + hs.v;
    if (hex(b, seg, 4) !== '18538067') return null;
    let j = seg + 4 + vint(b, seg + 4).len;
    while (j < b.length) {
      const idLen = vint(b, j).len, id = hex(b, j, idLen), s = vint(b, j + idLen), at = j + idLen + s.len;
      if (id === '1549a966') {
        const info = b.slice(at, at + s.v);
        for (let k = 0; k < info.length;) { // a Duration already there is set in place
          const cl = vint(info, k).len, cs = vint(info, k + cl), ca = k + cl + cs.len;
          if (hex(info, k, cl) === '4489') {
            const dv = new DataView(info.buffer, ca, cs.v);
            if (cs.v === 8) dv.setFloat64(0, ms); else dv.setFloat32(0, ms);
            const out = b.slice(); out.set(info, at); return out;
          }
          k = ca + cs.v;
        }
        const dur = new Uint8Array(11), size = new Uint8Array(8), n = s.v + 11;
        dur.set([0x44, 0x89, 0x88]); new DataView(dur.buffer).setFloat64(3, ms);
        size[0] = 1; for (let k = 0; k < 7; k++) size[7 - k] = Math.floor(n / Math.pow(256, k)) % 256;
        const head = b.subarray(0, j + idLen), tail = b.subarray(at + s.v), out = new Uint8Array(head.length + 8 + info.length + 11 + tail.length);
        out.set(head); out.set(size, head.length); out.set(info, head.length + 8); out.set(dur, head.length + 8 + info.length); out.set(tail, out.length - tail.length);
        return out;
      }
      if (id === '1f43b675' || s.unknown) return null; // a Cluster before any Info
      j = at + s.v;
    }
    return null;
  }

  /** The melody as a live audio track, or null when the page may not play sound yet. */
  async function soundTrack(seconds) {
    const AC = g.AudioContext || g.webkitAudioContext;
    if (!AC) return null;
    const ac = new AC();
    try { await Promise.race([ac.resume(), new Promise((r) => setTimeout(r, 300))]); } catch (e) { /* stays suspended */ }
    if (ac.state !== 'running') { ac.close(); return null; }
    const data = render(TUNES[TUNE_NAMES[1]], seconds + 0.5), buf = ac.createBuffer(1, data.length, RATE);
    buf.getChannelData(0).set(data);
    const src = ac.createBufferSource(), dst = ac.createMediaStreamDestination();
    src.buffer = buf; src.connect(dst); src.start();
    return { tracks: dst.stream.getAudioTracks(), close: () => ac.close() };
  }
  async function clip(seconds = 3, o = {}) {
    const w = o.width || 640, h = o.height || 360, fps = 30;
    const scene = SCENES[o.scene] ? o.scene : SCENE_NAMES[0], paint = SCENES[scene];
    const c = doc.createElement('canvas'), x = c.getContext('2d');
    c.width = w; c.height = h; paint(x, w, h, 0);
    const type = g.MediaRecorder && c.captureStream
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) : null;
    if (!type) return S.file(`Sample ${scene}.jpg`, await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86)), 'image/jpeg');
    const stream = c.captureStream(fps), sound = o.sound === false ? null : await soundTrack(seconds);
    if (sound) sound.tracks.forEach((tr) => stream.addTrack(tr));
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1.5e6 }), parts = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(200);
    const t0 = performance.now();
    await new Promise((done) => {
      const id = setInterval(() => {
        const t = (performance.now() - t0) / 1000;
        if (t >= seconds) { clearInterval(id); done(); } else paint(x, w, h, t);
      }, 1000 / fps);
    });
    rec.stop(); await stopped;
    const ms = performance.now() - t0;
    stream.getTracks().forEach((tr) => tr.stop());
    if (sound) sound.close();
    const raw = new Uint8Array(await new Blob(parts).arrayBuffer()), fixed = withDuration(raw, ms) || raw;
    return S.file(`Sample ${scene}.webm`, new Blob([fixed], { type: 'video/webm' }), 'video/webm');
  }

  S.media = { melody, melodies, clip, wav, withDuration, render, RATE, TUNES: TUNE_NAMES, SCENES: SCENE_NAMES, paint: SCENES };
})(typeof window !== 'undefined' ? window : globalThis);
