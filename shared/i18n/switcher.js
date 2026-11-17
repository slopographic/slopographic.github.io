/* SlopLangSwitch: the language button of the shared header (shell/header.js puts it in every app's header and in the
 * homepage's). A globe and the current language's short code ("EN", "SV"; the icon alone when the header is full, see
 * shared/ui/hbtn.js); a click, Enter, Space or ArrowDown opens a menu (SlopMenuButton, shared/ui/menubutton.js, loaded on
 * the first open) of every language in SlopI18n's list (LANGS; a type-to-filter box above SEARCH_FROM of them), each in its own name, the current one checked. A choice goes
 * through SlopI18n.set, the same setter as the picker in Settings (settings/language.js), so it is stored per device in
 * the profile, sets lang and dir on <html> and retranslates the page at once, with no reload. In a full header it is the
 * first button to give way (data-hbtn-yield="0", shared/ui/hbtn.js): its label, then itself; then the More menu (on a
 * phone) or the Theme menu (shell/header.js) offers it, and its menu opens under whichever is shown.
 *   SlopLangSwitch.button()    the header button (null without SlopI18n)
 *   SlopLangSwitch.items(I)    the menu rows for an i18n instance: [{ value, label, lang, dir, checked }]
 *   SlopLangSwitch.short(code) the button's text for a code: 'pt-BR' -> 'PT'
 *   SlopLangSwitch.search(I)   whether the menu has a filter box (more than SEARCH_FROM languages)
 *   SlopLangSwitch.pick(I, c, doc, loc)  chooses a language through I.set; returns its result. On a page in one language
 *                              (<html data-lang-page>, a static SEO page) it then goes to the same page in the language
 *                              picked, its <link rel="alternate" hreflang>, when there is one (shared/seo/HANDOFF.md)
 * Classic script. Needs shared/i18n/i18n.js. See shared/i18n/HANDOFF.md. */
