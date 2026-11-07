/* The privacy policy page (privacy/index.html). Classic script, after shared/consent/config.js.
 *   - Analytics and ads: the paragraph about them shows only when this site has them (SLOP_CONSENT_CONFIG: the brand
 *     profile's third-party switch is on and an analytics or ad ID is set); otherwise "No analytics, no ads" shows.
 *   - Contact: the site's own address (from the page's canonical link, which a white-label build rewrites) and the brand's
 *     social links (brand/brand.json links: x, reddit, tiktok; never a payment link such as Patreon or Gumroad).
 * The words are the page's tables (privacy/i18n); {brand} is the brand's name (SlopI18n fills it from SlopBrand).
 * Pure helpers are exported for Node (tests/node/privacy-page.test.mjs); the page test is tests/privacy/page.test.html. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root.document) api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SOCIAL = [['x', 'X'], ['reddit', 'Reddit'], ['tiktok', 'TikTok']];

  /** True when the site has analytics or ads at all (the consent config). */
  function hasThirdParty(cfg) {
    return !!(cfg && cfg.thirdParty !== false && (cfg.ga4MeasurementId || cfg.adsensePublisherId));
  }
  /** { href, host } of the site from a canonical URL, or null. */
  function siteOf(canonical) {
    try {
      const u = new URL(String(canonical));
      return u.protocol === 'https:' ? { href: u.origin + '/', host: u.host.replace(/^www\./, '') } : null;
    } catch (e) { return null; }
  }
  /** [{ key, label, href }] for the brand's social links (https only, payment links never). */
  function socialLinks(links) {
    const out = [];
    for (const [key, label] of SOCIAL) {
      const href = links && typeof links[key] === 'string' ? links[key].trim() : '';
      if (/^https:\/\/[^\s"'<>]+$/.test(href)) out.push({ key, label, href });
    }
    return out;
  }

  function install(win) {
    const doc = win.document;
    const run = () => {
      const third = hasThirdParty(win.SLOP_CONSENT_CONFIG);
      const on = doc.querySelector('[data-privacy-third]'), off = doc.querySelector('[data-privacy-none]');
      if (on) on.hidden = !third;
      if (off) off.hidden = third;
      const canon = doc.querySelector('link[rel="canonical"]'), site = siteOf(canon && canon.href), a = doc.querySelector('[data-privacy-site]');
      if (a && site) { a.href = site.href; a.textContent = site.host; }
      const box = doc.querySelector('[data-privacy-brand-links]');
      if (box && win.SlopBrand && win.SlopBrand.ready) {
        win.SlopBrand.ready.then((c) => {
          box.textContent = '';
          for (const l of socialLinks(c && c.links)) {
            const link = doc.createElement('a');
            link.href = l.href;
            link.rel = 'noopener';
            link.textContent = l.label;
            box.append(' · ', link);
          }
        });
      }
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
    doc.addEventListener('slopbrand', run);   // brand/brand.js, loaded by the shell after this script
  }

  return { hasThirdParty, siteOf, socialLinks, install };
});
