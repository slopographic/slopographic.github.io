// The soundtrack: arranged from the same plan as the visuals, so every hit lands on a cut.
// renderScore(plan) -> AudioBuffer (OfflineAudioContext, deterministic); wavBlob(buf) -> 16-bit WAV.
import { makeSynth } from './synth.js';
import { BEAT } from '../ease.js';

const PROG = [[45, [57, 60, 64]], [41, [53, 57, 60]], [48, [55, 60, 64]], [43, [55, 59, 62]]]; // Am F C G
const chordAt = (t) => PROG[Math.floor(t / (BEAT * 4)) % 4];

function groove(S, t0, t1, { half = false, hats16 = false, arp = null, bass = true, clap = true, kick = true } = {}) {
  for (let t = t0; t < t1 - 1e-6; t += BEAT / 2) {
    const i = Math.round((t - t0) / (BEAT / 2)), onBeat = i % 2 === 0, beat = Math.round(t / BEAT);
    const [root, chord] = chordAt(t);
    if (kick && onBeat && (!half || beat % 2 === 0)) S.kick(t);
    if (clap && onBeat && beat % 2 === 1 && (!half || beat % 4 === 3)) S.clap(t);
    S.hat(t, onBeat ? 0.5 : 1, !onBeat && beat % 4 === 3);
    if (hats16) S.hat(t + BEAT / 4, 0.45);
    if (bass) S.bass(t, root + (i % 4 === 3 ? 12 : 0), BEAT / 2 - 0.02, onBeat ? 1 : 0.8);
    if (arp) {
      const notes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 24];
      const steps = arp === 'square' ? 2 : 1;
      for (let s = 0; s < steps; s++) S.pluck(t + s * BEAT / 4, notes[(i * steps + s) % 4], arp === 'square' ? 0.55 : 0.8, arp, arp === 'square' ? 0.12 : 0.28);
    }
  }
}

function arrange(S, plan) {
  for (const seg of plan.segs) {
    const a = seg.start, b = a + seg.dur;
    if (seg.type === 'intro') {
      S.pad(0, [57, 60, 64], 2.0, 0.8);
      S.blip(0.25, 300, 900, 0.5, 0.25);
      S.blip(1.0, 180, 60, 0.25, 0.9); S.kick(1.0, 0.7);                    // the drop lands
      S.riser(1.0, 2.0, 0.8);
      S.impact(2.0, 0.8);                                                     // lime flood
      for (let i = 0; i < 12; i++) S.pluck(2.5 + i * 0.125, [57, 60, 64, 69, 72, 76][i % 6], 0.9, 'sawtooth', 0.18);
      for (let t = 2.5; t < 4.0; t += BEAT) S.kick(t, 0.8);
      S.crash(4.0, 0.6); S.kick(4.0); S.clap(4.0);
      for (let t = 4.0; t < 5.0; t += BEAT / 4) S.hat(t, 0.4 + (t - 4));
      S.riser(4.2, 5.0, 0.6);
      S.impact(5.0, 1.1);                                                     // 100%
      groove(S, 5.0, 8.0, { arp: 'sawtooth' });
      S.riser(7.0, 8.0, 0.7);
    } else if (seg.type === 'chapter') {
      S.impact(a, 0.7);
      groove(S, a, b - BEAT, { arp: null, clap: false });
      for (let t = b - BEAT; t < b; t += BEAT / 4) S.clap(t, 0.5 + (t - (b - BEAT)));
    } else if (seg.type === 'app') {
      const style = { app: 'sawtooth', game: 'square', experiment: 'sine' }[seg.app.kind];
      S.whoosh(a, 0.8);
      if (seg.index === 0) S.crash(a, 0.5);
      groove(S, a, b, { arp: style, hats16: seg.app.kind === 'game' });
      const n = Math.min(3, (seg.app.features || []).length || 2), step = seg.dur > 2.5 ? 0.5 : 0.25;
      for (let i = 0; i < n; i++) S.blip(a + 0.5 + i * step, 1200 + i * 300, 1800 + i * 300, 0.08, 0.35);
    } else if (seg.type === 'montage') {
      const cuts = Math.min(6, seg.games.length);
      for (let i = 0; i < cuts; i++) { const t = a + i * BEAT; S.kick(t); S.crash(t, 0.25); const [, ch] = chordAt(t); ch.forEach((n) => S.pluck(t, n + 12, 0.7, 'square', 0.2)); }
      for (let t = a; t < a + cuts * BEAT; t += BEAT / 4) S.hat(t, 0.6);
      S.impact(a + cuts * BEAT, 0.8);
      groove(S, a + cuts * BEAT, b, { arp: 'square', hats16: true });
      S.riser(b - 1.5, b, 0.8);
    } else if (seg.type === 'pillars') {
      for (const p of [0, 2, 4]) { S.impact(a + p, 0.9); groove(S, a + p, a + p + 2, { half: true, arp: null }); }
      // the watermark moment: drop out, Sloppo slurps, then the stamp hits
      S.pad(a + 6, [57, 60, 64], 2, 1);
      for (let t = a + 6; t < a + 7; t += BEAT / 2) S.hat(t, 0.5);
      for (let i = 0; i < 9; i++) S.blip(a + 7 + i * 0.11, 220 + i * 40, 520 + i * 60, 0.09, 0.55);
      S.riser(a + 7, a + 8, 1);
      S.impact(a + 8, 1.3); S.kick(a + 8);
      groove(S, a + 8, a + 10, { arp: 'sawtooth' });
      S.impact(a + 10, 0.8);
      groove(S, a + 10, b, { arp: 'sine' });
      S.riser(b - 1, b, 0.7);
    } else if (seg.type === 'outro') {
      S.impact(a, 1.1);
      groove(S, a, a + 6, { arp: 'sawtooth' });
      for (let t = a + 2; t < a + 6; t += BEAT) S.blip(t, 160, 70, 0.18, 0.5);
      S.impact(a + 6, 0.9);
      S.pad(a + 6, [45, 57, 60, 64], 1.6, 1.6);
      S.pluck(a + 6, 69, 1, 'sine', 1.5);
    }
  }
}

export async function renderScore(plan, sampleRate = 44100) {
  const len = Math.ceil((plan.total + 0.2) * sampleRate);
  const ac = new OfflineAudioContext(2, len, sampleRate);
  const S = makeSynth(ac);
  arrange(S, plan);
  return ac.startRendering();
}

export function wavBlob(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, sr, true);
  data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); str(36, 'data'); data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([data.buffer], { type: 'audio/wav' });
}
