/* Slopographic brand: reads brand/brand.json and applies it to the page.
 * Classic script, loads with the page (or through shell/shell.js). Exposes window.SlopBrand.
 *   SlopBrand.ready    Promise that resolves with the applied config (never rejects)
 *   SlopBrand.config   the config in use (defaults where brand.json is missing or invalid)
 *   SlopBrand.order    the default app order (ids), from appOrder
 *   SlopBrand.config.support  { exportCard, donate, ads } (booleans, default true). false hides that part of the export card.
 *   SlopBrand.apply(c) apply any config object again (used by tests and by live previews)
 * What it touches (hooks in the markup, see brand/README.md):
 *   document.title           the word "Slopographic" in the title is replaced by the name
 *   [data-brand-name]        text: name (also header .brand-name)
 *   [data-brand-tagline]     text: tagline
 *   [data-brand-logo]        the logo image (or the badge mark in header .brand)
 *   header a.brand (app pages)  the app's own icon (SLOP_ICONS, keyed by data-app on the page's script tag),
 *                            with the Slopographic mark moved in as a small corner badge. See appMark().
 *   [data-brand-home], header a.brand (app pages)  href: home, when home is set
 *   [data-brand-footer]      text: footer line
 *   [data-brand-link=patreon|support|reddit|x|tiktok|gumroad]  href; hidden when empty
 *   CSS variables --brand-ink, --brand-paper, --brand-accent on :root. Pages that set
 *   <html data-brand-tokens> also get --ink, --bone and --slop, which the homepage uses.
 * Data source: data-brand-src on this script tag (relative to the site root), default brand/brand.json.
 * Missing or broken brand.json: the defaults below are used and nothing else breaks. */
