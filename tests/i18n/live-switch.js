/* One app opened in English, then switched to Swedish live (SlopI18n.set('sv') in the app's own window), as a browser
 * test: words the app drew once must follow the switch. LiveSwitch.spec({...}) adds a describe block that opens the app
 * in a same-origin iframe in English, checks the listed places read the English table value, switches, and checks they
 * read the Swedish one. The expected words come from the page's own SlopI18n.t(key), so a reworded table never breaks it.
 *
 *   LiveSwitch.spec({
 *     name: 'Orders', path: '../../orders/index.html',
 *     ready: (doc, win) => doc.querySelector('#oRows .sl-empty'),   // the app is built
 *     checks: [['#oRows .sl-empty', 'orders.li.empty'], ['.tc', 'slopedit.tr.current_time_click_to_go', 'title']],
 *     labels: ['resize.app.settings'],   // a panel's name: its aria-label, or a button's "<name> panel" (ui.frame.panel_aria)
 *   });
 *
 * A check is [selector, key, attribute?]: the element's text (or the attribute) must contain the key's words. */
(function () {
  'use strict';
  const { describe, it, afterEach, expect, waitFor } = SlopTest;
  const frames = [];
  const read = (doc, c) => { const el = doc.querySelector(c[0]); return el ? (c[2] ? el.getAttribute(c[2]) : el.textContent) || '' : 'missing ' + c[0]; };
  /** The panel named by key k: an element whose aria-label is the name, or whose aria-label or title says "<name> panel". */
  function named(doc, I, k) {
    const name = I.t(k), pn = I.t('ui.frame.panel_aria', { label: name });
    return [...doc.querySelectorAll('[aria-label], [title]')].some((el) => { const a = el.getAttribute('aria-label') || ''; return a === name || a.includes(pn) || (el.getAttribute('title') || '').includes(pn); });
  }
  /** True when every check and label reads the current language's words. */
  function reads(doc, I, o) {
    return o.checks.every((c) => read(doc, c).includes(I.t(c[1]))) && (o.labels || []).every((k) => named(doc, I, k));
  }
  function expectAll(doc, I, o) {
    for (const c of o.checks) expect(read(doc, c)).toContain(I.t(c[1]));
    for (const k of o.labels || []) expect(named(doc, I, k) ? 'found' : 'no panel named ' + I.t(k)).toBe('found');
  }

  function spec(o) {
    describe(o.name + ': English, then Swedish live', () => {
      afterEach(() => { frames.splice(0).forEach((f) => f.remove()); localStorage.clear(); });
      it('the words drawn once follow SlopI18n.set("sv")', async () => {
        localStorage.clear();
        localStorage.setItem('slop-profile', JSON.stringify({ v: 1, data: { lang: { mode: 'en' } } }));
        const f = document.createElement('iframe');
        f.style.cssText = 'width:1280px;height:800px;border:0;display:block';
        f.src = o.path;
        document.body.append(f);
        frames.push(f);
        await waitFor(() => f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentWindow.SlopI18n && o.ready(f.contentDocument, f.contentWindow), { timeout: 30000 });
        const doc = f.contentDocument, w = f.contentWindow, I = w.SlopI18n;
        await I.ready();
        if (o.before) await o.before(doc, w);
        await waitFor(() => reads(doc, I, o), { timeout: 8000 }).catch(() => {});
        expectAll(doc, I, o);
        const en = o.checks.map((c) => I.t(c[1]));
        const switched = new Promise((res) => w.addEventListener('slopi18n', res, { once: true }));
        I.set('sv');
        await switched;
        expect(doc.documentElement.getAttribute('lang')).toBe('sv');
        o.checks.forEach((c, i) => expect(I.t(c[1]) === en[i] ? 'same words: ' + c[1] : 'differs').toBe('differs'));
        await waitFor(() => reads(doc, I, o), { timeout: 8000 }).catch(() => {});   // some panels redraw on a short timer
        expectAll(doc, I, o);
      }, { timeout: 60000 });
    });
  }
  window.LiveSwitch = { spec };
})();
