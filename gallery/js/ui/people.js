/* Slop Gallery: the People bar, shown above the grid in the People view. It says whether face detection is on (off by
 * default), counts the checked photos and the one / many / none groups, and shows the background scan's progress with
 * Stop and Find faces (resume). The first time the view is opened while the setting is off, the explanation dialog
 * opens (SlopFaces.askOptIn). Classic script; exposes window.SlopGallery.peopleBar. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const $ = (id) => document.getElementById(id);
  const F = () => window.SlopFaces || null;
  let mounted = false;

  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  function text(s) {
    if (!s.enabled) return t('gallery.people.off');
    if (!s.total) return t('gallery.people.empty');
    if (!s.checked) return t('gallery.people.none_checked', { n: s.total });
    const parts = [t('gallery.people.checked', { checked: s.checked, total: s.total })];
    if (s.one) parts.push(t('gallery.people.one', { n: s.one }));
    if (s.many) parts.push(t('gallery.people.many', { n: s.many }));
    if (s.none) parts.push(t('gallery.people.zero', { n: s.none }));
    return parts.join(' · ') + '.';
  }

  function render() {
    const bar = $('peopleBar');
    if (!bar || !mounted) return;
    const f = F(), on = !!(f && f.enabled());
    const st = G.state.state;
    bar.hidden = st.view !== 'people';
    if (bar.hidden) return;
    const s = Object.assign(G.people.stats(), { enabled: on });
    $('peopleText').textContent = text(s);
    $('peopleOn').hidden = on;
    $('peopleGo').hidden = !on || s.running || !s.pending;
    $('peopleGo').textContent = t(s.paused ? 'gallery.people.resume' : 'gallery.people.find');
    $('peopleStop').hidden = !(on && s.running);
    const prog = $('peopleProg');
    prog.hidden = !(on && (s.running || s.paused) && s.pending + s.done > 0);
    if (!prog.hidden) { prog.max = Math.max(1, s.done + s.pending); prog.value = s.done; }
    if (F() && F().view) $('peopleMode').value = F().view.mode();
    $('peopleStatus').textContent = s.running ? t('gallery.people.running', { done: s.done, pending: s.pending }) : (s.paused ? t('gallery.people.paused') : '');
  }

  function init() {
    const bar = $('peopleBar');
    if (!bar) return;
    mounted = true;
    $('peopleOn').addEventListener('click', () => { if (F()) F().askOptIn('gallery'); });
    $('peopleGo').addEventListener('click', () => G.people.start());
    $('peopleStop').addEventListener('click', () => G.people.stop());
    $('peopleAll').addEventListener('click', () => { if (G.facesUi) G.facesUi.open(); });
    if (F() && F().view) {
      const mode = $('peopleMode');
      mode.addEventListener('change', () => F().view.setMode(mode.value));
      F().view.onChange(render);
    }
    G.state.subscribe((what) => {
      if (what !== 'view') return;
      if (G.state.state.view === 'people' && F() && !F().enabled() && !F().asked()) F().askOptIn('gallery');
      render();
    });
    G.people.subscribe(render);
    if (window.SlopI18n) window.SlopI18n.on(render);
    if (F()) F().onChange(render);
    render();
  }

  G.peopleBar = { init, render };
})();
