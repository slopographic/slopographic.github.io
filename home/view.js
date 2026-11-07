/* The homepage's two views: home and the Authenticator (#detector). A click on a [data-view] link or a hash change
 * switches them; the Authenticator's files (detector/) load the first time it opens, so the home view never fetches them.
 *   window.slopShowView(name)   'home' or 'detector' (home/catalog.js's jump links call it; the mascot follows the change)
 *   window.SlopHomeView         { show, current(), detector() -> Promise of the mounted Authenticator { input, run } }
 * Also keeps --top (the sticky header's height, read by home/home.css and home/hero.css) up to date. */
(function () {
  'use strict';
  const $ = (sel) => document.querySelector(sel);
  const DETECTOR = ['detector/rules.js', 'detector/samples.js', 'detector/detector.js'];

  function addScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;   // fetched side by side, run in order
      s.onload = res;
      s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.append(s);
    });
  }
  function addCss(href) {
    return new Promise((res) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = l.onerror = res;   // unstyled beats never showing
      document.head.append(l);
    });
  }

  let detectorP = null;
  function detector() {
    if (!detectorP) detectorP = Promise.all([addCss('detector/detector.css'), ...DETECTOR.map(addScript)])
      .then(() => window.SlopDetect.mount($('#view-detector')))
      .catch((e) => { detectorP = null; throw e; });
    return detectorP;
  }

  let current = '';
  let token = 0;
  function show(name) {
    if (name !== 'detector') name = 'home';
    const mine = ++token;
    if (current && current !== name) window.scrollTo(0, 0);
    current = name;
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.view === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    const reveal = () => {
      if (mine !== token) return;   // another view was asked for meanwhile
      $('#view-home').hidden = name !== 'home';
      $('#view-detector').hidden = name !== 'detector';
    };
    if (name === 'home') return reveal();
    return detector().then(reveal, (e) => { console.warn(e); if (mine === token) show('home'); });
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-view]');
    if (!t) return;
    e.preventDefault();
    const v = t.dataset.view;
    history.replaceState(null, '', v === 'detector' ? '#detector' : location.pathname + location.search);
    window.scrollTo({ top: 0 });
    const p = show(v);
    if (v === 'detector' && p) p.then(() => detector()).then((d) => d.input.focus({ preventScroll: true }), () => {});
  });

  const route = () => show(location.hash === '#detector' ? 'detector' : 'home');
  window.addEventListener('hashchange', route);

  const setTopOffset = () => document.documentElement.style.setProperty('--top', $('.nav').offsetHeight + 'px');
  window.addEventListener('resize', setTopOffset);
  setTopOffset();
  route();

  window.slopShowView = show;
  window.SlopHomeView = { show, current: () => current, detector };
})();
