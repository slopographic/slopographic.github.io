/* The contrast sweep's driver (tests/a11y/sweep-*.test.html): each app page in each theme, on a desktop (1280 px) and a
 * phone (390 px) width, is opened fresh in a frame (first visit, the theme chosen in Settings), its visible text is
 * audited (tests/a11y/contrast.js); at the phone width the shared components are then opened on it and audited too
 * (components.js: they take the same tokens at every width, so one width is enough). A test fails with each low-contrast text:
 * where it is, its colours and its ratio. The test page loads shared/profile/profile.js and shared/theme/theme.js first.
 *   SlopSweep.define(['../../pdf/', '../../docs/'], { themes, widths, components })   (paths from the test page, written out in it so
 *   tools/ci/deps.mjs sees which app each page opens; components: false audits the page alone, for a site page such as
 *   the homepage, which has no app UI kit)
 * The results also go to window.__CONTRAST__ ({ 'pdf/ dark 390': { page, components } }) for tools that tally them. */
(function (g) {
  'use strict';
  const THEMES = ['light', 'dark', 'classic', 'lime'];
  const WIDTHS = [1280, 390];
  const H = { 1280: 800, 390: 844 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g.__CONTRAST__ = {};

  function frame(width) {
    const old = document.getElementById('app'), f = document.createElement('iframe');
    f.id = 'app'; f.style.cssText = `width:${width}px;height:${H[width]}px;border:0;display:block`;
    if (old) old.replaceWith(f); else document.body.append(f);
    return f;
  }
  async function open(path, theme, width) {
    try {
      localStorage.clear();
      localStorage.setItem('slop.consent', JSON.stringify({ v: 1, analytics: false, ads: false, t: 1 }));
      // As Settings saves it: the profile's choice and every app's own theme key (pages without the profile read those).
      const r = SlopTheme.set(theme);
      if (!r.ok) throw new Error('theme ' + theme + ': ' + r.error);
    } catch (e) { /* none */ }
    const f = frame(width);
    f.src = path;
    await SlopTest.waitFor(() => { const d = f.contentDocument; return d && d.readyState === 'complete' && d.body && f.contentWindow.location.href !== 'about:blank'; }, { timeout: 40000 });
    await sleep(700);
    // Colours are read as they end, not halfway through a fade: transitions and animations finish at once.
    const st = f.contentDocument.createElement('style');
    st.textContent = '*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;animation-delay:0s!important}';
    f.contentDocument.head.append(st);
    await sleep(50);
    return f.contentWindow;
  }
  const line = (where, x) => `${where}: ${x.sel} "${x.text}" ${x.fg} on ${x.bg} = ${x.ratio} (needs ${x.need})`;

  function define(paths, o = {}) {
    const { describe, it, expect } = SlopTest;
    for (const path of paths) {
      const name = path.replace(/^(\.\.\/)+/, '');
      describe(name, () => {
        for (const theme of o.themes || THEMES) {
          for (const width of o.widths || WIDTHS) {
            it(`${theme} ${width}px: every text reads on its background`, async () => {
              const W = await open(path, theme, width);
              const page = SlopContrast.audit(W);
              const comps = width < 600 && o.components !== false ? await SlopContrastKit.components(W, { heavy: true }) : [];
              g.__CONTRAST__[`${name} ${theme} ${width}`] = { page, components: comps };
              const bad = page.fails.map((x) => line('page', x));
              for (const c of comps) for (const x of c.fails) bad.push(line(c.name, x));
              expect(bad).toEqual([]);
            }, { timeout: 90000 });
          }
        }
      });
    }
  }
  g.SlopSweep = { define, THEMES, WIDTHS };
})(window);
