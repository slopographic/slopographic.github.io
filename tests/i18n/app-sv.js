/* One app in Swedish, as a browser test: AppSv.spec({...}) adds a describe block that opens the app in a same-origin
 * iframe in Swedish and checks that the listed controls read Swedish and no '<ns>.' key shows, switches to English live
 * (the same controls read English) and back, and at 390 px checks there is no sideways scroll. Each app's page is
 * tests/i18n/<app>-sv.test.html (shared/i18n/APPS-HOWTO.md § 6).
 *
 *   AppSv.spec({
 *     name: 'Checksum', path: '../../checksum/index.html', ns: 'checksum',
 *     ready: (doc, win) => doc.querySelector('#ck-copy'),          // the app is built
 *     checks: [['#ck-copy', 'Kopiera hash', 'Copy hash'], ['#ck-expect', 'Klistra in…', 'Paste…', 'placeholder']],
 *     before: async (f) => {},                                      // optional: open a panel or a menu first
 *   });
 *
 * A check is [selector, Swedish, English, attribute?]: the element's text (or the attribute) must contain the string. */
(function () {
  'use strict';
  const { describe, it, afterEach, beforeEach, expect, waitFor } = SlopTest;
  const frames = [];
  const KEY = (ns) => new RegExp('(^|[\\s(“"\'«”])(' + ns.replace(/[-.]/g, '\\$&') + '|ui|menu|shell|nav)\\.[a-z0-9_]+\\.[a-z0-9_.]*[a-z0-9_]');
  /** Text a person sees or hears in the page: the body text and the labelling attributes. */
  function visible(doc) {
    const out = [doc.body.innerText];
    for (const el of doc.querySelectorAll('[title], [aria-label], [placeholder]')) out.push(el.getAttribute('title') || '', el.getAttribute('aria-label') || '', el.getAttribute('placeholder') || '');
    return out.join('\n');
  }
  async function open(o, lang, width) {
    localStorage.setItem('slop-profile', JSON.stringify({ v: 1, data: { lang: { mode: lang } } }));
    const f = document.createElement('iframe');
    f.style.cssText = 'width:' + (width || 1280) + 'px;height:800px;border:0;display:block';
    f.src = o.path;
    document.body.append(f);
    frames.push(f);
    await waitFor(() => f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentWindow.SlopI18n && o.ready(f.contentDocument, f.contentWindow), { timeout: 30000 });
    await f.contentWindow.SlopI18n.ready();
    await waitFor(() => f.contentDocument.documentElement.getAttribute('lang') === lang, { timeout: 20000 });
    if (o.before) await o.before(f);
    return f;
  }
  function read(doc, c) {
    const el = doc.querySelector(c[0]);
    if (!el) return null;
    return (c[3] ? el.getAttribute(c[3]) : el.textContent) || '';
  }
  const all = (doc, checks, i) => checks.every((c) => (read(doc, c) || '').includes(c[i]));
  function expectAll(doc, checks, i) {
    for (const c of checks) {
      const v = read(doc, c);
      expect(v === null ? 'missing ' + c[0] : v).toContain(c[i]);
    }
  }

  function spec(o) {
    describe(o.name + ' in Swedish', () => {
      beforeEach(() => { localStorage.clear(); });
      afterEach(() => { frames.splice(0).forEach((f) => f.remove()); localStorage.clear(); });

      it('shows Swedish controls, with no key showing', async () => {
        const f = await open(o, 'sv');
        expectAll(f.contentDocument, o.checks, 1);
        expect(KEY(o.ns).test(visible(f.contentDocument))).toBe(false);
      });

      it('switches to English live and back to Swedish', async () => {
        const f = await open(o, 'sv');
        const doc = f.contentDocument, I = f.contentWindow.SlopI18n;
        I.set('en');
        await waitFor(() => all(doc, o.checks, 2), { timeout: 20000 });
        expect(doc.documentElement.getAttribute('lang')).toBe('en');
        I.set('sv');
        await waitFor(() => all(doc, o.checks, 1), { timeout: 20000 });
        expect(KEY(o.ns).test(visible(doc))).toBe(false);
      });

      it('fits at 390 px in Swedish, with no sideways scroll', async () => {
        const f = await open(o, 'sv', 390);
        const doc = f.contentDocument;
        expect(doc.documentElement.scrollWidth <= f.contentWindow.innerWidth + 1).toBe(true);
        expect(KEY(o.ns).test(visible(doc))).toBe(false);
      });
    });
  }
  window.AppSv = { spec, open, visible, KEY };
})();
