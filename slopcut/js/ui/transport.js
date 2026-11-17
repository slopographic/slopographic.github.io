/* SlopCut: the transport bar under the program monitor (timecode, play controls, loop, safe areas,
   snapshot) and the "go to time" dialog. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, C = SE.cmd;
  const h = U.h;
  const T = SE.transport = {};
  let tc, dur, play, rate, meter;

  function btn(cmd, icon, label, cls) {
    return h('button', { type: 'button', class: 'tb' + (cls ? ' ' + cls : ''), dataset: { cmd }, 'aria-label': label, title: label, onclick: () => C.run(cmd) }, SE.icon(icon));
  }
  T.gotoDialog = async function () {
    const v = await SlopUI.prompt(U.t('slopedit.tr.go_to_time'), U.t('slopedit.tr.timecode_or_seconds'), U.timecode(SE.player.time, SE.doc.fps));
    if (v == null) return;
    const t = U.parseTime(v, SE.doc.fps);
    if (isFinite(t)) SE.player.seek(t); else SlopUI.toast(U.t('slopedit.tr.use_hh_mm_ss_ff'));
  };
  function sync() {
    const P = SE.player;
    tc.textContent = U.timecode(P.time, SE.doc.fps);
    dur.textContent = U.timecode(M.duration(SE.doc), SE.doc.fps);
  }
  function syncState() {
    const P = SE.player;
    play.replaceChildren(SE.icon(P.playing && P.rate > 0 ? 'pause' : 'play'));
    play.title = (P.playing ? U.t('slopedit.ctx.pause') : U.t('slopedit.ctx.play')) + ' (Space)';
    rate.textContent = P.playing && P.rate !== 1 ? (P.rate > 0 ? '' : '◂') + Math.abs(P.rate) + '×' : '';
    U.$$('[data-cmd]', T.el).forEach((b) => {
      const c = C.get(b.dataset.cmd); if (!c) return;
      if (c.checked) { const on = !!c.checked(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      const k = C.keyFor(c.id); if (b !== play) { b.title = c.title + (k ? ' (' + k + ')' : ''); b.setAttribute('aria-label', c.title); }
    });
  }
  /** Tiny stereo-less level meter fed by the player's analyser. */
  function meterLoop() {
    requestAnimationFrame(meterLoop);
    const P = SE.player;
    if (!meter || !P.analyser) return;
    if (!P.playing) { meter.style.setProperty('--lvl', '0'); return; }
    const a = P.analyser, buf = T._buf || (T._buf = new Float32Array(a.fftSize));
    a.getFloatTimeDomainData(buf);
    let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
    const db = 20 * Math.log10(Math.max(1e-5, m));
    meter.style.setProperty('--lvl', String(U.clamp((db + 60) / 60, 0, 1)));
    meter.classList.toggle('hot', db > -1);
  }
  T.init = function (el) {
    T.el = el;
    tc = h('button', { type: 'button', class: 'tc', title: U.t('slopedit.tr.current_time_click_to_go'), 'data-i18n-attr': 'title:slopedit.tr.current_time_click_to_go', onclick: T.gotoDialog }, '00:00:00:00');
    dur = h('span', { class: 'tc-dur', title: U.t('slopedit.tr.sequence_duration'), 'data-i18n-attr': 'title:slopedit.tr.sequence_duration' }, '00:00:00:00');
    play = h('button', { type: 'button', class: 'tb tr-play', 'aria-label': U.t('slopedit.tr.play_or_pause'), 'data-i18n-attr': 'aria-label:slopedit.tr.play_or_pause', onclick: () => C.run('play.toggle') }, SE.icon('play'));
    rate = h('span', { class: 'tr-rate', 'aria-live': 'polite' });
    meter = h('span', { class: 'meter', title: U.t('slopedit.tr.output_level'), 'data-i18n-attr': 'title:slopedit.tr.output_level', 'aria-hidden': 'true' }, h('i'));
    el.append(tc, h('span', { class: 'tb-flex' }),
      btn('play.start', 'start', U.t('slopedit.cmd.go_to_start')), btn('play.prevFrame', 'stepb', U.t('slopedit.cmd.previous_frame')),
      play, btn('play.nextFrame', 'stepf', U.t('slopedit.cmd.next_frame')), btn('play.end', 'end', U.t('slopedit.cmd.go_to_end')), rate,
      h('span', { class: 'tb-flex' }),
      btn('play.loop', 'loop', U.t('slopedit.tr.loop')), btn('view.safe', 'safe', U.t('slopedit.tr.safe_areas')), btn('file.snapshot', 'camera', U.t('slopedit.tr.snapshot_frame')), meter, dur);
    SE.on('time', sync); SE.on('change', sync); SE.on('transport', syncState); SE.on('keys', syncState); SE.on('change', syncState); SE.on('settings', sync);
    sync(); syncState(); meterLoop();
  };
})();
