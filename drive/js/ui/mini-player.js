/* Slop Drive — ui/mini-player: the bar at the bottom of the page while a file plays, so playback goes on after Quick look
 * or the details panel is closed. Shows the name, play or pause, previous and next, the time and a stop button. */
'use strict';
(function (DR) {
  const el = DR.el, P = DR.player;
  const clock = (t) => { t = isFinite(t) && t > 0 ? Math.floor(t) : 0; return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const button = (label, title, act) => { const b = el('button', { type: 'button', class: 'btn mp-b', title, 'aria-label': title }, label); b.addEventListener('click', act); return b; };
  let bar = null, name = null, play = null, time = null;
  function build() {
    name = el('span', { class: 'mp-name' });
    play = button('▶', DR.t('drive.audio.play'), () => P.toggle());
    time = el('span', { class: 'mp-time' });
    bar = el('div', { class: 'mini-player', role: 'region', 'aria-label': DR.t('drive.audio.player'), hidden: '' },
      el('span', { class: 'mp-label', 'data-i18n': 'drive.audio.now_playing' }, DR.t('drive.audio.now_playing')), name,
      button('⏮', DR.t('drive.audio.prev'), () => P.step(-1)), play, button('⏭', DR.t('drive.audio.next'), () => P.step(1)), time,
      button(DR.t('drive.audio.stop'), DR.t('drive.audio.stop_tip'), () => P.stop()));
    // built once: the words follow a language switch (rebuilt in place)
    DR.onLang(() => { const was = bar; bar = null; was.remove(); build(); });
    document.body.append(bar);
    P.subscribe(render);
    render();
  }
  function render() {
    if (!bar) return;
    bar.hidden = !P.cur;
    if (!P.cur) return;
    name.textContent = P.cur.name;
    name.title = P.error || P.cur.name;
    const playing = !P.audio.paused;
    play.textContent = playing ? '❚❚' : '▶';
    play.title = DR.t(playing ? 'drive.audio.pause' : 'drive.audio.play');
    play.setAttribute('aria-label', play.title);
    time.textContent = `${clock(P.audio.currentTime)} / ${clock(P.audio.duration)}`;
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})(window.DR);
