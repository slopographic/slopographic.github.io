/* Slop Recorder: the middle of the page. The stage (the live picture while counting down and recording, with the
 * countdown and the timer over it; the recording to play back after), the trim bar under it, and "What your browser can
 * record" (core/support.js, from the features detected here). Classic script: SlopRec.view.
 *   live(stream)          shows a stream (null: nothing); sound-only recordings show a level line instead
 *   count(n), timer(ms, state)   the countdown number (0 hides it) and the recording badge (state 'recording' | 'paused' | '')
 *   review(rec)           the recording in the player, the trim bar reset to all of it; review(null) clears it
 *   trim() / setTrim(start, end)   the kept range in seconds (checked: core/plan.js clampTrim)
 *   support()             draws the support section */
(function (g) {
  'use strict';
  const R = (g.SlopRec = g.SlopRec || {});
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let dur = 0, range = { start: 0, end: 0 }, url = null, onTrim = () => {};

  function live(stream) {
    const v = $('rc-live');
    v.srcObject = stream || null;
    v.hidden = !stream;
    if (stream) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    $('rc-empty').hidden = !!stream || !$('rc-play').hidden;
  }
  function count(n) {
    const c = $('rc-count');
    c.hidden = !n;
    c.textContent = n ? String(n) : '';
  }
  function timer(ms, state) {
    const b = $('rc-badge');
    b.hidden = !state;
    b.dataset.state = state || '';
    $('rc-time').textContent = state === 'paused' ? t('recorder.app.time_paused', { time: R.plan.clock(ms) }) : R.plan.clock(ms);
  }
  function drawTrim() {
    const P = R.plan;
    $('rc-start').max = $('rc-end').max = String(dur);
    $('rc-start').value = String(range.start);
    $('rc-end').value = String(range.end);
    $('rc-start-out').textContent = P.seconds(range.start);
    $('rc-end-out').textContent = P.seconds(range.end);
    $('rc-kept').textContent = t('recorder.app.keeping', { kept: P.seconds(range.end - range.start), total: P.seconds(dur) });
    const bar = $('rc-trimbar');
    bar.style.setProperty('--a', dur ? (range.start / dur) * 100 + '%' : '0%');
    bar.style.setProperty('--b', dur ? (range.end / dur) * 100 + '%' : '100%');
  }
  function setTrim(start, end) {
    range = R.plan.clampTrim(start, end, dur);
    drawTrim();
    onTrim(range);
    return range;
  }
  function review(rec) {
    const v = $('rc-play');
    if (url) { URL.revokeObjectURL(url); url = null; }
    v.hidden = !rec;
    $('rc-trim').hidden = !rec;
    if (!rec) { v.removeAttribute('src'); v.load(); dur = 0; $('rc-empty').hidden = !$('rc-live').hidden; return; }
    url = URL.createObjectURL(rec.blob);
    v.src = url;
    v.classList.toggle('rc-audio', !!rec.audioOnly);
    $('rc-empty').hidden = true;
    dur = Math.round(rec.ms) / 1000;
    range = { start: 0, end: dur };
    drawTrim();
  }
  function support() {
    const S = R.support, caps = R.capture.caps(), rows = S.rows(caps, g.navigator.userAgent), b = S.browserOf(g.navigator.userAgent);
    // the browser's name in the page's language ('Chrome on macOS', 'This browser')
    const name = b.name === 'other' ? t('recorder.support.this_browser') : S.NAMES[b.name];
    const os = b.os === 'ios' ? t('recorder.support.ios') : S.OSES[b.os];
    $('rc-support-who').textContent = t('recorder.support.who', { browser: os ? t('recorder.support.on_os', { browser: name, os }) : name });
    const WORD = { yes: t('ui.yes'), no: t('ui.no'), partial: t('recorder.support.partly') };
    $('rc-support-rows').replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th'), st = document.createElement('td'), note = document.createElement('td');
      th.scope = 'row'; th.textContent = t(`recorder.support.${r.id}`);
      st.className = 'rc-st rc-' + r.status; st.textContent = WORD[r.status];
      note.textContent = t(`recorder.support.n_${r.nk}`);
      tr.append(th, st, note);
      return tr;
    }));
    $('rc-other-rows').replaceChildren(...S.TABLE.map((r) => {
      const tr = document.createElement('tr');
      for (const v of [t(`recorder.support.b_${r.k}`), WORD[r.screen], t(`recorder.support.s_${r.sk}`), WORD[r.camera]]) { const td = document.createElement('td'); td.textContent = v; tr.append(td); }
      return tr;
    }));
  }
  function wire(fn) {
    onTrim = fn || onTrim;
    $('rc-start').addEventListener('input', (e) => setTrim(Math.min(Number(e.target.value), range.end - R.plan.MIN_LEN), range.end));
    $('rc-end').addEventListener('input', (e) => setTrim(range.start, Math.max(Number(e.target.value), range.start + R.plan.MIN_LEN)));
    $('rc-start-here').addEventListener('click', () => setTrim($('rc-play').currentTime, range.end));
    $('rc-end-here').addEventListener('click', () => setTrim(range.start, $('rc-play').currentTime));
    $('rc-trim-reset').addEventListener('click', () => setTrim(0, dur));
    const v = $('rc-play');
    // playback stays inside the kept part, so the person hears what will be saved
    v.addEventListener('timeupdate', () => { if (!v.paused && v.currentTime >= range.end) { v.pause(); v.currentTime = range.start; } });
    v.addEventListener('play', () => { if (v.currentTime < range.start || v.currentTime >= range.end - 0.05) v.currentTime = range.start; });
  }
  // a language change: the support section and the trim line again
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(() => { if (R.capture) support(); if (dur) drawTrim(); });
  R.view = { live, count, timer, review, trim: () => Object.assign({}, range), setTrim, support, wire, duration: () => dur };
})(typeof window !== 'undefined' ? window : globalThis);
