/* A house promo: one short line with a link to the site owner's own business, set by the brand profile (`promo`,
 * brand/README.md "A promo line"). Never an ad network: a plain link, no script, image or request from anyone else, no
 * cookie; nothing is fetched until the visitor follows it. This site has none (the marker is null): then nothing here
 * changes anything.
 * The profile gives { text, url, where }: text is one string or one per language ({ "en": ..., "sv": ... }; a language
 * it lacks reads English, then the first one), where the places it shows ("home": under the homepage's app list,
 * "settings": the end of Settings; default both). A page marks a place with an empty, hidden
 * <div data-promo-slot="home"></div>; never inside an editor. The link opens a new tab (in the iPhone/iPad app the
 * system browser: the app opens every other site's address there). "Hide" keeps it away on this device (localStorage,
 * until the profile's line or address changes).
 * Classic script, loaded at the end of a page that has a slot. Exposes window.SlopPromo:
 *   SlopPromo.info()         { text, url, where } or null
 *   SlopPromo.text(code)     the line in a language
 *   SlopPromo.mount(doc)     fills the page's slots (run once on load; again after a slot is added)
 * Test hook: window.SLOP_PROMO set before this file loads stands in for the profile's value.
 * The words around the line are in shared/promo/i18n (keys promo.*), loaded only when there is a promo.
 * Tests: tests/shell/promo.test.html (browser), tests/node/whitelabel-promo.test.mjs (profile and build). */
(function (g) {
  'use strict';
  if (g.SlopPromo) return;
  const PROMO = /*profile:promo*/null;
  const doc = g.document, me = doc.currentScript;
  const ROOT = new URL('../../', me && me.src ? me.src : doc.baseURI);
  const KEY = 'slop-promo-hidden';
  const PLACES = ['home', 'settings'];
  const CSS = '.promo-strip{display:flex;align-items:center;gap:8px;max-width:760px;margin:24px auto;padding:10px 12px 10px 16px;'
    + 'border:1px solid var(--line,rgba(127,127,127,.3));border-radius:12px;background:var(--ink-2,transparent);font-size:14px;line-height:1.4}'
    + '.promo-strip a{flex:1;color:var(--bone,inherit);text-decoration:none}.promo-strip a:hover span,.promo-strip a:focus-visible span{text-decoration:underline}'
    + '.promo-strip .promo-go{color:var(--bone-dim,inherit);margin-left:4px}'
    + '.promo-strip button{flex:none;min-width:32px;min-height:32px;border:0;border-radius:8px;background:none;color:var(--bone-dim,inherit);font:inherit;font-size:18px;cursor:pointer}'
    + '.promo-strip button:hover,.promo-strip button:focus-visible{background:var(--line,rgba(127,127,127,.2))}';

  function info() {
    const p = g.SLOP_PROMO !== undefined ? g.SLOP_PROMO : PROMO;
    if (!p || typeof p.url !== 'string' || !/^https:\/\/[^\s]+$/.test(p.url)) return null;
    const line = p.text;
    if (!(typeof line === 'string' ? line.trim() : line && typeof line === 'object' && Object.keys(line).length)) return null;
    return p;
  }
  function text(code) {
    const p = info();
    if (!p) return '';
    if (typeof p.text === 'string') return p.text;
    const c = String(code || 'en'), base = c.split('-')[0], keys = Object.keys(p.text);
    return p.text[c] || p.text[base] || p.text.en || p.text[keys[0]] || '';
  }
  const places = (p) => (Array.isArray(p.where) && p.where.length ? p.where : PLACES);
  const sig = (p) => p.url + ' ' + JSON.stringify(p.text);
  function hidden(p) { try { return g.localStorage.getItem(KEY) === sig(p); } catch (e) { return false; } }
  function hide(p) { try { g.localStorage.setItem(KEY, sig(p)); } catch (e) { /* storage blocked: hidden for this page */ } }
  const lang = () => { const I = g.SlopI18n; return I && I.get ? I.get() : (doc.documentElement.lang || 'en'); };
  const t = (key, en) => { const I = g.SlopI18n, s = I ? I.t(key) : key; return s && s !== key ? s : en; };

  /** The strip's words in the page's language (again when the language changes). */
  function words(box) {
    const p = info();
    if (!p) return;
    box.querySelector('.promo-text').textContent = text(lang());
    box.setAttribute('aria-label', t('promo.label', 'A note from us'));
    const b = box.querySelector('button');
    b.title = t('promo.hide', 'Hide this note');
    b.setAttribute('aria-label', b.title);
    box.querySelector('a').title = t('promo.opens', 'Opens in your browser');
  }
  function strip(p) {
    const box = doc.createElement('aside');
    box.className = 'promo-strip';
    const a = doc.createElement('a');
    a.href = p.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';   // nothing about this site goes with the visit
    a.innerHTML = '<span class="promo-text"></span><b class="promo-go" aria-hidden="true">↗</b>';
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = '×';
    b.addEventListener('click', () => {
      hide(p);
      for (const s of doc.querySelectorAll('[data-promo-slot]')) { s.hidden = true; s.textContent = ''; }
    });
    box.append(a, b);
    words(box);
    return box;
  }
  function mount(d) {
    const p = info(), root = d || doc;
    if (!p || hidden(p)) return 0;
    if (!doc.getElementById('promo-style')) {
      const st = doc.createElement('style');
      st.id = 'promo-style';
      st.textContent = CSS;
      doc.head.append(st);
    }
    let n = 0;
    for (const slot of root.querySelectorAll('[data-promo-slot]')) {
      if (places(p).indexOf(slot.getAttribute('data-promo-slot')) < 0 || slot.firstChild) continue;
      slot.append(strip(p));
      slot.hidden = false;
      n++;
    }
    return n;
  }

  g.SlopPromo = { info, text, mount, PLACES };
  if (!info()) return;
  const I = g.SlopI18n;
  if (I && I.source) {   // the words: English and the chosen language (shared/promo/i18n/index.js)
    const s = doc.createElement('script');
    s.src = new URL('shared/promo/i18n/index.js', ROOT).href;
    doc.head.append(s);
  }
  if (I && I.on) I.on(() => doc.querySelectorAll('.promo-strip').forEach(words));
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => mount()); else mount();
})(window);
