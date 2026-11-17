/* Slop Image to 3D: the page. Opens a picture (disk, drop, or Slop Drive), estimates depth (the opt-in Depth Anything
 * model, else brightness, which is labelled as a fallback), optionally separates the subject with SlopCutout, and shows a
 * height-field mesh, a point cloud or a splat render in a three.js viewport. Classic script, page only. */
(function () {
  'use strict';
  const ns = window.SlopImg3D, hf = ns.hf;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const LIB = ['manifest.js', 'store.js', 'install.js', 'get-more.js'];
  const S = { img: null, depth: null, depthFailed: false, depthInstalled: false, mask: null, prep: null, item: null,
    viewer: null, viewerP: null, busy: false, again: false };
  let libP = null;

  let said = null;   // the last status as a function of the language (sayT), so a language change says it again
  function say(msg, isErr) {
    const el = $('status');
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    said = null;
  }
  function sayT(fn, isErr) { say(fn(), isErr); said = [fn, isErr]; }
  function toast(msg) { if (window.SlopUI) SlopUI.toast(msg); else say(msg); }

  /** Loads the Get more library scripts once (no network except the local store). */
  function loadLib() {
    if (!libP) libP = LIB.reduce((chain, f) => chain.then(() => new Promise((res) => {
      if (document.querySelector(`script[data-lib="${f}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = new URL('../shared/library/' + f, location.href).href; s.async = false; s.dataset.lib = f;
      s.onload = s.onerror = () => res();
      document.head.append(s);
    })), Promise.resolve());
    return libP;
  }

  async function refreshDepthNote() {
    await loadLib();
    const on = await ns.depth.installed(), was = S.depthInstalled;
    if (was && !on && !(S.depth && S.depth.source === 'map')) S.depth = null; // removed: the next build uses the fallback
    S.depthInstalled = on;
    ns.jit.noteInstalled(on);
    if (on !== was && S.img) build(); // installed or removed while a picture is open
    depthNote();
  }
  function depthNote() { $('depthNote').textContent = S.depthInstalled ? t('img3d.depth.note_on') : t('img3d.depth.note_off'); }

  function opts() {
    return { scale: +$('scale').value, smooth: +$('smooth').value, size: +$('size').value };
  }
  const spacingOf = (prep) => ((prep.aspect / Math.max(1, prep.gw - 1)) + (1 / Math.max(1, prep.gh - 1))) / 2;

  /** The viewer item for a mode: mesh (textured), points, or splats. */
  function itemFor(prep, mode) {
    const o = opts();
    if (mode === 'points') {
      const p = hf.pointCloud(prep, o);
      return { kind: 'points', positions: p.positions, colors: p.colors, spacing: spacingOf(prep) * o.size };
    }
    if (mode === 'splats') {
      const s = hf.splats(prep, o);
      return { kind: 'splats', positions: s.positions, colors: s.colors, sizes: s.sizes };
    }
    const m = hf.heightField(prep, o);
    return { kind: 'mesh', positions: m.positions, normals: m.normals, uv: m.uv, indices: m.indices, texture: S.img.canvas };
  }

  async function viewer() {
    if (!S.viewerP) S.viewerP = ns.view.create($('vp')).then((v) => (S.viewer = v));
    return S.viewerP;
  }

  /** Depth from the model when installed (run once per picture), else null for the brightness fallback. */
  async function ensureDepth() {
    if (S.depth || S.depthFailed || !S.depthInstalled) return S.depth;
    try {
      S.depth = await ns.depth.estimate(S.img.rgba, S.img.W, S.img.H, say);
    } catch (e) {
      S.depthFailed = true;
      sayT(() => t('img3d.status.depth_failed', { error: e.message }), true);
    }
    return S.depth;
  }

  /** The subject mask from SlopCutout (the Quality matting model), once per picture. */
  async function ensureMask() {
    if (S.mask) return S.mask;
    sayT(() => t('img3d.status.separating'));
    const input = new ImageData(new Uint8ClampedArray(S.img.rgba), S.img.W, S.img.H);
    const r = await window.SlopCutout.removeBackground(input, { model: 'quality',
      onProgress: (p) => { if (p && p.phase) sayT(() => t('img3d.status.separating_phase', { phase: p.phase })); } });
    const data = Float32Array.from(r.mask, (v) => v / 255);
    S.mask = { data, w: r.width, h: r.height };
    return S.mask;
  }

  /** Recomputes the grids and shows the current mode. Calls made while busy run once more afterwards. */
  async function build() {
    if (!S.img) return;
    if (S.busy) { S.again = true; return; }
    S.busy = true;
    try {
      const subject = $('subject').checked;
      if (subject) await ensureMask();
      const depth = await ensureDepth();
      S.prep = ns.prepare(S.img.rgba, S.img.W, S.img.H, { grid: +$('grid').value, depth, mask: subject ? S.mask : null, invert: $('invert').checked });
      S.item = itemFor(S.prep, $('mode').value);
      const v = await viewer();
      v.show(S.item);
      $('hint').hidden = true;
      const prep = S.prep, kind = S.item.kind, map = S.depth && S.depth.name;
      sayT(() => {
        const source = prep.source === 'model' ? t('img3d.src.model') : prep.source === 'map' ? t('img3d.src.map', { name: map }) : t('img3d.src.fallback');
        const k = t(kind === 'mesh' ? 'img3d.kind.mesh' : kind === 'points' ? 'img3d.kind.points' : 'img3d.kind.splats');
        return t(subject ? 'img3d.status.built_subject' : 'img3d.status.built', { kind: k, gw: String(prep.gw), gh: String(prep.gh), source });
      });
    } catch (e) {
      say(e.message || String(e), true);
    } finally {
      S.busy = false;
      if (S.again) { S.again = false; build(); }
    }
  }

  /** Uses a depth map picture (brighter is nearer, any size) as the depth of the open picture, in place of the model or
   *  the brightness fallback, until another picture opens. */
  async function useDepthMap(blob, name) {
    if (!S.img) throw new Error('Open a picture first');
    const m = await ns.image.decode(blob, name);
    S.depth = { data: ns.luminance(m.rgba, m.W, m.H), w: m.W, h: m.H, source: 'map', name: m.name };
    S.depthFailed = false;
    await build();
  }

  /** A mesh for OBJ and Slop 3D, whatever mode is shown. */
  function meshNow() {
    return hf.heightField(S.prep, opts());
  }

  /** The first-use notice (the intake's, once per batch whichever way the picture came): Continue agrees to the depth model
   *  download, made the first time a picture is opened (js/model/jit.js, through the shared installer). Cancel opens nothing. */
  const FIRST_USE = {   // getters: the words are read when the notice shows, in the language of that moment
    get title() { return t('img3d.first.title'); },
    get lines() { return [t('img3d.first.line1'), t('img3d.first.line2')]; },
    get downloads() { return [{ name: t('img3d.first.download'), bytes: 27258801 }]; },
  };
  /** The intake's reader: the notice has been agreed to when it runs. */
  async function openBlob(blob, name) {
    const consent = !!window.SlopFirstRun;
    try {
      sayT(() => t('img3d.status.reading'));
      const img = await ns.image.decode(blob, name);
      Object.assign(S, { img: null, depth: null, depthFailed: false, mask: null, prep: null, item: null });
      $('picName').textContent = `${img.name} · ${img.W}×${img.H} px`;
      await loadLib();
      const got = await ns.jit.ensure({ consent, onStatus: say });
      if (got.reason) toast(got.reason);
      S.depthInstalled = got.installed || S.depthInstalled;
      S.img = img;
      for (const id of ['btnObj', 'btnGlb', 'btnSend']) $(id).disabled = false;
      await build();
      if (got.reason) say(got.reason, true);
      refreshDepthNote();
    } catch (e) { say(e.message, true); }
  }

  async function exportGlb() {
    if (!S.item) return;
    const name = S.img.name + (S.item.kind === 'mesh' ? '' : '-' + S.item.kind);
    await ns.exporter.exportGlb(S.item, name, S.img.canvas);
  }
  async function exportObj() {
    ns.exporter.exportObj(meshNow(), S.img.name);
  }
  async function sendTo3d() {
    try {
      await ns.exporter.sendTo3d(meshNow(), S.img.name, S.img.canvas);
    } catch (e) { sayT(() => t('img3d.status.send_failed', { error: e.message }), true); }
  }

  function bind() {
    // The one way in (shared/intake, spec 'img3d'): Open image…, a drop on the view, From Slop Drive…, a paste, ?drive=<id>
    // and a PWA launch; one picture at a time, after the first-use notice.
    SlopIntake.register({
      id: 'img3d', limit: 1, notice: FIRST_USE, accept: { types: ['image/*'], get noun() { return t('img3d.app.a_picture'); } },
      process: async (f) => { await openBlob(f, f.name); return f.name; },
    });
    $('btnOpen').addEventListener('click', () => SlopIntake.pick({ to: 'img3d', multiple: false }));
    SlopIntake.dropTarget($('vp'), { to: 'img3d' });
    $('btnDrive').addEventListener('click', () => SlopIntake.fromDrive({ to: 'img3d', title: t('img3d.app.drive_title') }));
    $('btnMore').addEventListener('click', async () => { await loadLib(); if (window.SlopLibrary) SlopLibrary.open({ onInstalled: refreshDepthNote }); });
    $('btnObj').addEventListener('click', exportObj);
    $('btnGlb').addEventListener('click', exportGlb);
    $('btnSend').addEventListener('click', sendTo3d);
    for (const id of ['invert', 'subject', 'mode', 'grid']) $(id).addEventListener('change', () => build());
    for (const [id, out] of [['scale', 'scaleVal'], ['smooth', 'smoothVal'], ['size', 'sizeVal']]) {
      $(id).addEventListener('input', () => { $(out).textContent = (+$(id).value).toFixed(id === 'scale' ? 2 : id === 'size' ? 1 : 0); build(); });
    }
  }

  /** For the assistant's commands (ai-commands.js, loaded when the AI panel first asks): the page's own steps. */
  ns.app = { state: () => S, openBlob, useDepthMap, build, opts, meshNow, idle: () => !S.busy && !S.again };
  function commands() {
    const C = window.SlopCmd;
    if (!C || !C.init) return;
    C.init({ app: 'img3d' });
    if (C.provide) C.provide({ prepare: () => (ns.ai ? null : new Promise((res, rej) => {
      const el = Object.assign(document.createElement('script'), { src: new URL('js/app/ai-commands.js', location.href).href });
      el.onload = res; el.onerror = () => rej(new Error('Could not load ai-commands.js')); document.head.append(el);
    })) });
  }

  async function boot() {
    bind();
    commands();
    $('scaleVal').textContent = (+$('scale').value).toFixed(2);
    sayT(() => t('img3d.status.start'));
    $('picName').textContent = t('img3d.pic.none');
    // a language change: the status line, the depth note and the empty picture line again, in the new language
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => {
      if (said) sayT(said[0], said[1]);
      depthNote();
      if (!S.img) $('picName').textContent = t('img3d.pic.none');
    });
    refreshDepthNote();
    loadLib().then(() => { if (window.SlopLibrary) SlopLibrary.onChange(refreshDepthNote); });
    const H = window.SlopHub;
    if (H) {
      try { H.register('img3d'); } catch (e) { /* no hub: the app still works */ }
    }
    SlopIntake.launch({ to: 'img3d' });
  }
  boot();
})();
