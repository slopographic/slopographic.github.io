/* The business apps in Swedish, one describe() per entry of window.SV_APPS (tests/i18n/sv-apps/<app>.js): the page
 * opens in Swedish and shows the listed words, no key shows, a live switch to English and back works, and at 390 px
 * nothing scrolls sideways. Loaded by tests/i18n/biz-sv.test.html and biz-sv-docs.test.html. */
(function () {
  const { describe, it, beforeEach, afterEach, expect, waitFor, run } = SlopTest;
  // Each app in a same-origin iframe, so it shares this page's localStorage (the language choice).
  const frames = [];
  function open(app, lang, width = 1280) {
    localStorage.setItem('slop-profile', JSON.stringify({ v: 1, data: { lang: { mode: lang } } }));
    const f = document.createElement('iframe');
    f.style.width = width + 'px';
    f.src = `../../${app.app}/index.html`;
    document.body.append(f);
    frames.push(f);
    return waitFor(() => f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentDocument.querySelector(app.ready) && f.contentWindow.SlopI18n, { timeout: 30000 }).then(() => f);
  }
  /** A key showing as text: '<app>.x.y', 'biz.x.y' (or a shared one) where words should be. */
  const keyRe = (app) => new RegExp(`(^|[\\s(“"'«])(${app.app}|biz|ui|menu|shell|nav)\\.[a-z0-9_]+\\.?[a-z0-9_.]*[a-z0-9_]`);
  function visible(doc) {
    const out = [doc.body.innerText];
    for (const el of doc.querySelectorAll('[title], [aria-label], [placeholder]')) out.push(el.getAttribute('title') || '', el.getAttribute('aria-label') || '', el.getAttribute('placeholder') || '');
    return out.join('\n');
  }
  const read = (doc, [sel, , attr]) => { const el = doc.querySelector(sel); return el ? (attr ? el.getAttribute(attr) || '' : el.textContent.trim()) : `(no ${sel})`; };
  const holds = (doc, checks) => checks.every((c) => read(doc, c) === c[1]);

  for (const app of window.SV_APPS || []) {
    describe(`${app.app} in Swedish`, () => {
      beforeEach(() => { localStorage.clear(); });
      afterEach(() => { frames.splice(0).forEach((f) => f.remove()); localStorage.clear(); });

      it('shows its controls in Swedish, with no key showing', async () => {
        const f = await open(app, 'sv');
        const doc = f.contentDocument;
        await waitFor(() => holds(doc, app.sv), { timeout: 15000 }).catch(() => {});
        expect(doc.documentElement.getAttribute('lang')).toBe('sv');
        for (const c of app.sv) expect(read(doc, c)).toBe(c[1]);
        expect(keyRe(app).test(visible(doc))).toBe(false);
      }, { timeout: 60000 });

      it('switches to English live, and back to Swedish', async () => {
        const f = await open(app, 'sv');
        const doc = f.contentDocument, I = f.contentWindow.SlopI18n;
        await waitFor(() => holds(doc, app.sv), { timeout: 15000 });
        I.set('en');
        await waitFor(() => holds(doc, app.en), { timeout: 20000 });
        expect(doc.documentElement.getAttribute('lang')).toBe('en');
        I.set('sv');
        await waitFor(() => holds(doc, app.sv), { timeout: 20000 });
        expect(keyRe(app).test(visible(doc))).toBe(false);
      }, { timeout: 90000 });

      it('fits a 390 px screen in Swedish, with no sideways scroll', async () => {
        const f = await open(app, 'sv', 390);
        const doc = f.contentDocument;
        await waitFor(() => doc.documentElement.getAttribute('lang') === 'sv', { timeout: 20000 });
        expect(doc.documentElement.scrollWidth <= f.contentWindow.innerWidth + 1).toBe(true);
        expect(keyRe(app).test(visible(doc))).toBe(false);
      }, { timeout: 60000 });
    });
  }
  run({ name: document.title });
})();
