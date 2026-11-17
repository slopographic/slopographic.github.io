/* SlopCut: the Export dialog (MP4 / WebM / GIF, resolution, frame rate, quality, range), the progress
   dialog with Cancel and the result dialog (preview, download, Save to Slop Drive). */
(function () {
  'use strict';
  const SE = window.SE, SV = window.SlopVideo, U = SE.util, M = SE.model;
  const h = U.h;
  const XD = SE.exportDialog = {};

  /** Output size for a preset id (shared/video presets), or the custom width and height. Even sides. */
  XD.size = function (choice, cw, ch) {
    const sz = SV.presets.size(choice, cw, ch) || { w: SE.doc.w, h: SE.doc.h };
    return { w: sz.w + (sz.w % 2), h: sz.h + (sz.h % 2) };
  };
  XD.range = function (which) {
    const p = SE.doc, d = M.duration(p);
    if (which === 'io' && p.io) return { a: p.io.in || 0, b: p.io.out != null ? p.io.out : d };
    return { a: 0, b: d };
  };
  function nameFor(ext) { return U.baseName(SE.doc.name).replace(/[\\/:*?"<>|]+/g, '-') + '.' + ext; }

  SE.act.exportVideo = function (preset = {}) { open(Object.assign({}, preset)); };
  SE.act.exportGif = function () { open({ format: 'gif' }); };

  function open(init) {
    if (!SE.doc.clips.length) { SlopUI.toast(U.t('slopedit.menu.add_some_clips_to_the')); return; }
    SE.player.pause();
    const caps = SE.caps, p = SE.doc, st = U.store.get('export', {});
    const formats = (caps.webcodecs ? [['mp4', 'MP4 (H.264 / AAC)'], ['webm', U.t('slopedit.exp.webm_vp9_opus')]] : []).concat(caps.recorder ? [['rec', U.t('slopedit.exp.webm_real_time_recording')]] : [], [['gif', U.t('slopedit.exp.animated_gif_short_clip')]]);
    // Every setting comes back as the person last chose it; the project size is only the fallback for the size.
    const has = (list, v) => list.some((x) => x[0] === v);
    const choices = SV.presets.choices();
    const fmt = SlopUI.select(formats, has(formats, init.format) ? init.format : has(formats, st.vfmt) ? st.vfmt : formats[0][0]);
    const res = SlopUI.select(choices, has(choices, st.res) ? st.res : SV.presets.idFor(p.w, p.h));
    const cw = SlopUI.number(st.cw || p.w, SV.presets.MIN, SV.presets.MAX_W, 2), ch = SlopUI.number(st.ch || p.h, SV.presets.MIN, SV.presets.MAX_H, 2);
    const cwRow = SlopUI.field(U.t('slopedit.fx.width'), cw, 'px'), chRow = SlopUI.field(U.t('slopedit.fx.height'), ch, 'px');
    const fps = SlopUI.select([[24, '24 fps'], [25, '25 fps'], [30, '30 fps'], [50, '50 fps'], [60, '60 fps']], st.fps || p.fps);
    const q = SlopUI.select([['low', U.t('slopedit.exp.low_small_file')], ['medium', U.t('slopedit.exp.medium')], ['high', U.t('slopedit.exp.high')], ['max', U.t('slopedit.exp.maximum')]], st.q || 'high');
    const hasIO = !!(p.io && (p.io.in != null || p.io.out != null));
    const rangeOpts = [['all', U.t('slopedit.exp.entire_sequence')], ['io', U.t('slopedit.exp.in_to_out')]].filter(([v]) => v === 'all' || hasIO);
    const range = SlopUI.select(rangeOpts, has(rangeOpts, st.range) ? st.range : hasIO ? 'io' : 'all');
    const gw = SlopUI.select([[320, U.t('slopedit.exp.320_px_wide')], [480, U.t('slopedit.exp.480_px_wide')], [640, U.t('slopedit.exp.640_px_wide')]], st.gw || 480);
    const gf = SlopUI.select([[10, '10 fps'], [12, '12 fps'], [15, '15 fps']], st.gf || 12);
    const audio = SlopUI.check(U.t('slopedit.exp.include_audio'), st.audio !== false);
    const note = h('p', { class: 'exp-note' });
    const vRows = h('div', { class: 'exp-grid' }, SlopUI.field(U.t('slopedit.exp.size'), res), cwRow, chRow, SlopUI.field(U.t('slopedit.fx.frame_rate'), fps), SlopUI.field(U.t('slopedit.exp.quality'), q), audio.el);
    const gRows = h('div', { class: 'exp-grid' }, SlopUI.field(U.t('slopedit.fx.width'), gw), SlopUI.field(U.t('slopedit.fx.frame_rate'), gf));
    async function refresh() {
      const f = fmt.value, gif = f === 'gif';
      vRows.hidden = gif; gRows.hidden = !gif;
      cwRow.hidden = chRow.hidden = res.value !== SV.presets.CUSTOM;
      const r = XD.range(range.value), dur = r.b - r.a;
      if (gif) { note.className = 'exp-note' + (dur > 15 ? ' warn' : ''); note.textContent = dur > 15 ? U.t('slopedit.exp.gifs_are_limited_to_15') : U.t('slopedit.exp.gif_note', { d: U.dur(dur) }); return; }
      const s = XD.size(res.value, +cw.value, +ch.value), est = SE.encode.bitrate(s.w, s.h, +fps.value, q.value) * dur / 8 + (audio.input.checked ? 16000 * dur : 0);
      let msg = s.w + '×' + s.h + ' · ' + U.dur(dur) + ' · ' + U.t('slopedit.exp.about', { size: U.fmtBytes(est) }) + '. ';
      note.className = 'exp-note';
      if (f === 'rec') { msg += U.t('slopedit.exp.rec_note', { d: U.dur(dur) }); note.className = 'exp-note warn'; }
      else {
        try {
          const sel = await SE.encode.pick(f, s.w, s.h, +fps.value, SE.encode.bitrate(s.w, s.h, +fps.value, q.value), audio.input.checked);
          msg += U.t('slopedit.exp.video_codec', { c: sel.video.codec }) + (sel.audio ? ' · ' + U.t('slopedit.exp.audio_codec', { c: sel.audio.codec }) : audio.input.checked ? ' · ' + U.t('slopedit.exp.no_audio_enc') : '') + '.';
          if (f === 'mp4' && !sel.video.h264) { msg += ' ' + U.t('slopedit.exp.no_h264', { c: sel.video.mux.toUpperCase() }); note.className = 'exp-note warn'; }
        } catch (e) { msg += e.message; note.className = 'exp-note warn'; }
      }
      note.textContent = msg;
    }
    // Remember every choice as it is made (not only on Export), so Cancel and reopen keep it.
    function save() {
      U.store.set('export', { vfmt: fmt.value === 'gif' ? st.vfmt : fmt.value, range: range.value, res: res.value, cw: +cw.value, ch: +ch.value, fps: +fps.value, q: q.value, gw: +gw.value, gf: +gf.value, audio: audio.input.checked });
    }
    for (const el of [fmt, res, cw, ch, fps, q, range, gw, gf, audio.input]) el.addEventListener('change', () => { save(); refresh(); });
    SlopUI.dialog({
      title: U.t('slopedit.app.export'), cls: 'exp-dlg',
      body: h('div', null, SlopUI.field(U.t('slopedit.exp.format'), fmt), SlopUI.field(U.t('slopedit.exp.range'), range), vRows, gRows, note),
      buttons: [{ label: U.t('slopedit.fx.cancel') }, { label: U.t('slopedit.app.export'), primary: true, act: () => {
        save();
        const r = XD.range(range.value), size = XD.size(res.value, +cw.value, +ch.value);
        if (size.w !== SE.doc.w || size.h !== SE.doc.h) SE.settings.apply({ w: size.w, h: size.h }); // the preset is the sequence size
        setTimeout(() => run({ format: fmt.value, size, fps: +fps.value, quality: q.value, audio: audio.input.checked, a: r.a, b: r.b, gw: +gw.value, gf: +gf.value }), 0);
      } }]
    });
    refresh();
  }
  /** Run an export with progress and cancel. Resolves with { blob, info } or null. */
  async function run(o) {
    const signal = { cancelled: false };
    const prog = SE.progress.open(o.format === 'gif' ? U.t('slopedit.exp.exporting_gif') : U.t('slopedit.exp.exporting_video'), { onCancel: () => { signal.cancelled = true; } });
    const progress = (f, m) => prog.set(f, m);
    // A long video render (not GIF) shows the support card inside this dialog; the render is never affected.
    const sup = o.format === 'gif' ? null : SlopSupport.trackRender('slopcut', prog.box);
    try {
      let out;
      if (o.format === 'gif') out = { blob: await SE.gif.render({ a: o.a, b: Math.min(o.b, o.a + 15), width: o.gw, fps: o.gf, progress, signal }), info: { fps: o.gf } };
      else if (o.format === 'rec') out = await SE.recorder.run({ w: o.size.w, h: o.size.h, fps: o.fps, a: o.a, b: o.b, quality: o.quality, progress, signal });
      else out = await SE.encode.run({ format: o.format, w: o.size.w, h: o.size.h, fps: o.fps, quality: o.quality, audio: o.audio, a: o.a, b: o.b, progress, signal });
      if (sup) sup.done();
      prog.close();
      const ext = o.format === 'gif' ? 'gif' : out.blob.type.includes('mp4') ? 'mp4' : 'webm';
      result(out, nameFor(ext));
      return out;
    } catch (e) {
      if (sup) sup.done();
      prog.close();
      if (e && e.name === 'AbortError') { SE.app.status(U.t('slopedit.exp.export_cancelled')); return null; } // i18n-ignore: class names
      console.error(e);
      SlopUI.alert(U.t('slopedit.exp.export_failed'), (e && e.message) || String(e));
      return null;
    }
  }
  XD.run = run;
  function result(out, name) {
    const url = URL.createObjectURL(out.blob);
    const media = out.blob.type === 'image/gif' ? h('img', { src: url, alt: U.t('slopedit.exp.exported_gif'), class: 'exp-media' }) : h('video', { src: url, controls: true, playsinline: true, class: 'exp-media' });
    const i = out.info || {};
    SlopUI.dialog({
      title: U.t('slopedit.exp.export_finished'), cls: 'exp-dlg', onClose: () => setTimeout(() => URL.revokeObjectURL(url), 60000),
      body: h('div', null, media, h('p', { class: 'sui-p' }, name + ' · ' + U.fmtBytes(out.blob.size) + (i.w ? ' · ' + i.w + '×' + i.h : '') + (i.codec ? ' · ' + i.codec : '') + (i.seconds ? ' · rendered in ' + i.seconds.toFixed(1) + ' s' : ''))),
      buttons: [window.SlopHub && !SE.offline ? { label: U.t('slopedit.exp.save_to_slop_drive'), act: async () => { await SlopHub.saveToDrive(out.blob, name); return false; } } : null,
        { label: U.t('slopedit.exp.download'), primary: true, act: () => SlopUI.download(out.blob, name) }].filter(Boolean)
    });
    SE.app.status(U.t('slopedit.exp.exported', { name }));
    SlopSupport.afterExport('slopcut');
    XD.last = out;
  }
})();