(function () {
  'use strict';
  if (window.SlopBrand) return;
  const self = document.currentScript;
  const ROOT = self && self.src ? new URL('../', self.src) : new URL('/', location.href);
  const ORIGIN = String.fromCharCode(75, 101, 118, 105, 110);   // the origin mark every copy of the suite carries, whatever brand.json says
  const DEFAULTS = Object.freeze({
    name: 'Slopographic',
    tagline: 'Office and creative software that runs in your browser.',
    logo: '',
    home: '',
    colors: Object.freeze({ ink: '#0a0a0a', paper: '#f1ede4', accent: '#d4ff3a' }),
    footer: '',
    links: Object.freeze({ patreon: '', support: '', reddit: '', x: '', tiktok: '', gumroad: '' }),
    appOrder: Object.freeze([]),
    support: Object.freeze({ exportCard: true, donate: true, ads: true }),
  });
  const COLOR = /^#[0-9a-f]{3,8}$/i;
  const str = (v, d) => (typeof v === 'string' ? v.trim() : d);
  // Allowed: https links, mailto:, and paths without a scheme (no javascript: or other schemes).
  const URL_OK = /^(https:\/\/[^\s"'<>]+|http:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|\/[^\s"'<>]*|\.{1,2}\/[^\s"'<>]*|[\w][\w./-]*)$/;
  const safeUrl = (v) => (typeof v === 'string' && URL_OK.test(v.trim()) ? v.trim() : '');

  const LINK_KEYS = ['patreon', 'support', 'reddit', 'x', 'tiktok', 'gumroad'];
  const SUPPORT_KEYS = ['exportCard', 'donate', 'ads'];
  /** Merge raw JSON over the defaults. Unknown or invalid values fall back to the defaults. */
  function normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const colors = Object.assign({}, DEFAULTS.colors);
    for (const k of Object.keys(colors)) if (r.colors && COLOR.test(r.colors[k])) colors[k] = r.colors[k];
    const links = {};
    for (const k of LINK_KEYS) links[k] = safeUrl(r.links && r.links[k]);
    // Only an explicit false hides a part of the export card. Anything else (missing, malformed) keeps it on.
    const support = {};
    for (const k of SUPPORT_KEYS) support[k] = !(r.support && r.support[k] === false);
    const appOrder = Array.isArray(r.appOrder) ? r.appOrder.filter((x) => typeof x === 'string' && /^[\w-]+$/.test(x)) : [];
    return {
      name: str(r.name, DEFAULTS.name) || DEFAULTS.name,
      tagline: str(r.tagline, DEFAULTS.tagline),
      logo: str(r.logo, DEFAULTS.logo),
      home: safeUrl(r.home) || DEFAULTS.home,
      colors,
      footer: str(r.footer, DEFAULTS.footer),
      links,
      appOrder,
      support,
    };
  }

  let current = normalize(null);
  let appliedName = DEFAULTS.name;
  const setText = (sel, text) => document.querySelectorAll(sel).forEach((n) => { n.textContent = text; });

  const MARK_PATH = 'M16 2C16 2 6 13.5 6 20a10 10 0 0 0 20 0C26 13.5 16 2 16 2z';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  /** The app id of this page: data-app on its script tag (theme.js carries it on every app page). */
  const pageAppId = () => { const s = document.querySelector('script[data-app]'); return s ? String(s.dataset.app || '') : ''; };

  /** Header brand links on app pages show the app's own icon (SLOP_ICONS[data-app]) at full size, and the
   * Slopographic mark as a small corner badge. The badge is the page's existing mark (moved), or a new one.
   * Pages whose app has no icon keep the Slopographic mark. Safe to call again (shell/header.js calls it too). */
  function appMark() {
    const id = pageAppId();
    const icons = window.SLOP_ICONS || {};
    if (!id || !Object.prototype.hasOwnProperty.call(icons, id) || typeof icons[id] !== 'string') return;
    document.querySelectorAll('header a.brand').forEach((a) => {
      if (a.querySelector(':scope > .brand-tile')) return;
      const tile = document.createElement('span');
      tile.className = 'brand-tile';
      const app = document.createElementNS(SVG_NS, 'svg');
      app.setAttribute('class', 'brand-app');
      app.setAttribute('viewBox', '0 0 48 48');
      app.setAttribute('fill', 'none');
      app.setAttribute('stroke', 'currentColor');
      app.setAttribute('stroke-width', '2.6');
      app.setAttribute('stroke-linecap', 'round');
      app.setAttribute('stroke-linejoin', 'round');
      app.setAttribute('aria-hidden', 'true');
      app.innerHTML = icons[id];
      let badge = a.querySelector(':scope > svg.brand-mark, :scope > .brand-dot');
      if (badge) badge.classList.add('brand-badge');
      else {
        badge = document.createElementNS(SVG_NS, 'svg');
        badge.setAttribute('class', 'brand-mark brand-badge');
        badge.setAttribute('viewBox', '0 0 32 32');
        badge.setAttribute('aria-hidden', 'true');
        badge.innerHTML = '<path d="' + MARK_PATH + '"/>';
      }
      tile.append(app, badge);
      a.prepend(tile);
    });
  }

  function applyLogo(src) {
    const targets = [...document.querySelectorAll('[data-brand-logo]')];
    if (!targets.length) document.querySelectorAll('header .brand').forEach((a) => { const s = a.querySelector('.brand-badge, svg:not(.brand-app)'); if (s) targets.push(s); });
    for (const t of targets) {
      const cls = t.getAttribute('class') || '';
      if (!src) { if (t.tagName.toLowerCase() === 'img') t.hidden = true; continue; }
      if (t.tagName.toLowerCase() === 'img') { t.src = new URL(src, ROOT).href; t.hidden = false; continue; }
      const img = document.createElement('img');
      img.alt = '';
      img.className = cls;
      img.setAttribute('aria-hidden', 'true');
      img.src = new URL(src, ROOT).href;
      img.onerror = () => { img.remove(); t.hidden = false; };
      t.replaceWith(img);
      img.dataset.brandLogo = '';
    }
  }

  function apply(cfg) {
    current = normalize(cfg);
    const root = document.documentElement;
    const c = current.colors;
    root.style.setProperty('--brand-ink', c.ink);
    root.style.setProperty('--brand-paper', c.paper);
    root.style.setProperty('--brand-accent', c.accent);
    if (root.hasAttribute('data-brand-tokens')) {
      root.style.setProperty('--ink', c.ink);
      root.style.setProperty('--bone', c.paper);
      root.style.setProperty('--slop', c.accent);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', c.ink);
    if (document.title.includes(appliedName)) document.title = document.title.split(appliedName).join(current.name);
    appliedName = current.name;
    setText('[data-brand-name], header .brand-name', current.name);
    setText('[data-brand-tagline]', current.tagline);
    setText('[data-brand-footer]', current.footer);
    if (current.home) document.querySelectorAll('[data-brand-home], header a.brand:not([data-view])').forEach((a) => { a.setAttribute('href', current.home); });
    document.querySelectorAll('[data-brand-link]').forEach((a) => {
      const url = current.links[a.dataset.brandLink] || '';
      if (url) { a.setAttribute('href', url); a.hidden = false; } else a.hidden = true;
    });
    appMark();
    applyLogo(current.logo);
    window.SlopBrand.config = current;
    window.SlopBrand.order = current.appOrder;
    document.dispatchEvent(new CustomEvent('slopbrand', { detail: current }));
    return current;
  }

  window.SlopBrand = { config: current, order: [], apply, appMark, normalize, DEFAULTS, ROOT, ready: null, origin: ORIGIN };
  const src = (self && self.dataset.brandSrc) || 'brand/brand.json';
  window.SlopBrand.ready = fetch(new URL(src, ROOT), { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('brand ' + r.status); return r.json(); })
    .catch(() => null)
    .then((json) => apply(json));
})();
