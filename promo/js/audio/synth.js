// Drum machine and synths for the promo soundtrack, built from plain Web Audio nodes so the
// whole track renders offline (OfflineAudioContext) and identically every time.
export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function makeSynth(ac) {
  const out = ac.createDynamicsCompressor();
  out.threshold.value = -14; out.ratio.value = 4; out.attack.value = 0.004; out.release.value = 0.2;
  const master = ac.createGain(); master.gain.value = 0.82;
  out.connect(master); master.connect(ac.destination);
  // seeded noise
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1; }
  // reverb + delay sends
  const verb = ac.createConvolver();
  { const len = ac.sampleRate * 2.4, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; }
  const verbIn = ac.createGain(); verbIn.gain.value = 0.32; verbIn.connect(verb); verb.connect(out);
  const delay = ac.createDelay(1); delay.delayTime.value = 0.375;
  const fb = ac.createGain(); fb.gain.value = 0.32;
  const dlIn = ac.createGain(); dlIn.gain.value = 0.28;
  const dlTone = ac.createBiquadFilter(); dlTone.type = 'lowpass'; dlTone.frequency.value = 3000;
  dlIn.connect(delay); delay.connect(dlTone); dlTone.connect(fb); fb.connect(delay); dlTone.connect(out);

  const env = (g, t, a, peak, d, end = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); };
  const gain = (v = 1, to = out) => { const g = ac.createGain(); g.gain.value = v; g.connect(to); return g; };
  const noise = (t, dur) => { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, rand() * 1.5); s.stop(t + dur + 0.05); return s; };
  const osc = (type, f, t, dur) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur + 0.05); return o; };

  return {
    out, verbIn, dlIn,
    kick(t, v = 1) {
      const g = gain(0); const o = osc('sine', 160, t, 0.45);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      env(g, t, 0.002, 1.0 * v, 0.42); o.connect(g);
      const c = gain(0); const n = noise(t, 0.02); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      n.connect(hp); hp.connect(c); env(c, t, 0.001, 0.25 * v, 0.015);
    },
    clap(t, v = 1) {
      const g = gain(0); g.connect(verbIn);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.9;
      const n = noise(t, 0.3); n.connect(bp); bp.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      for (const d of [0, 0.012, 0.024]) { g.gain.setValueAtTime(0.55 * v, t + d); g.gain.exponentialRampToValueAtTime(0.08 * v, t + d + 0.01); }
      g.gain.setValueAtTime(0.5 * v, t + 0.036); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      const tg = gain(0); const o = osc('triangle', 210, t, 0.1); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); o.connect(tg); env(tg, t, 0.001, 0.25 * v, 0.08);
    },
    hat(t, v = 1, open = false) {
      const g = gain(0); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
      const n = noise(t, open ? 0.3 : 0.06); n.connect(hp); hp.connect(g); env(g, t, 0.001, 0.22 * v, open ? 0.25 : 0.045);
    },
    crash(t, v = 1) {
      const g = gain(0); g.connect(verbIn); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
      const n = noise(t, 1.8); n.connect(hp); hp.connect(g); env(g, t, 0.002, 0.3 * v, 1.7);
    },
    impact(t, v = 1) {
      const g = gain(0); const o = osc('sine', 90, t, 1.6); o.frequency.exponentialRampToValueAtTime(28, t + 1.2); o.connect(g); env(g, t, 0.003, 1.1 * v, 1.4);
      const g2 = gain(0); g2.connect(verbIn); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.8);
      const n = noise(t, 1); n.connect(lp); lp.connect(g2); env(g2, t, 0.002, 0.7 * v, 0.9);
      this.crash(t, v * 0.8);
    },
    riser(t0, t1, v = 1) {
      const g = gain(0); g.connect(verbIn); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(7000, t1);
      const n = noise(t0, t1 - t0); n.connect(bp); bp.connect(g);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35 * v, t1); g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.04);
    },
    whoosh(t, v = 1, dur = 0.35) {
      const g = gain(0); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(800, t - dur * 0.6); bp.frequency.exponentialRampToValueAtTime(5000, t); bp.frequency.exponentialRampToValueAtTime(600, t + dur * 0.4);
      const n = noise(t - dur * 0.6, dur); n.connect(bp); bp.connect(g);
      g.gain.setValueAtTime(0.0001, t - dur * 0.6); g.gain.exponentialRampToValueAtTime(0.32 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.4);
    },
    bass(t, note, dur, v = 1) {
      const g = gain(0); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
      lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(1400, t + 0.02); lp.frequency.exponentialRampToValueAtTime(220, t + dur);
      const a = osc('sawtooth', midi(note), t, dur), b = osc('square', midi(note - 12), t, dur);
      const bg = ac.createGain(); bg.gain.value = 0.6; b.connect(bg); bg.connect(lp); a.connect(lp); lp.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.008); g.gain.setValueAtTime(0.42 * v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    pluck(t, note, v = 1, type = 'sawtooth', dur = 0.25) {
      const g = gain(0); g.connect(dlIn); g.connect(verbIn);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(type === 'sine' ? 6000 : 4500, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
      for (const det of type === 'sine' ? [0] : [-8, 8]) { const o = osc(type, midi(note), t, dur + 0.1); o.detune.value = det; o.connect(lp); }
      if (type === 'sine') { const o2 = osc('sine', midi(note + 19), t, dur); const g2 = ac.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(lp); }
      lp.connect(g); env(g, t, 0.003, 0.2 * v, dur);
    },
    pad(t, notes, dur, v = 1) {
      const g = gain(0); g.connect(verbIn); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(g);
      for (const n of notes) for (const det of [-12, 12]) { const o = osc('sawtooth', midi(n), t, dur + 0.6); o.detune.value = det; o.connect(lp); }
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * v, t + Math.min(0.6, dur / 2)); g.gain.setValueAtTime(0.06 * v, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    },
    blip(t, f0, f1, dur = 0.15, v = 1) {
      const g = gain(0); g.connect(verbIn); const o = osc('sine', f0, t, dur); o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(g); env(g, t, 0.004, 0.4 * v, dur);
    },
  };
}
