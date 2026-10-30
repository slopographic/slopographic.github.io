/* Loads the homepage in a same-origin iframe for the homepage tests.
 * openHome({ fresh }) resolves with the iframe's window once app.js, the catalog and (when the build has it) the mascot are up. */
(function () {
  'use strict';
  async function openHome({ fresh = true, hash = '' } = {}) {
    if (fresh) try { localStorage.removeItem('slop.mascot.v1'); } catch (e) { /* ignore */ }
    const old = document.getElementById('home-frame');
    if (old) old.remove();
    const f = document.createElement('iframe');
    f.id = 'home-frame';
    f.style.cssText = 'width:1200px;height:760px;border:0;display:block';
    f.src = '../../index.html' + hash;
    document.body.prepend(f);
    await new Promise((r) => f.addEventListener('load', r, { once: true }));
    const win = f.contentWindow;
    // the built-in mascot is up too; a build without it (tests/brand-facts.js) has none to wait for
    const mascot = () => window.BRAND_FACTS.mascot !== 'builtin' || win.SlopMascot;
    await SlopTest.waitFor(() => mascot() && win.document.querySelector('.app-card'), { timeout: 15000 });
    return win;
  }
  /** Wait until the mascot is standing on something. */
  const settled = (win, timeout = 8000) => SlopTest.waitFor(() => win.SlopMascot.M.mode === 'perched', { timeout });
  /** The homepage's words for an i18n key: in a plain-tone build its plain wording (plain.<key>, home/sections.js), else
   *  the key's; vars fill {placeholders}. */
  const words = (win, key, vars) => {
    const I = win.SlopI18n;
    if (window.BRAND_FACTS.tone === 'plain') { const p = I.t('plain.' + key, vars); if (p !== 'plain.' + key) return p; }
    return I.t(key, vars);
  };
  window.HomeTest = { openHome, settled, words };
})();
