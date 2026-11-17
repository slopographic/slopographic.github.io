/* The site's contact address: the one place it is set. A brand profile's `email` (brand/README.md "A contact address")
 * replaces the marker below in a white-label build; null (or no email in the profile) means no contact line anywhere.
 *   - The site footer (tools/seo/footnav.mjs) bakes "Contact: <address>" from this value into every page with the footer
 *     navigation, so it shows without JavaScript; the SEO writer reads this file in Node (vm, like shared/apps.js).
 *   - A page that loads this script fills or hides every [data-contact] element: the <a data-contact-email> inside it
 *     gets mailto:<address> and the address as its text; without an address the element is hidden (the privacy page).
 * Classic script. Exposes window.SlopContact:
 *   SlopContact.email()      the address, or '' when the site has none
 *   SlopContact.mount(doc)   fills or hides the page's [data-contact] elements; returns how many it filled
 * Test hook: window.SLOP_CONTACT set before this file loads stands in for the profile's value.
 * Tests: tests/shell/contact.test.html (browser), tests/node/whitelabel-contact.test.mjs (profile, build, footer). */
(function (g) {
  'use strict';
  if (g.SlopContact) return;
  const EMAIL = /*profile:email*/'info@slopographic.com';
  const VALID = /^[^\s@"'<>():;,]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

  function email() {
    const v = g.SLOP_CONTACT !== undefined ? g.SLOP_CONTACT : EMAIL;
    return typeof v === 'string' && VALID.test(v.trim()) ? v.trim() : '';
  }
  function mount(d) {
    const root = d || g.document, at = email();
    let n = 0;
    for (const box of root.querySelectorAll('[data-contact]')) {
      const a = box.querySelector('[data-contact-email]');
      box.hidden = !at || !a;
      if (box.hidden) continue;
      a.href = 'mailto:' + at;
      a.textContent = at;
      n++;
    }
    return n;
  }

  g.SlopContact = { email, mount, VALID };
  const doc = g.document;
  if (!doc || !doc.querySelectorAll) return;   // Node (tools/seo/footnav.mjs) reads the value only
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => mount()); else mount();
})(typeof window !== 'undefined' ? window : globalThis);
