// A single-app site (brand profile mainApp, brand/README.md "Single-app sites"): the site's root opens one app. The root
// index.html is that app's page as write.mjs writes it, with <base href="<app folder>"> first in its head: every relative
// address in the page and in its scripts (they resolve against document.baseURI) then works as on the app's own page, the
// service worker (scope /) caches it like any page, and tools/pwa-precache.mjs follows its files through the base. Two
// things a base would send to the app's folder stay on the page: a click on an in-page link (#...) and the render-blocking
// <link rel="expect" href="#...">. Both pages name the root as their canonical (robots.mjs canonicalFor).
//   mainRoot(html, app) -> the root page made from the app's page
// Tests: tests/seo/mainapp.test.mjs.

/** Keeps a click on an in-page link (href="#...") on this page; with a base it would open the app's folder. */
const HASH_LINKS = '<script>document.addEventListener(\'click\',function(e){var a=e.target.closest&&e.target.closest(\'a[href^="#"]\');'
  + 'if(!a||e.defaultPrevented||e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();var h=a.getAttribute(\'href\');'
  + 'if(h.length>1)location.hash=h;else scrollTo(0,0)})</script>';

export function mainRoot(html, app) {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (!head) throw new Error(`mainApp ${app.id}: its page has no <head>`);
  const at = head.index + head[0].length;
  const page = html.slice(0, at) + `<base href="${app.path}" data-main-app="${app.id}">${HASH_LINKS}` + html.slice(at);
  return page.replace(/(<link rel="expect" href=")#/g, '$1/#');
}