(function (g) {
  'use strict';
  if (g.SlopLangSwitch) return;
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z"/></svg>';
  const SRC = g.document && g.document.currentScript && g.document.currentScript.src;

  const SEARCH_FROM = 10;   // a longer list gets a filter box (by name or code: "sv", "deu", "中文")
  const search = (I) => I.langs().length > SEARCH_FROM;
  const short = (code) => String(code || '').split('-')[0].toUpperCase();
  /** A language's English name, for the filter ("swahili" finds Kiswahili): the entry's own `en` (LANGS), else the browser's. */
  function english(l) {
    if (l.en) return String(l.en);
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(l.code) || ''; } catch (e) { return ''; }   // compat-ok: no DisplayNames, filter by name and code
  }
  /** The menu rows: every language in the instance's list, in list order, by its own name; the chosen one checked, and a
   *  "beta" tag on an entry marked quality: 'beta' (none in the iPhone/iPad app: shared/native-app.js, App Review 2.2). */
  function items(I) {
    const now = I.get(), store = !!(g.SlopNative && g.SlopNative.isStoreApp && g.SlopNative.isStoreApp());
    const beta = store ? '' : I.t('shell.beta');
    return I.langs().map((l) => ({ value: l.code, label: l.name, lang: l.code, dir: l.dir, keywords: [l.code, english(l)].filter(Boolean),
      checked: l.code === now, tag: l.quality === 'beta' && !store ? (beta === 'shell.beta' ? 'beta' : beta) : '' }));
  }
  /** Chooses a language with the one setter (SlopI18n.set): stored, applied and announced ('slop-lang') there. */
  function pick(I, code, doc = g.document, loc = g.location) {
    const r = I.set(code), el = doc && doc.documentElement;
    if (!r.ok || !el || !el.hasAttribute('data-lang-page') || el.getAttribute('data-lang-page') === code) return r;
    const alt = [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].find((l) => l.getAttribute('hreflang') === code);
    if (alt && loc) { const u = new URL(alt.getAttribute('href'), loc.href); r.go = u.pathname + loc.search + loc.hash; loc.assign(r.go); }
    return r;
  }
  const nameOf = (I, code) => (I.langs().find((l) => l.code === code) || {}).name || code;

  let mbP = null;
  /** shared/ui/menubutton.js, loaded the first time the menu opens (none of it before the page's first paint). */
  function menuButton() {
    if (g.SlopMenuButton) return Promise.resolve(g.SlopMenuButton);
    if (!mbP) mbP = new Promise((res) => {
      const s = g.document.createElement('script');
      s.src = new URL('../ui/menubutton.js', SRC || g.location.href).href;
      s.onload = s.onerror = () => { if (!g.SlopMenuButton) mbP = null; res(g.SlopMenuButton || null); };
      g.document.head.append(s);
    });
    return mbP;
  }

  function button() {
    const I = g.SlopI18n, doc = g.document;
    if (!I || !doc) return null;
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'sh-hbtn slop-hbtn sh-lang';
    b.dataset.hbtnYield = '0';   // gives way first in a full header (shared/ui/hbtn.js)
    b.setAttribute('aria-haspopup', 'menu');
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = ICON + '<span class="slop-hbtn-txt"></span>';
    const txt = b.lastChild;
    function render() {
      const code = I.get(), label = I.t('shell.language_now', { name: nameOf(I, code) });
      txt.textContent = short(code);
      txt.lang = code;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.dataset.hbtnLabel = label;   // its row in the header's More menu when it is folded there (shared/ui/hbtn.js)
    }
    render();
    let mb = null;
    /** Where the menu opens: under the button, or under More while the button is folded into it. */
    const at = (n) => (g.SlopHbtn && g.SlopHbtn.anchor ? g.SlopHbtn.anchor(n) : n);
    const shown = (n) => !!n && n.getBoundingClientRect().width > 0;
    const anchor = () => { const a = at(b); if (shown(a)) return a; const t = doc.querySelector('.sh-theme'); return t && shown(at(t)) ? at(t) : a; };
    function attach(M) {
      mb = M.attach(b, {
        label: I.t('shell.language'), search: search(I), anchor,
        items: () => items(I),
        onPick: (code) => { const r = pick(I, code); if (!r.ok && g.SlopUI && g.SlopUI.toast) g.SlopUI.toast(r.error); },
      });
      // each row in its own language, for screen readers and the right font (SlopMenuButton builds the rows on open)
      b.addEventListener('click', mark);
      b.addEventListener('keydown', () => setTimeout(mark, 0));
    }
    function mark() {
      const m = mb && mb.menu;
      if (!m) return;
      m.setAttribute('aria-label', I.t('shell.language'));
      for (const r of m.querySelectorAll('.smb-row')) {
        const l = I.langs().find((x) => x.code === r.dataset.value);
        if (l) { r.lang = l.code; r.dir = l.dir; const tg = r.querySelector('.smb-tag'); if (tg) tg.lang = I.get(); }
      }
    }
    // the first open loads the menu script, then opens it; later ones are SlopMenuButton's own
    const first = (e) => {
      if (mb) return;
      e.preventDefault();
      b.removeEventListener('click', first);
      menuButton().then((M) => { if (!M) return; attach(M); mb.open(); mark(); });
    };
    if (g.SlopMenuButton) attach(g.SlopMenuButton);
    else { b.addEventListener('click', first); b.addEventListener('keydown', (e) => { if (!mb && e.key === 'ArrowDown') first(e); }); }
    g.addEventListener('slop-lang', render);
    g.addEventListener('slopi18n', render);   // the chosen language's tables are in (they load lazily): its label now
    g.addEventListener('storage', (ev) => { if (!ev.key || ev.key === 'slop-profile') render(); });   // chosen in another tab
    return b;
  }

  g.SlopLangSwitch = { button, items, short, pick, search, english, SEARCH_FROM };
})(typeof window !== 'undefined' ? window : globalThis);
