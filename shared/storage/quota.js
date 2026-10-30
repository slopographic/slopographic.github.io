/* SlopQuota: how much this site may store in this browser, whether the browser keeps it, and asking it to. The one copy of
 * the navigator.storage calls (Drive, AI, Admin, Settings and shared/pwa.js use it). Classic script and CommonJS (UMD),
 * like shared/fonts/bidi.js, so the Node tests load it with a fake navigator. Every call resolves and never throws.
 *   SlopQuota.estimate()         { supported, usage, quota, percent, persisted, canPersist, folder, browser }
 *                                browser: { engine: 'chromium' | 'firefox' | 'safari' | 'other', name }
 *                                folder: a folder on disk can be connected (showDirectoryPicker: Chrome and Edge)
 *   SlopQuota.persisted()        true | false | null (the browser does not say)
 *   SlopQuota.persistAnswer()    asks the browser now: 'granted' | 'denied' | 'unsupported'
 *   SlopQuota.persist()          the same, as a bool: true when the browser keeps this site's data
 *   SlopQuota.request()          the same answer, asked through SlopPWA.requestPersist when the page has it (recorded)
 *   SlopQuota.askIfBig(bytes)    the first time a visit stores >= BIG bytes (50 MB), asks the browser to keep it (through
 *                                SlopPWA.requestPersist when the page has it, so the answer is recorded). Once per visit,
 *                                never on page load: call it right after a save. Resolves the answer, or null (not asked).
 *   SlopQuota.bytes(n), format(usage, quota)  '3.2 GB', '3.2 GB of 120 GB'
 *   SlopQuota.browser(ua?)       the engine and name of this browser (or of a user-agent string)
 *   SlopQuota.limitText(engine)  the limit of this browser in plain words; folderText(est) what a connected folder gives
 *   SlopQuota.outcome(answer, engine)  plain words for a persist answer
 *   SlopQuota.create({ navigator, i18n })  an independent instance (tests). Text goes through SlopI18n (storage.* keys in
 *                                shared/i18n/strings.js); EN below is the fallback when the page has no SlopI18n. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopQuota = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const BIG = 50 * 1024 * 1024;
  // The same English as shared/i18n/strings.js (tests/node/storage-quota.test.mjs checks they match).
  const EN = {
    'storage.site': 'This site’s storage',
    'storage.of': '{used} of {quota}',
    'storage.unknown': 'The browser does not say how much this site uses.',
    'storage.meter_aria': 'Storage used',
    'storage.kept': 'Kept: the browser will not clear your files to free space.',
    'storage.not_kept': 'Not kept yet: the browser may clear your files when the disk runs low.',
    'storage.keep': 'Keep my files',
    'storage.kept_button': 'Files kept',
    'storage.granted': 'Done. The browser will keep your files and will not clear them to free space.',
    'storage.denied': 'The browser did not promise to keep your files. It may clear them when the disk runs low, so keep a backup.',
    'storage.denied_chromium': 'Not yet. Chrome and Edge decide this on their own, from how you use this site. Your files are stored, but keep a backup.',
    'storage.denied_firefox': 'Not allowed. Firefox asked you and the answer was no, or the question was closed. You can change it in the site permissions.',
    'storage.unsupported': 'This browser cannot promise to keep your files. Keep a backup.',
    'storage.limit_title': 'How much space you get',
    'storage.limit_chromium': 'Chrome and Edge let this site use up to about 60% of your disk. Until the browser agrees to keep your files, it may clear them when the disk runs low.',
    'storage.limit_firefox': 'Firefox lets this site use 10% of your disk or 10 GB, whichever is smaller. When you allow it to keep your files, the limit rises to up to 50% of the disk (at most 8 TB). Firefox asks you first.',
    'storage.limit_safari': 'Safari lets browser apps use up to about 60% of your disk.',
    'storage.limit_other': 'Your browser sets how much this site may store. Ask it to keep your files, so it does not clear them when the disk runs low.',
    'storage.folder': 'For space with no browser limit, connect a folder on your disk in Slop Drive. Files there are limited only by your disk.',
    'storage.folder_button': 'Connect a folder in Slop Drive',
    'storage.folder_needs': 'A connected folder has no browser limit, but it needs Chrome or Edge on a computer. In this browser your files stay in browser storage.',
  };

  function create(opts) {
    opts = opts || {};
    const nav = () => opts.navigator || root.navigator || {};
    const store = () => nav().storage || null;
    const scope = () => opts.window || root;
    let asked = null;           // this visit's askIfBig promise: set once, so a visit asks at most once

    function t(key, vars) {
      const I = opts.i18n !== undefined ? opts.i18n : root.SlopI18n;
      let s = I && I.t ? I.t(key, vars) : key;
      if (s === key) s = (EN[key] || key).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
      return s;
    }
    const quiet = (fn, fallback) => { try { return Promise.resolve(fn()).catch(() => fallback); } catch (e) { return Promise.resolve(fallback); } };

    /** The engine decides the limit. Every browser on iOS is Safari's engine. */
    function browser(ua) {
      const n = nav();
      ua = ua != null ? String(ua) : String(n.userAgent || '');
      if (/iPhone|iPad|iPod/.test(ua)) return { engine: 'safari', name: 'Safari' };   // i18n-ignore: browser names
      if (/Firefox\//.test(ua)) return { engine: 'firefox', name: 'Firefox' };   // i18n-ignore: browser names
      if (/Edg\//.test(ua)) return { engine: 'chromium', name: 'Edge' };   // i18n-ignore: browser names
      if (/OPR\//.test(ua)) return { engine: 'chromium', name: 'Opera' };   // i18n-ignore: browser names
      if (/Chrome\/|Chromium\//.test(ua)) return { engine: 'chromium', name: 'Chrome' };   // i18n-ignore: browser names
      if (/Safari\//.test(ua)) return { engine: 'safari', name: 'Safari' };   // i18n-ignore: browser names
      return { engine: 'other', name: '' };
    }
    function persisted() {
      const s = store();
      if (!s || !s.persisted) return Promise.resolve(null);
      return quiet(() => s.persisted().then((v) => !!v), null);
    }
    function persistAnswer() {
      const s = store();
      if (!s || !s.persist) return Promise.resolve('unsupported');
      return quiet(() => s.persist().then((ok) => (ok ? 'granted' : 'denied')), 'denied');
    }
    const persist = () => persistAnswer().then((a) => a === 'granted');

    async function estimate() {
      const s = store(), out = { supported: !!(s && s.estimate), usage: null, quota: null, percent: 0, persisted: null };
      if (out.supported) {
        const e = await quiet(() => s.estimate(), null);
        if (e) { out.usage = typeof e.usage === 'number' ? e.usage : null; out.quota = typeof e.quota === 'number' ? e.quota : null; }
      }
      out.percent = out.usage != null && out.quota ? Math.min(100, (out.usage / out.quota) * 100) : 0;
      out.persisted = await persisted();
      out.canPersist = !!(s && s.persist);
      out.folder = typeof scope().showDirectoryPicker === 'function';
      out.browser = browser();
      return out;
    }

    /** Asks through SlopPWA when the page has it (it records the answer and tells its listeners), else directly. */
    function request() {
      const P = scope().SlopPWA;
      return P && P.requestPersist ? quiet(() => P.requestPersist(), 'denied') : persistAnswer();
    }
    function askIfBig(bytes) {
      if (asked || !(bytes >= BIG)) return asked || Promise.resolve(null);
      asked = persisted().then((kept) => (kept ? 'granted' : request()));
      return asked;
    }

    function bytes(n) {
      if (n == null || !isFinite(n)) return 'unknown';
      const u = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0, v = n;
      while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
      return (i === 0 ? String(Math.round(v)) : v.toFixed(v < 10 ? 1 : 0)) + ' ' + u[i];
    }
    const format = (usage, quota, fmt) => { const f = fmt || bytes; return t('storage.of', { used: f(usage), quota: f(quota) }); };
    const limitText = (engine) => t('storage.limit_' + (['chromium', 'firefox', 'safari'].indexOf(engine) >= 0 ? engine : 'other'));
    const folderText = (est) => t(est && est.folder ? 'storage.folder' : 'storage.folder_needs');
    function outcome(answer, engine) {
      if (answer === 'granted') return t('storage.granted');
      if (answer === 'unsupported') return t('storage.unsupported');
      return t(engine === 'chromium' ? 'storage.denied_chromium' : engine === 'firefox' ? 'storage.denied_firefox' : 'storage.denied');
    }

    return { BIG, EN, create, t, browser, estimate, persisted, persist, persistAnswer, request, askIfBig, bytes, format, limitText, folderText, outcome };
  }
  return create();
});
