/* SlopCut: the sample project. All media is generated on this device (two short videos with sound,
   a music bed and a logo still), then cut together with a transition, a title and markers. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, E = SE.edit, Y = SE.synth;
  const S = SE.sample = {};
  const TAU = Math.PI * 2;

  function goo(g, x, y, r, t, color) {
    g.fillStyle = color; g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU, rr = r * (1 + 0.07 * Math.sin(a * 3 + t * 4) + 0.05 * Math.sin(a * 5 - t * 3));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.92;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.fill();
  }
  function sloppo(g, x, y, r, t) {
    goo(g, x, y, r, t, '#d4ff3a');
    g.fillStyle = '#0a0a0a';
    const blink = Math.sin(t * 2.3) > 0.97 ? 0.15 : 1;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * r * 0.32, y - r * 0.12, r * 0.09, r * 0.13 * blink, 0, 0, TAU); g.fill(); }
    g.lineWidth = r * 0.06; g.strokeStyle = '#0a0a0a'; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y + r * 0.08, r * 0.25, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  }
  /** Scene A: a sunset with Sloppo bouncing across. */
  S.sceneA = function (g, t) {
    const W = g.canvas.width, H = g.canvas.height;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1d1446'); sky.addColorStop(0.6, '#ff6b4a'); sky.addColorStop(1, '#ffc46b');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(W * 0.7, H * 0.62, H * 0.16, 0, TAU); g.fill();
    g.fillStyle = '#2a1640';
    for (let i = 0; i < 9; i++) { const bx = ((i * 97 - t * 40) % (W + 120) + W + 120) % (W + 120) - 60; g.fillRect(bx, H * 0.55 - (i % 3) * 30, 50, H); }
    g.fillStyle = '#120a20'; g.fillRect(0, H * 0.82, W, H);
    const x = ((t * 0.22) % 1) * (W + 200) - 100, y = H * 0.82 - Math.abs(Math.sin(t * 3.2)) * H * 0.3 - H * 0.09;
    sloppo(g, x, y, H * 0.09, t);
  };
  /** Scene B: a slime lab with bubbles and a frame counter. */
  S.sceneB = function (g, t, i) {
    const W = g.canvas.width, H = g.canvas.height;
    g.fillStyle = '#0c2a24'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 18; k++) {
      const bx = (k * 0.137 * W + Math.sin(t + k) * 20) % W, by = H - ((t * 60 * (1 + (k % 4) * 0.4) + k * 53) % (H + 40));
      g.fillStyle = 'rgba(212,255,58,' + (0.15 + (k % 5) * 0.08) + ')'; g.beginPath(); g.arc(bx, by, 6 + (k % 6) * 4, 0, TAU); g.fill();
    }
    goo(g, W / 2, H * 0.58, H * 0.22, t, '#2de0a0');
    sloppo(g, W / 2, H * 0.55, H * 0.15, t);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 ' + Math.round(H * 0.05) + 'px monospace'; g.textAlign = 'left';
    g.fillText('LAB CAM  #' + String(i).padStart(4, '0'), W * 0.04, H * 0.09);
  };
  const tone = (f) => (t) => { const env = Math.min(1, t * 8) * 0.18, v = Math.sin(TAU * f * t) * env * (0.6 + 0.4 * Math.sin(TAU * 2 * t)); return [v, v * 0.9]; };
  /** A little arpeggio for the music bed. */
  function music(t) {
    const notes = [261.6, 329.6, 392, 523.3, 392, 329.6], step = 0.25, n = Math.floor(t / step), u = t - n * step;
    const f = notes[n % notes.length] * (Math.floor(n / 12) % 2 ? 0.75 : 1);
    const env = Math.exp(-u * 9) * 0.22, bass = Math.sin(TAU * (f / 4) * t) * 0.08;
    const v = Math.sin(TAU * f * t) * env + Math.sin(TAU * f * 2 * t) * env * 0.3 + bass;
    return [v, v];
  }
  /** Generate the media. Returns Files. small = tiny versions for tests. */
  S.makeMedia = async function ({ small = false, progress } = {}) {
    const w = small ? 320 : 1280, h = small ? 180 : 720, fps = 30;
    const step = (m) => progress && progress(m);
    step('Rendering “Sunset run”…');
    const a = await Y.video({ w, h, fps, dur: small ? 2 : 6, draw: S.sceneA, tone: tone(220) });
    step('Rendering “Slime lab”…');
    const b = await Y.video({ w, h, fps, dur: small ? 2 : 5, draw: S.sceneB, tone: tone(330) });
    step('Composing music…');
    const mus = Y.wav(small ? 4 : 12, music);
    const logo = await Y.png(400, 400, (g) => { sloppo(g, 200, 210, 150, 0.4); });
    const ext = (blob) => (blob.type.includes('mp4') ? '.mp4' : '.webm');
    return [new File([a], 'Sunset run' + ext(a), { type: a.type }), new File([b], 'Slime lab' + ext(b), { type: b.type }), new File([mus], 'Goo groove.wav', { type: 'audio/wav' }), new File([logo], 'Sloppo logo.png', { type: 'image/png' })];
  };
  /** Build the sample timeline from the imported metas (picked by name: the import lists them as each one is read). */
  S.assemble = function (p, metas) {
    const pick = (re) => metas.find((m) => re.test(m.name));
    const va = pick(/^Sunset run/), vb = pick(/^Slime lab/), mus = pick(/^Goo groove/), logo = pick(/^Sloppo logo/);
    const V = M.videoTracks(p), Au = M.audioTracks(p);
    E.addMedia(p, va, V[0].id, 0);
    const bIds = E.addMedia(p, vb, V[0].id, M.end(M.clip(p, p.clips[0].id)));
    const bClip = M.clip(p, bIds[0]);
    E.setTransition(p, bClip.id, 'cross', 1);
    if (mus) {
      const ids = E.addMedia(p, mus, Au[1].id, 0);
      const c = M.clip(p, ids[0]);
      c.vol = 0.6; c.afIn = 1; c.afOut = 1.5;
      E.trim(p, c.id, 'out', Math.min(M.end(c), M.end(bClip)));
    }
    if (logo) {
      const id = E.addMedia(p, logo, V[1].id, 0.5)[0], c = M.clip(p, id);
      Object.assign(c, { dur: Math.max(1, M.end(bClip) - 1), scale: 0.18, x: p.w * 0.39, y: -p.h * 0.36, opacity: 0.9, fadeIn: 0.5, fadeOut: 0.5 });
    }
    const tt = M.addTrack(p, 'video');
    E.addGenerated(p, 'title', tt.id, 0.4, Math.min(3, bClip.start), { text: { str: 'SLOPCUT', size: Math.round(p.h * 0.12), anim: 'pop' }, y: p.h * 0.18 });
    p.markers.push({ id: U.uid('k'), t: bClip.start, name: 'Cut to lab', color: '#ffc94a' });
    E.setTransition(p, p.clips[0].id, 'black', 0.6);
  };
  S.load = async function () {
    if (SE.doc.clips.length && !(await SlopUI.confirm(U.t('slopedit.bin.sample_project'), U.t('slopedit.io.sample_replace'), U.t('slopedit.io.load_sample')))) return;
    const dlg = SE.progress ? SE.progress.open(U.t('slopedit.io.building_the_sample_project'), { cancel: false }) : null;
    try {
      const files = await S.makeMedia({ progress: (m) => dlg && dlg.set(null, m) });
      await SE.session.newProject(false);
      SE.doc.name = U.t('slopedit.bin.sample_project');
      const metas = await SE.intake.sample(files); // through the intake, like every other way in
      SE.doc.w = 1280; SE.doc.h = 720; SE.doc.fps = 30;
      SE.change(U.t('slopedit.bin.sample_project'), (p) => S.assemble(p, metas));
      SE.history.reset();
      SE.emit('doc', {}); SE.emit('settings', {});
      if (SE.timeline) SE.timeline.fit();
      if (SE.player) SE.player.seek(0);
    } catch (e) { console.error(e); SlopUI.alert(U.t('slopedit.bin.sample_project'), 'Could not build the sample: ' + e.message); }
    finally { if (dlg) dlg.close(); }
  };
})();
