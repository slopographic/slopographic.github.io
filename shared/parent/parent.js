/* The suite a single-app site belongs to (brand profile `parent`, brand/README.md "Single-app sites"): the site shows a
 * few apps (apps.hide leaves the rest out) and links back to the full suite. shared/apps.js holds the profile's
 * { name, url } as window.SLOP_PARENT (null on a site without one: then nothing here changes anything).
 * Classic script, loaded by shell/shell.js after the registry. Exposes window.SlopParent:
 *   SlopParent.info()        { name, url } or null
 *   SlopParent.href(url)     the one helper for links: an address in a hidden app's folder (the folder of the registry app
 *                            that holds it decides, the longest one) -> the same path on the parent site; any other unchanged
 *   SlopParent.headerLink()  the header's "More free tools" link (shell/header.js), or null without a parent
 * With a parent, every link on the page into a hidden app goes to the parent: rewritten once the page is parsed, and again
 * as one is clicked (a link made later), and the shell's own navigation (SlopShell.navigate) asks href() too. The words
 * are in shared/parent/i18n (keys parent.*), loaded only on a site with a parent. Tests: tests/shell/parent.test.html. */
(function (g) {
  'use strict';
  if (g.SlopParent) return;
  const doc = g.document, me = doc.currentScript;
  const ROOT = new URL('../../', me && me.src ? me.src : doc.baseURI);
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4"/></svg>';
  const info = () => { const p = g.SLOP_PARENT; return p && typeof p.url === 'string' && /^https:\/\//.test(p.url) ? p : null; };

  /** The registry app whose folder holds a path from the site root ('ocr/x/'), when the profile hides it. */
  function hiddenOwner(rel) {
    const hide = g.SLOP_HIDDEN_APPS || [];
    let best = null;
    for (const a of g.SLOP_ALL_APPS || []) if (a.path && a.path[0] !== '#' && rel.startsWith(a.path) && (!best || a.path.length > best.path.length)) best = a;
    return best && hide.indexOf(best.id) >= 0 ? best : null;
  }
  function href(url) {
    const p = info();
    if (!p) return url;
    let u;
    try { u = new URL(url, doc.baseURI); } catch (e) { return url; }
    if (u.origin !== ROOT.origin || !u.pathname.startsWith(ROOT.pathname)) return url;
    const rel = u.pathname.slice(ROOT.pathname.length);
    return hiddenOwner(rel) ? p.url.replace(/\/+$/, '') + '/' + rel + u.search + u.hash : url;
  }
  /** A link's target, sent to the parent when it is a hidden app's. */
  function fix(a) {
    const h = a.getAttribute('href');
    if (!h || h[0] === '#' || /^(javascript|mailto|tel|blob|data):/i.test(h)) return;
    const to = href(a.href);
    if (to !== a.href) a.href = to;
  }
  const t = (key, en) => { const I = g.SlopI18n, s = I ? I.t(key) : key; return s && s !== key ? s : en; };

  /** "More free tools" for the header: a shared header button that gives way to an icon in a full header, and on a
   *  phone folds into More first (shared/ui/hbtn.js FOLD). */
  function headerLink() {
    const p = info();
    if (!p) return null;
    const a = doc.createElement('a');
    a.className = 'sh-hbtn slop-hbtn sh-parent';
    a.href = p.url;
    a.setAttribute('data-i18n-vars', JSON.stringify({ name: p.name }));
    a.setAttribute('data-i18n-attr', 'data-hbtn-label:parent.more_tools;title:parent.more_tools_tip;aria-label:parent.more_tools_tip');
    a.dataset.hbtnLabel = t('parent.more_tools', 'More free tools →');
    const tip = g.SlopI18n ? g.SlopI18n.t('parent.more_tools_tip', { name: p.name }) : '';
    a.title = tip && tip !== 'parent.more_tools_tip' ? tip : 'More free tools at ' + p.name;
    a.setAttribute('aria-label', a.title);
    a.innerHTML = ICON + '<span class="slop-hbtn-txt" data-i18n="parent.more_tools"></span>';
    a.lastChild.textContent = a.dataset.hbtnLabel;
    return a;
  }

  if (info()) {
    const I = g.SlopI18n;
    if (I && I.source) {   // the words: English and the chosen language (shared/parent/i18n/index.js)
      const s = doc.createElement('script');
      s.src = new URL('shared/parent/i18n/index.js', ROOT).href;
      doc.head.append(s);
    }
    const all = () => doc.querySelectorAll('a[href]').forEach(fix);
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', all); else all();
    const on = (e) => { const a = e.target && e.target.closest && e.target.closest('a[href]'); if (a) fix(a); };
    doc.addEventListener('click', on, true);
    doc.addEventListener('auxclick', on, true);
  }
  g.SlopParent = { info, href, headerLink };
})(window);
