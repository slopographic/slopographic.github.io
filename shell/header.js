/* SlopHeader: adds the shell's buttons to the page header: AI (the Slop AI panel, loaded on click), the language menu
 * (shared/i18n/switcher.js), the theme menu (every page, from SlopTheme), "Apps" (opens
 * the switcher), the notifications bell, Tutorial (the app's YouTube tutorial, when the registry has one), and on a
 * single-app site "More free tools", the link to its suite (shared/parent/parent.js). Goes at the end of header.topbar, header.menubar or header.nav, or floats at the
 * top right when the page has no header. Loaded and mounted by shell/shell.js, which applies the language after.
 * The Apps text and the button's aria-label are marked for SlopI18n; the title is set here (it carries the shortcut). */
(function () {
  'use strict';
  if (window.SlopHeader) return;
  const ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
  const ICON_THEME = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>';
  const ICON_CONVERT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/></svg>';
  const ICON_AI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>';
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  let sw = null;

  /** The button's title in the chosen language: "Switch app (Ctrl+Space)". English when SlopI18n is not on the page. */
  function title() {
    const shortcut = (isMac ? '⌘' : 'Ctrl') + '+Space';
    const I = window.SlopI18n;
    const s = I ? I.t('shell.switch_title', { shortcut }) : '';
    return s && s !== 'shell.switch_title' ? s : 'Switch app (' + shortcut + ')';
  }

  /** A shared-chrome string in the chosen language (shared/i18n), or the English given when SlopI18n is not on the page. */
  function tr(key, en) { const I = window.SlopI18n, s = I ? I.t(key) : key; return s && s !== key ? s : en; }
  /** A word from the shared tables (strings.js, ui/<code>/shell.js), filled with vars; the key without SlopI18n. */
  const tx = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);
  /** The app's name as the chosen language shows it (shared/apps.js), for {app} in the header's labels. */
  const appName = (app) => (window.slopAppName ? window.slopAppName(app) : app.name);
  /** Marks an element's attributes for SlopI18n (re-applied on a language change) and fills them now. */
  function mark(el, attrs, vars) {
    if (vars) el.setAttribute('data-i18n-vars', JSON.stringify(vars));
    el.setAttribute('data-i18n-attr', Object.keys(attrs).map((a) => a + ':' + attrs[a]).join(';'));
    for (const a in attrs) el.setAttribute(a, tx(attrs[a], vars));
  }

  /** The theme button: a menu of System and every theme in SlopTheme, the current choice checked. None without SlopTheme. */
  function themeButton() {
    const T = window.SlopTheme;
    if (!T || !T.THEMES) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sh-hbtn slop-hbtn sh-theme';
    mark(b, { title: 'shell.theme', 'aria-label': 'shell.theme' });
    b.setAttribute('aria-haspopup', 'menu');
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = ICON_THEME + '<span class="slop-hbtn-txt" data-i18n="shell.theme">Theme</span>';
    b.addEventListener('click', () => {
      if (!window.SlopUI) return;
      const now = T.get();
      const pick = (id) => () => { const r = T.set(id); if (!r.ok && window.SlopUI.toast) window.SlopUI.toast(r.error); };
      const conv = document.querySelector('.sh-convert');   // no room for Convert… in the header: it is the first row here
      const ai = document.querySelector('.sh-ai'), lang = document.querySelector('.sh-lang');
      // the language button gave way in a full header: its menu is a row here (it opens once this menu has closed)
      const langRow = lang && lang.hidden ? [{ label: tx('shell.language_more'), act: () => setTimeout(() => lang.click(), 0) }] : [];
      const items = (ai && ai.hidden ? [{ label: tx('ui.shell.ask_ai'), act: openAI }] : []).concat(conv && conv.hidden ? [{ label: tx('ui.shell.convert_files'), act: openConvert }] : [])
        .concat((ai && ai.hidden) || (conv && conv.hidden) ? ['-'] : [])
        .concat(langRow.length ? langRow.concat(['-']) : [])
        .concat([{ label: tr('shell.theme_system', 'System'), check: now === T.SYSTEM, act: pick(T.SYSTEM) }, '-'])
        .concat(T.THEMES.map((t) => ({ label: t.name, check: now === t.id, act: pick(t.id) })));
      const r = (window.SlopHbtn && window.SlopHbtn.anchor ? window.SlopHbtn.anchor(b) : b).getBoundingClientRect();   // folded into More: under it
      const m = window.SlopUI.menu(items, r.left, r.bottom + 4);
      b.setAttribute('aria-expanded', 'true');
      const done = new MutationObserver(() => { if (!m.isConnected) { b.setAttribute('aria-expanded', 'false'); done.disconnect(); } });
      done.observe(document.body, { childList: true });
    });
    return b;
  }

  /** The app's video tutorial (shared/apps.js `video`): a click plays it in a dialog on the page (shared/ui/video.js,
   *  nothing loads from YouTube before that); a Ctrl/middle click opens YouTube. Null on a page whose app has none. */
  function tutorialLink() {
    const app = window.SlopShell && window.SlopShell.currentApp, v = app && app.video;
    if (!v || !/^[\w-]{6,20}$/.test(v.id)) return null;
    const a = document.createElement('a');
    a.className = 'sh-hbtn slop-hbtn sh-tutorial';
    a.href = 'https://www.youtube.com/watch?v=' + v.id;
    a.target = '_blank'; a.rel = 'noopener';
    a.dataset.slopVideo = v.id;
    mark(a, { title: 'ui.shell.tutorial_tip', 'aria-label': 'ui.shell.tutorial_aria', 'data-slop-video-title': 'ui.shell.tutorial_title' }, { app: appName(app) });
    a.innerHTML = ICON_PLAY;   // an icon only: the app's own controls keep the header's room (title and label say what it is)
    return a;
  }

  /** Convert…: File convert's tool in a dialog (shared/convert/dialog.js), preloaded with what the app has open
   *  (shared/convert/provided.js). The dialog's code loads on the first click, never before. Also "Convert files…" in
   *  the command palette. None on File convert itself, which is the tool. */
  function openConvert() {
    const url = new URL('shared/convert/dialog.js', window.SlopShell.ROOT).href;
    return import(url).then((m) => m.open({})).catch((e) => {
      console.warn(e);
      if (window.SlopUI && window.SlopUI.toast) window.SlopUI.toast(tx('ui.shell.convert_offline'));
    });
  }
  function convertButton() {
    const app = window.SlopShell && window.SlopShell.currentApp;
    if (!app || app.id === 'convert') return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sh-hbtn slop-hbtn sh-convert';
    b.dataset.hbtnYield = '1';   // gives way first when the header is full (shared/ui/hbtn.js), then shows in the Theme and More menus
    mark(b, { 'data-hbtn-label': 'ui.shell.convert_files', title: 'ui.shell.convert_tip', 'aria-label': 'ui.shell.convert_aria' });
    b.setAttribute('aria-haspopup', 'dialog');
    b.innerHTML = ICON_CONVERT + '<span class="slop-hbtn-txt" data-i18n="shell.convert">Convert…</span>';
    b.addEventListener('click', openConvert);
    const C = window.SlopCmd;
    if (C && C.register && C.get && !C.get('shell.convert')) {
      const reg = () => C.register([{ id: 'shell.convert', title: tx('ui.shell.convert_files'), group: 'File', keywords: ['convert', 'export', 'format', 'pdf', 'png', 'docx', 'xlsx'], run: openConvert }]);
      reg();
      if (window.SlopI18n) window.SlopI18n.on(reg);   // the palette's title in the new language
    }
    return b;
  }

  /** AI: the Slop AI side panel (shared/ai/panel.js), loaded on the first click and never before, then opened beside the
   *  app (a bottom sheet on phones). Also "Ask Slop AI…" in the command palette. None on Slop AI itself. */
  let aiP = null;
  function loadAI() {
    return aiP = aiP || new Promise((res, rej) => {
      if (window.SlopAIPanel) return res();
      const s = document.createElement('script'), app = window.SlopShell.currentApp;
      s.src = new URL('shared/ai/panel.js', window.SlopShell.ROOT).href;
      s.dataset.button = 'false'; if (app) s.dataset.app = app.id;
      s.onload = res; s.onerror = () => { aiP = null; rej(new Error(tx('ui.shell.ai_offline'))); };
      document.head.append(s);
    });
  }
  function openAI() { return loadAI().then(() => window.SlopAIPanel.toggle()).catch((e) => { if (window.SlopUI && window.SlopUI.toast) window.SlopUI.toast(e.message); }); }
  /** Slop AI was left open (on any app, this device: panel.js keeps 'slop-ai.open'): it opens again here, beside the app.
   *  Not on a phone, where it is a bottom sheet over the page: there it waits for the AI button. */
  function reopenAI() {
    let on = false; try { on = localStorage.getItem('slop-ai.open') === '1'; } catch (e) { /* storage blocked */ }
    if (!on || (window.matchMedia && matchMedia('(max-width: 640px)').matches)) return;
    loadAI().then(() => { if (!window.SlopAIPanel.isOpen) window.SlopAIPanel.open({ auto: true }); }).catch(() => {});
  }
  function aiButton() {
    const app = window.SlopShell && window.SlopShell.currentApp;
    if (!app || app.id === 'ai') return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sh-hbtn slop-hbtn sh-ai';
    // gives up its label right after Convert… (shared/ui/hbtn.js), but stays as an icon: Theme, the bell, Drive and Apps fold
    // into More (⋯) first; only a header with no room at all puts it in More, with its label
    b.dataset.hbtnYield = '2'; b.dataset.hbtnKeep = '';
    mark(b, { 'data-hbtn-label': 'ui.shell.ask_ai', title: 'ui.shell.ai_tip' }, { app: appName(app) });
    b.setAttribute('aria-label', 'Slop AI');   // the product's name
    b.innerHTML = ICON_AI + '<span class="slop-hbtn-txt" data-i18n="shell.ai">AI</span>';
    b.addEventListener('click', openAI);
    const C = window.SlopCmd;
    if (C && C.register && C.get && !C.get('shell.ai')) {
      const reg = () => C.register([{ id: 'shell.ai', title: tx('ui.shell.ask_ai'), group: 'Help', keywords: ['ai', 'assistant', 'chat', 'llm', 'help'], run: openAI }]);
      reg();
      if (window.SlopI18n) window.SlopI18n.on(reg);
    }
    // a request handed over from another app (shared/ai/handoff.js): open the panel so it continues here
    try { const h = JSON.parse(sessionStorage.getItem('slop-ai.handoff') || 'null'); if (h && h.to === app.id && Date.now() - h.at < 6e5) { setTimeout(openAI, 0); return b; } } catch (e) { /* no storage */ }
    // back from "Sign in with OpenRouter" (shared/ai/cloud/signin.js, a sign-in started in this tab): that script now, so
    // the code leaves the address at once, then the panel, which finishes the sign-in
    try {
      if (sessionStorage.getItem('slop-ai.signin') && /[?&](code|error)=/.test(location.search)) {
        const s = document.createElement('script'); s.src = new URL('shared/ai/cloud/signin.js', window.SlopShell.ROOT).href; document.head.append(s);
        s.onload = s.onerror = () => { if (!window.SlopAIPanel || !window.SlopAIPanel.isOpen) openAI(); };
        return b;
      }
    } catch (e) { /* no storage */ }
    setTimeout(reopenAI, 0);
    return b;
  }

  function mount() {
    if (window.SlopBrand && window.SlopBrand.appMark) window.SlopBrand.appMark(); // the app's icon in the header brand (brand/brand.js)
    const box = document.createElement('div');
    box.className = 'sh-hdr';
    sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'sh-hbtn slop-hbtn sh-switch';
    mark(sw, { 'aria-label': 'shell.switch_app' });
    sw.setAttribute('aria-haspopup', 'dialog');
    sw.title = title();
    sw.innerHTML = ICON_SEARCH + '<span class="sh-hbtn-txt slop-hbtn-txt" data-i18n="nav.apps">Apps</span>';
    sw.addEventListener('click', () => window.SlopSwitcher.toggle());
    const tut = tutorialLink(), theme = themeButton(), conv = convertButton(), ai = aiButton();
    const parent = window.SlopParent ? window.SlopParent.headerLink() : null;   // a single-app site: "More free tools" (shared/parent)
    const lang = window.SlopLangSwitch ? window.SlopLangSwitch.button() : null;   // the language menu (shared/i18n/switcher.js)
    if (ai) box.append(ai);
    if (conv) box.append(conv);
    if (tut) box.append(tut);
    if (lang) box.append(lang);
    if (theme) box.append(theme);
    if (parent) box.append(parent);
    box.append(sw);
    shellBox = box;
    place();
    window.SlopNotify.mountBell(box);
    // Convert… and AI never cost the header a row or the app's controls their room: they give up their labels, Convert… its
    // place, then the other buttons fold into More, AI last (shared/ui/hbtn.js). Measured again now the bell is in.
    const host = box.parentNode;
    if (!box.classList.contains('sh-fab') && window.SlopHbtn) window.SlopHbtn.check(host);
    for (const ev of ['slop-lang', 'slopi18n']) window.addEventListener(ev, () => { sw.title = title(); });   // slopi18n: its tables are in
  }

  /** Puts the buttons in the page's header (or floating at the top right when it has none). Called by mount() and again
   *  by a page header built later (SlopMenuBar.mount, shared/menubar/menubar.js): the shell's scripts load side by side
   *  with the page's, so either can come first (cached scripts make the shell first). Wherever they went before, the
   *  buttons end where mounting after the page header would have put them. Does nothing before mount(). */
  let shellBox = null;
  function place() {
    const box = shellBox;
    if (!box) return;
    const host = document.querySelector('header.topbar, header.menubar, header.nav, header');
    if (host && box.parentNode === host && box.isConnected) return;
    const slot = host && host.querySelector('.sh-hdr-slot');   // room kept for the buttons in the page's own HTML
    box.classList.toggle('sh-fab', !host);
    if (slot) slot.replaceWith(box); else if (host) host.append(box); else document.body.append(box);
    if (host && window.SlopHbtn) { window.SlopHbtn.fit(host); window.SlopHbtn.check(host); }   // labels give way to icons when the header is full
  }

  window.SlopHeader = { mount, place, openConvert, openAI };
})();
