/* Slopographic theme: one choice for every page (System, Light, Dark, Classic 98, Slopographic Lime).
 * Classic script, exposes window.SlopTheme. Load it in the <head> of every page, after shared/profile/profile.js, with
 * data-app on the script tag: "home" for the homepage, "settings" for Settings, the app's folder name for an app, and
 * nothing for any other page. It runs before first paint: it reads the choice, sets data-theme and the --sl-* variables,
 * and injects the override styles ahead of every app stylesheet.
 * Storage: the choice is kept in SlopProfile under appId 'theme', key 'mode' (default 'system', so 'system' is stored as
 * no override). Each app's own theme key is mirrored from that choice, so an app that reads its key at boot shows the
 * same theme. Where an app's key differs from the choice, the app's key wins on that page (a theme changed in the
 * app's own menu). A person who never chose a theme keeps the one in their old app keys. The legacy keys are listed in
 * APPS below and in storage/INVENTORY.md. */
(function (g) {
  'use strict';
  var doc = typeof document !== 'undefined' ? document : null;
  // A screenshot under assets/ that is not there (a white-label build ships without them) is hidden, never shown broken.
  if (doc) doc.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && /assets\/(shots|guides|video)\//.test(t.getAttribute('src') || '')) t.style.display = 'none'; }, true);
  /* The brand profile's colours (brand/profiles/<id>.json "themes", set by tools/whitelabel/build.mjs): { light: { background,
   * surface, text, accent, border }, dark: {...}, hide: ['lime'], brand: 'Acme' (names Light and Dark "Acme Light"...) }.
   * Empty here: this site's own. DEFAULT: the theme of a visitor who never chose one (the profile's defaultTheme). */
  var PROFILE = /*profile:themes*/{}, DEFAULT = /*profile:defaultTheme*/'system', SYSTEM = 'system';
  var tx = function (k, v) { var I = g.SlopI18n; return I && I.has(k) ? I.t(k, v) : k; };   // a shared-table key in the chosen language
  function th(id, scheme, bg, surface, text, accent, border) {
    var branded = !!PROFILE.brand && (id === 'light' || id === 'dark');   // "<brand> Light": shell.theme_brand_<id>, {brand}
    return { id: id, key: branded ? 'shell.theme_brand_' + id : 'shell.theme_' + id, branded: branded, get name() { return tx(this.key, branded ? { brand: PROFILE.brand } : undefined); }, scheme: scheme, tokens: { background: bg, surface: surface, text: text, accent: accent, border: border } };
  }
  /* The profile's voice, names and media, set before first paint as <html data-tone="playful|plain" data-naming="brand|plain"
   * data-media="on|off">; a plain tone also loads style/tone.css (the calm business look) as a render-blocking stylesheet. */
  var TONE = /*profile:tone*/'playful', NAMING = /*profile:naming*/'brand', MEDIA = /*profile:media*/true;
  /** The real themes, all five tokens each; System resolves to one. `name` reads the chrome key in the chosen language. */
  var THEMES = Object.freeze([
    th('light', 'light', '#ebe7de', '#f8f6f1', '#0a0a0a', '#4f6c00', '#8e8b82'),
    th('dark', 'dark', '#0a0a0a', '#151518', '#f1ede4', '#d4ff3a', '#66666a'),
    th('classic', 'light', '#c0c0c0', '#ffffff', '#000000', '#000080', '#808080'),
    th('lime', 'dark', '#0d1206', '#171f0c', '#f1ffb8', '#d4ff3a', '#5f713e'),
  ].filter(function (t) { return (PROFILE.hide || []).indexOf(t.id) < 0; }).map(function (t) {
    if (PROFILE[t.id]) Object.keys(t.tokens).forEach(function (k) { if (PROFILE[t.id][k]) t.tokens[k] = PROFILE[t.id][k]; });
    return t;
  }));
  var IDS = THEMES.map(function (t) { return t.id; });
  var byId = {};
  THEMES.forEach(function (t) { byId[t.id] = t; });
  /* Native values each app's own CSS and boot code understand, per shared theme id. */
  var STD = { light: 'light', dark: 'pro', classic: 'classic', lime: 'pro' };       // Light, Pro and Classic 98
  var NO_CLASSIC = { light: 'light', dark: 'pro', classic: 'pro', lime: 'pro' };    // Light and Pro only
  var DARK_CSS = { light: 'light', dark: 'dark', classic: 'dark', lime: 'dark' };   // data-theme light or dark only
  /* Each app's legacy key: fmt 'json' (a JSON string), 'raw' (a plain string) or 'prefs' (the theme field of a JSON object).
   * identity: the page uses the shared id as data-theme. Apps not listed keep their own data-theme and get the variables. */
  var APPS = {
    home: { identity: true },
    settings: { identity: true },
    drive: { key: 'slop-drive.theme', fmt: 'json', native: STD },
    ai: { key: 'slop-ai.prefs', fmt: 'prefs', native: STD },
    admin: { key: 'slop-admin.theme', fmt: 'json', native: NO_CLASSIC },
    cutout: { key: 'slop-cutout.theme', fmt: 'json', native: STD },
    slopedit: { key: 'slopedit.theme', fmt: 'json', native: STD },
    pdf: { key: 'slop-pdf.theme', fmt: 'json', native: STD },
    docs: { key: 'slop-docs.theme', fmt: 'json', native: NO_CLASSIC },
    tables: { key: 'slop-tables.theme', fmt: 'json', native: NO_CLASSIC },
    crm: { key: 'slop-crm.theme', fmt: 'json', native: NO_CLASSIC },
    invoices: { key: 'slop-invoices.theme', fmt: 'json', native: NO_CLASSIC },
    orders: { key: 'slop-orders.theme', fmt: 'json', native: NO_CLASSIC },
    ledger: { key: 'slop-ledger.theme', fmt: 'json', native: NO_CLASSIC },
    press: { key: 'slop.press.theme', fmt: 'json', native: STD },
    gallery: { key: 'slop-gallery.theme', fmt: 'json', native: DARK_CSS },
    '3d': { key: 'slop-3d.theme', fmt: 'json', native: NO_CLASSIC },
    inventory: { key: 'slop-inventory.theme', fmt: 'json', native: NO_CLASSIC },
    vector: { key: 'slopvector.theme', fmt: 'raw', native: STD },
    label: { key: 'sloplabel-theme', fmt: 'raw', native: STD },
    contacts: { key: null, native: DARK_CSS }, convert: { key: null, native: DARK_CSS }, slides: { key: null, native: DARK_CSS }, music: { key: null, native: DARK_CSS },
    /* Their CSS follows the system with data-theme light or dark: without these the page kept the system's look under the
     * chosen theme, so the shared header's buttons (theme colours) were light text on a light bar. */
    resize: { key: null, native: DARK_CSS }, clean: { key: null, native: DARK_CSS }, remix: { key: null, native: DARK_CSS }, hex: { key: null, native: DARK_CSS },
    photoslop: { key: 'slopshop.theme', fmt: 'json', native: { light: 'light', dark: 'pro', classic: 'paint', lime: 'pro' } },
  };

  /* Overrides for the app pages: surface, text and accent only (apps keep their own background and borders). The homepage
   * and Settings take the background and border too. --sl-on-accent is the ink or white that reads on the accent. */
  var CSS = [
    /* The colour tokens of the chosen theme. !important: an app's own palette (some sit in higher-specificity rules, such as
     * a :not() media query) must not win over the theme the person chose. */
    'html:root[data-slop-theme]{--panel:var(--sl-surface)!important;--surface:var(--sl-surface)!important;--fg:var(--sl-text)!important;--text:var(--sl-text)!important;',
    '--accent:var(--sl-accent)!important;--accent-ink:var(--sl-on-accent)!important;--accent-line:var(--sl-accent)!important;',
    '--dim:color-mix(in srgb,var(--sl-text) 78%,transparent)!important;--mute:color-mix(in srgb,var(--sl-text) 78%,transparent)!important;',
    '--faint:color-mix(in srgb,var(--sl-text) 80%,transparent)!important;--fg-faint:color-mix(in srgb,var(--sl-text) 80%,transparent)!important}',
    /* Placeholders: the field's own text colour, faded (the browser's fixed grey is under 3:1 on grey and dark fields).
     * No specificity: an app's own placeholder rule wins. */
    ':where(input,textarea)::placeholder{color:color-mix(in srgb,currentColor 62%,transparent);opacity:1}',
    'html:root[data-slop-theme][data-slop-app=home],html:root[data-slop-theme][data-slop-app=settings]{',
    '--bg:var(--sl-background);--ink-2:var(--sl-surface);--ink-3:var(--sl-surface);',
    '--bone-dim:color-mix(in srgb,var(--sl-text) 62%,transparent);',
    '--bone-faint:color-mix(in srgb,var(--sl-text) 62%,transparent);--line:var(--sl-border)}',
    /* The brand script (brand/brand.js, on the homepage) sets --ink, --bone and --slop inline. !important keeps the chosen theme. */
    'html:root[data-slop-theme][data-slop-app=home],html:root[data-slop-theme][data-slop-app=settings]{',
    '--ink:var(--sl-background) !important;--bone:var(--sl-text) !important;--slop:var(--sl-accent) !important;',
    '--slop-deep:var(--sl-accent) !important}',
    /* Copy written for one tone only: class tone-plain shows in a plain build, tone-playful in a playful one. */
    'html:root:not([data-tone=plain]) .tone-plain,html:root[data-tone=plain] .tone-playful{display:none!important}',
  ].join('');
  var prof = g.SlopProfile && typeof g.SlopProfile.create === 'function'
    ? g.SlopProfile.create({ options: { theme: { mode: { label: 'Theme', type: 'enum', values: [SYSTEM].concat(IDS), default: DEFAULT } } } })
    : null;
  var page = { app: '', choice: DEFAULT }, watching = false;

  function store() { try { return g.localStorage || null; } catch (e) { return null; } }
  function prefersLight() { try { return !!(g.matchMedia && g.matchMedia('(prefers-color-scheme: light)').matches); } catch (e) { return false; } }
  function resolve(choice) {
    if (choice === SYSTEM) return prefersLight() ? 'light' : 'dark';
    return byId[choice] ? choice : 'dark';
  }
  function native(entry, id) { return entry.identity ? id : entry.native[id]; }
  /** The shared choice that an app's native value stands for ('system' for the System choice, null if unknown). */
  function fromNative(entry, v) {
    if (v === SYSTEM) return SYSTEM;
    for (var i = 0; i < IDS.length; i++) if (entry.native[IDS[i]] === v) return IDS[i];
    return null;
  }
  function legacyRead(e) {
    var s = store();
    if (!s || !e.key) return null;
    try {
      var raw = s.getItem(e.key);
      if (raw === null) return null;
      if (e.fmt === 'raw') return raw;
      var v = JSON.parse(raw);
      return e.fmt === 'prefs' ? (v && typeof v === 'object' ? v.theme : null) : v;
    } catch (err) { return null; }
  }
  function legacyWrite(e, value) {
    var s = store();
    if (!s || !e.key) return;
    try {
      if (e.fmt === 'raw') { s.setItem(e.key, value); return; }
      if (e.fmt === 'prefs') {
        var o = JSON.parse(s.getItem(e.key) || 'null');
        o = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
        o.theme = value;
        s.setItem(e.key, JSON.stringify(o));
        return;
      }
      s.setItem(e.key, JSON.stringify(value));
    } catch (err) { /* blocked or full: the app keeps its own value */ }
  }

  /** The stored choice: the profile's, else the first app key the person set, else the default. */
  function current() {
    var o = prof ? prof.overrides('theme') : {};
    if (o.mode !== undefined) return o.mode;
    for (var app in APPS) {
      var e = APPS[app];
      if (!e.key) continue;
      var c = fromNative(e, legacyRead(e));
      if (c) return c;
    }
    return DEFAULT;
  }
  /** The choice for one page: the app's own key wins only where it differs from the stored choice. */
  function choiceFor(app) {
    var choice = current(), e = APPS[app];
    if (e && e.key) {
      var pv = legacyRead(e), pick = fromNative(e, pv);
      if (pick && pick !== SYSTEM && native(e, resolve(choice)) !== pv) choice = pick;
    }
    return choice;
  }
  function onColor(hex) {
    var n = parseInt(hex.slice(1), 16);
    var lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return lum > 0.6 ? '#0a0a0a' : '#ffffff';
  }
  /** The theme whose colours a page is painted with. An app whose own look is dark (its native value maps back to a dark
   * theme) takes the dark colours where the choice is light, so Classic 98 never puts light surfaces under its dark text. */
  function tokenTheme(e, id) {
    if (!e || e.identity) return byId[id];
    var back = fromNative(e, e.native[id]);
    return back && byId[back] && (byId[back].scheme === 'dark') !== (byId[id].scheme === 'dark') ? byId[back] : byId[id];
  }

  /** Paints a choice on this page: data-theme (for the apps that use it), the --sl-* variables and the colour scheme. */
  function paint(choice) {
    var id = resolve(choice), root = doc && doc.documentElement;
    if (!root) return id;
    var e = APPS[page.app], t = tokenTheme(e, id);
    root.setAttribute('data-slop-theme', id);
    if (e) root.setAttribute('data-theme', native(e, id));
    var tk = t.tokens;
    root.style.setProperty('--sl-background', tk.background);
    root.style.setProperty('--sl-surface', tk.surface);
    root.style.setProperty('--sl-text', tk.text);
    root.style.setProperty('--sl-accent', tk.accent);
    root.style.setProperty('--sl-border', tk.border);
    root.style.setProperty('--sl-on-accent', onColor(tk.accent));
    // secondary text and the error red, both 4.5:1 or more on the theme's surfaces (the red leans to the text colour)
    var muted = 'color-mix(in srgb, ' + tk.text + ' 72%, transparent)';
    root.style.setProperty('--sl-muted', muted);
    root.style.setProperty('--sl-text-muted', muted);
    root.style.setProperty('--sl-danger', 'color-mix(in srgb, #e5484d 60%, ' + tk.text + ')');
    root.style.colorScheme = t.scheme;
    return id;
  }
  function refresh() { page.choice = choiceFor(page.app); return paint(page.choice); }
  /** Paints a theme id or 'system' on this page without saving it. With no argument, paints the stored choice for this page. */
  function apply(choice) {
    if (choice === undefined) return refresh();
    if (choice !== SYSTEM && !byId[choice]) return resolve(SYSTEM);
    page.choice = choice;
    return paint(choice);
  }

  /** Follows the operating system while the choice is System. */
  function watch() {
    if (watching || !g.matchMedia) return;
    watching = true;
    try {
      var mq = g.matchMedia('(prefers-color-scheme: light)');
      var on = function () { if (page.choice === SYSTEM) paint(page.choice); };
      if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    } catch (e) { /* no media queries: stays on its first resolution */ }
  }
  /** Saves a choice (a theme id or 'system'), mirrors it into each app's key and applies it here. */
  function set(choice) {
    if (choice !== SYSTEM && !byId[choice]) return { ok: false, error: tx('ui.theme.not_listed') };
    if (!prof) return { ok: false, error: tx('ui.theme.no_storage') };
    var r = prof.set('theme', 'mode', choice);
    if (!r.ok) return r;
    for (var app in APPS) {
      var e = APPS[app];
      if (e.key) legacyWrite(e, choice === SYSTEM ? SYSTEM : e.native[choice]);
    }
    var id = refresh();
    try { if (g.dispatchEvent && g.CustomEvent) g.dispatchEvent(new g.CustomEvent('slop-theme', { detail: { choice: choice, id: id } })); } catch (err) { /* older browser */ }
    return { ok: true, id: id };
  }

  /** An app whose key is missing gets the explicit choice mirrored into it, so the app's own boot code (which reads its key)
   * agrees with the choice. Only missing keys are written; System and a person who never chose are left alone. */
  function mirrorMissing() {
    var o = prof ? prof.overrides('theme') : {};
    if (o.mode === undefined || o.mode === SYSTEM) return;
    for (var app in APPS) {
      var e = APPS[app];
      if (e.key && legacyRead(e) === null) legacyWrite(e, e.native[o.mode]);
    }
  }

  /** style/tone.css: written by the parser while the head loads (it blocks the first paint like any stylesheet, so nothing
   * jumps), or appended when the page has already loaded. */
  function toneSheet(self) {
    if (!self || !self.src || doc.getElementById('slop-tone-css')) return;
    var href = new URL('../../style/tone.css', self.src).href;
    if (doc.readyState === 'loading' && !self.async && !self.defer && doc.write) return doc.write('<link id="slop-tone-css" rel="style' + 'sheet" href="' + href + '">');   // split: the offline bundler looks for stylesheet links
    var l = doc.createElement('link'); l.rel = 'stylesheet'; l.id = 'slop-tone-css'; l.href = href; doc.head.appendChild(l);
  }

  /** Runs at first paint from the page's <head>. */
  function load() {
    var self = doc && doc.currentScript;
    page.app = (self && self.getAttribute('data-app')) || '';
    if (doc && doc.head && !doc.getElementById('slop-theme-style')) {
      var s = doc.createElement('style');
      s.id = 'slop-theme-style';
      s.textContent = CSS;
      doc.head.appendChild(s);
    }
    var root = doc && doc.documentElement;
    if (root) {
      root.setAttribute('data-slop-app', page.app);
      root.setAttribute('data-tone', TONE); root.setAttribute('data-naming', NAMING); root.setAttribute('data-media', MEDIA ? 'on' : 'off');
      if (TONE === 'plain') toneSheet(self);
    }
    // ?fresh on any page loads the newest release (SlopPWA.refresh in shared/pwa.js, which runs it on load when the address has ?fresh)
    try {
      if (self && self.src && !g.SlopPWA && new URLSearchParams(g.location.search).has('fresh')) {
        var pwa = doc.createElement('script');
        pwa.src = new URL('../pwa.js', self.src).href;
        doc.head.appendChild(pwa);
      }
    } catch (e) { /* no URL support: ?fresh is ignored */ }
    mirrorMissing();
    refresh();
    watch();
    try {
      g.addEventListener && g.addEventListener('storage', function (ev) { if (!ev.key || ev.key.indexOf('slop') === 0) refresh(); });
    } catch (e) { /* no storage events */ }
  }

  g.SlopTheme = Object.freeze({
    THEMES: THEMES,
    tone: TONE,
    naming: NAMING,
    SYSTEM: SYSTEM,
    DEFAULT: DEFAULT,
    get: current,
    has: function (id) { return !!byId[id === 'pro' ? 'dark' : id]; },   // offered here ('pro': an app's Dark); app menus skip others
    resolve: resolve,
    set: set,
    apply: apply,
    load: load,
    appKeys: function () { return Object.keys(APPS).filter(function (a) { return APPS[a].key; }); },
  });
  load();
})(typeof window !== 'undefined' ? window : globalThis);
