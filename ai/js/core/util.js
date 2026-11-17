/* Slop AI — core/util: the AI namespace, preferences, formatting and icons. Classic scripts share window.AI. */
'use strict';
window.AI = window.AI || {};
(function (AI) {
  const K = window.SlopAIKit;
  AI.K = K;
  AI.el = (...a) => window.SlopUI.el(...a);
  AI.$ = (id) => document.getElementById(id);
  AI.toast = (m, ms) => window.SlopUI.toast(m, ms);
  /** The app's words (ai/i18n/<code>/*.js, shared/i18n/APPS-HOWTO.md): t(key, vars) when the UI is built, never into a
   * constant. onLang(fn) re-runs fn after a language change, once the new tables are in (for UI built once). */
  AI.t = (key, vars) => { const I = window.SlopI18n; return I ? I.t(key, vars) : key; };
  AI.onLang = (fn) => { const I = window.SlopI18n; return I && I.on ? I.on(fn) : () => {}; };
  /** A chat or mini-app still has its starting title (in English or in the language it was made in). */
  /** A number with one decimal, in the page's language (12.5 tok/s). */
  AI.num1 = (x) => { const I = window.SlopI18n; return I && I.num ? I.num(+x, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : (+x).toFixed(1); };
  AI.isBlankTitle = (t) => /^New (chat|mini-app)$/.test(t) || t === AI.t('ai.chat.new') || t === AI.t('ai.build.new');
  const PREF = 'slop-ai.prefs';
  const load = () => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch (e) { return {}; } };
  /** Persistent preferences: defaultModel, temperature, maxTokens, persona, tools, tab, theme, engine. */
  AI.prefs = Object.assign({ defaultModel: null, temperature: 0.7, maxTokens: 1024, persona: 'helper', tools: false, tab: 'chat', sideOpen: true }, load());
  AI.savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(AI.prefs)); } catch (e) { /* blocked */ } };
  /** ?engine=fake (or prefs.engine = 'fake') swaps WebLLM for the canned fake engine: development and tests. */
  AI.engineKind = () => new URLSearchParams(location.search).get('engine') || AI.prefs.engine || 'webllm';

  AI.fmtMB = (mb) => (mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB');
  AI.fmtBytes = (n) => (n == null ? '—' : n < 1048576 ? Math.round(n / 1024) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB');
  AI.fmtTime = (t) => {
    const d = new Date(t), now = new Date();
    const o = d.toDateString() === now.toDateString() ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' }, I = window.SlopI18n;
    return I && I.date ? I.date(d, o) : d.toLocaleString([], o);
  };
  AI.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  AI.isMobile = () => matchMedia('(max-width: 760px)').matches;
  AI.debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  AI.slug = (s) => String(s || 'chat').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'chat';

  const P = {
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    build: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    models: '<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M8 7h.5M8 17h.5"/>',
    sys: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    send: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
    redo: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    clip: '<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7L9.2 17.2a1.7 1.7 0 0 1-2.4-2.4L14.5 7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    theme: '<path d="M12 3a9 9 0 1 0 9 9c0-.8-.7-1.3-1.5-1.1A5 5 0 0 1 13.1 4.5C13.3 3.7 12.8 3 12 3z"/>',
    cmd: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
    spark: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M19 15c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5z"/>',
    download: '<path d="M12 4v12m0 0-4-4m4 4 4-4"/><path d="M4 16v4h16v-4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/>',
    drive: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    play: '<path d="M7 5v14l12-7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 11 15.7 7M8.3 13l7.4 4"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  };
  AI.icon = (name, cls = 'ic') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); s.innerHTML = P[name] || P.spark; return s; };
  AI.ICONS = P;
  /** A tiny event bus inside the app: AI.on('engine' | 'convs' | 'tab', fn), AI.emit(evt, data). */
  const bus = new Map();
  AI.on = (e, fn) => { if (!bus.has(e)) bus.set(e, new Set()); bus.get(e).add(fn); return () => bus.get(e).delete(fn); };
  AI.emit = (e, d) => (bus.get(e) || []).forEach((fn) => { try { fn(d); } catch (err) { console.error(err); } });
})(window.AI);
