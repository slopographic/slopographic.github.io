/* SlopIsolate video — the player on the stage. Shown when the active item is a video (#stage[data-kind=video]).
 * Play / scrub drive a hidden <video> element; each frame is drawn with its matte (the frame's matte is picked by
 * time) over a checkerboard, or as the original. Buttons: Cut out video (Cancel while it runs), Save WebM (alpha),
 * Save MP4 on a background colour. Limits and what the browser can do are written under the controls. */
(function () {
  'use strict';
  const CO = window.CO, V = CO.video, U = CO.util, S = CO.state, MT = V.matte, t = U.t;
  const P = V.player = {};
  let root = null, vid = null, cv = null, els = {}, raf = 0, shownId = null;

  const fmt = (sec) => (sec || 0).toFixed(1);
  /** The item on screen as a video, or null. */
  const current = () => { const it = S.current(); return it && it.kind === 'video' ? it : null; };

  function build(stage) {
    root = U.h('div', { class: 'vplayer', id: 'vplayer', hidden: '' });
    cv = U.h('canvas', { class: 'vp-canvas', 'aria-label': t('cutout.video.preview') });
    vid = U.h('video', { muted: '', playsinline: '', preload: 'auto', hidden: '' });
    const screen = U.h('div', { class: 'vp-screen' }, cv);
    els.play = U.h('button', { type: 'button', class: 'btn' });
    els.scrub = U.h('input', { type: 'range', min: '0', max: '1000', value: '0', class: 'vp-scrub' });
    els.time = U.h('span', { class: 'vp-time' }, t('cutout.video.time', { t: fmt(0), d: fmt(0) }));
    els.view = U.h('select', { class: 'vp-view' }, U.h('option', { value: 'cut' }), U.h('option', { value: 'orig' }));
    els.process = U.h('button', { type: 'button', class: 'btn primary' });
    els.cancel = U.h('button', { type: 'button', class: 'btn', hidden: '' });
    els.webm = U.h('button', { type: 'button', class: 'btn', disabled: '' });
    els.bg = U.h('input', { type: 'color', value: '#00ff00', class: 'vp-bg' });
    els.mp4 = U.h('button', { type: 'button', class: 'btn', disabled: '' });
    els.bgl = U.h('span');
    els.msg = U.h('p', { class: 'vp-msg', role: 'status' });
    const controls = U.h('div', { class: 'vp-controls' }, els.play, els.scrub, els.time, els.view);
    const actions = U.h('div', { class: 'vp-actions' }, els.process, els.cancel, els.webm, U.h('label', { class: 'vp-bgl' }, els.bgl, ' ', els.bg), els.mp4);
    labels();
    root.append(screen, controls, actions, els.msg, vid);
    stage.append(root);
    wire();
  }

  /** The player's words (again after a language change). */
  function labels() {
    cv.setAttribute('aria-label', t('cutout.video.preview'));
    els.play.textContent = vid && !vid.paused ? t('cutout.video.pause') : t('cutout.video.play');
    els.play.setAttribute('aria-label', t('cutout.video.play'));
    els.scrub.setAttribute('aria-label', t('cutout.video.scrub'));
    els.view.setAttribute('aria-label', t('cutout.video.show'));
    els.view.options[0].textContent = t('cutout.video.cut');
    els.view.options[1].textContent = t('cutout.video.orig');
    els.cancel.textContent = t('cutout.video.cancel');
    els.webm.textContent = t('cutout.video.webm');
    els.bg.setAttribute('aria-label', t('cutout.video.bg_tip'));
    els.bgl.textContent = t('cutout.video.bg');
    els.mp4.textContent = t('cutout.video.mp4');
    els.process.textContent = t('cutout.video.run');
  }

  function wire() {
    els.play.onclick = () => { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); };
    els.scrub.oninput = () => { const it = current(); if (it) vid.currentTime = (els.scrub.value / 1000) * it.vid.src.duration; };
    els.view.onchange = () => draw();
    els.process.onclick = () => { const it = current(); if (it) V.run(it); };
    els.cancel.onclick = () => { const it = current(); if (it) V.cancel(it); };
    els.webm.onclick = () => { const it = current(); if (it) V.saveWebm(it); };
    els.mp4.onclick = () => { const it = current(); if (it) V.saveMp4(it, els.bg.value); };
    vid.addEventListener('play', loop);
    vid.addEventListener('pause', () => { els.play.textContent = t('cutout.video.play'); draw(); });
    vid.addEventListener('seeked', draw);
    vid.addEventListener('timeupdate', () => { sync(); });
    vid.addEventListener('ended', () => { vid.pause(); });
  }

  /** Draw the frame at the video's time with its matte (frame index = time × fps). */
  function draw() {
    const it = current();
    if (!it || !it.vid.src) return;
    const src = it.vid.src, res = it.vid.res, W = src.out.w, H = src.out.h;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    if (els.view.value === 'cut' && res) {
      const i = U.clamp(Math.round(vid.currentTime * src.fps), 0, res.masks.length - 1);
      g.drawImage(MT.frame(vid, res.masks[i], res.mw, res.mh, W, H, null), 0, 0);
    } else g.drawImage(vid, 0, 0, W, H);
    sync();
  }
  function sync() {
    const it = current();
    if (!it) return;
    const d = it.vid.src ? it.vid.src.duration : 0;
    els.scrub.value = d ? Math.round((vid.currentTime / d) * 1000) : 0;
    els.time.textContent = t('cutout.video.time', { t: fmt(vid.currentTime), d: fmt(d) });
  }
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (vid.paused || vid.ended) return;
      draw();
      els.play.textContent = t('cutout.video.pause');
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /** Show the video item (or hide the player). Called on every change of the active item and item state. */
  function refresh() {
    const it = current(), stage = U.$('#stage');
    if (!root || !stage) return;
    stage.dataset.kind = it ? 'video' : '';
    root.hidden = !it;
    if (!it) { vid.pause(); shownId = null; return; }
    if (shownId !== it.id) {
      shownId = it.id;
      vid.pause();
      vid.src = it.vid.src.url;
      vid.currentTime = 0;
    }
    const st = it.status, res = it.vid.res;
    els.process.disabled = st === 'working' || !it.vid.src;
    els.process.textContent = t(res ? 'cutout.video.again' : 'cutout.video.run');
    els.cancel.hidden = st !== 'working';
    els.webm.disabled = !res || st === 'working';
    els.mp4.disabled = !res || st === 'working';
    const lim = it.vid && it.vid.lim, parts = [];
    if (it.status === 'error') parts.push(it.error);
    else if (lim && lim.msg) parts.push(lim.msg);
    if (!res && st !== 'working') parts.push(t('cutout.video.first_pass'));
    els.msg.textContent = parts.join(' ');
    draw();
  }

  CO.videoPlayer = P;
  P.init = function () {
    const stage = U.$('#stage');
    if (!stage) return;
    build(stage);
    CO.on('activeItem', refresh);
    CO.on('item', (it) => { if (current() && current().id === it.id) refresh(); });
    CO.on('list', refresh);
    U.onLang(() => { labels(); refresh(); });
    CO.on('export', () => {});
    // A hidden tab stops its frame loop and the video: nothing is decoded or drawn while nobody can see it.
    document.addEventListener('visibilitychange', () => { if (document.hidden && vid) vid.pause(); });
  };
})();
