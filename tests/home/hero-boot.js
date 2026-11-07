/* Opens the homepage for the hero tests (tests/home/hero*.test.html) in a same-origin iframe of a given width and theme,
 * and waits until the app globe (home/globe/globe.js) has drawn a few frames.
 *   HeroTest.open({ width, height, theme }) -> the iframe's window
 *   HeroTest.titleBox(win) -> the headline's box (client coordinates of the iframe)
 *   HeroTest.transforms(win) -> each globe icon's inline transform, in order */
(function () {
  'use strict';
  async function open({ width = 1280, height = 800, theme = 'light' } = {}) {
    try {
      localStorage.removeItem('slop.mascot.v1');
      localStorage.setItem('slop-profile', JSON.stringify({ v: 1, data: { theme: { mode: theme } } }));
    } catch (e) { /* storage blocked: the page still loads */ }
    const old = document.getElementById('home-frame');
    if (old) old.remove();
    const f = document.createElement('iframe');
    f.id = 'home-frame';
    f.style.cssText = `width:${width}px;height:${height}px;border:0;display:block`;
    f.src = '../../index.html';
    document.body.prepend(f);
    await new Promise((r) => f.addEventListener('load', r, { once: true }));
    const win = f.contentWindow;
    win.document.documentElement.style.scrollBehavior = 'auto';
    await SlopTest.waitFor(() => win.SlopGlobe && win.SlopGlobe.frames() > 4 && win.document.querySelector('.gx-nav a') && win.document.querySelector('#app-finder .fd-input'), { timeout: 30000 });
    return win;
  }
  const titleBox = (win) => win.document.querySelector('.hx-title').getBoundingClientRect();
  const transforms = (win) => [...win.document.querySelectorAll('.gx-i')].map((n) => n.style.transform);
  window.HeroTest = { open, titleBox, transforms };
})();
