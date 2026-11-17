/* SlopGuard: a gentle reminder that Slopographic keeps everything in this browser.
 * Include on any page with ONE tag:  <script src="(../)shared/guard.js" defer></script>
 *  - Hard reload keys (Ctrl+Shift+R, Ctrl+F5, Shift+F5, Cmd+Shift+R) open a dialog first. A hard reload only clears
 *    the HTTP cache, never IndexedDB or localStorage, so we say so honestly and offer a backup:
 *    [Export backup] [Reload anyway] [Cancel] plus "Don't show this again".
 *  - beforeunload asks before leaving only while an app reports unsaved work:
 *      SlopGuard.setUnsaved('my-doc', true)   …   SlopGuard.setUnsaved('my-doc', false)
 * Loads shared/backup/index.js (and the SlopUI kit when the page lacks it) on demand. Exposes window.SlopGuard. */
(function () {
  'use strict';
  if (window.SlopGuard) return;
  const me = document.currentScript && document.currentScript.src;
  const ROOT = me ? new URL('../', me).href : new URL('/', location.href).href;
  const OFF_KEY = 'slop-guard-off';
  // Words: shared/i18n/ui/<code>/backup3.js (keys ui.guard.*), read when the dialog opens
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* blocked */ } } };
  const enabled = () => store.get(OFF_KEY) !== '1';
  const setEnabled = (on) => store.set(OFF_KEY, on ? null : '1');

  function isHardReload(e) {
    const k = (e.key || '').toLowerCase();
    if (k === 'f5' && (e.ctrlKey || e.shiftKey)) return true;
    return !!(k === 'r' && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey);
  }
  let backupP = null;
  function backup() {
    if (window.SlopBackup) return Promise.resolve(window.SlopBackup);
    if (!backupP) backupP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = new URL('shared/backup/index.js', ROOT).href;
      s.onload = () => res(window.SlopBackup); s.onerror = () => { backupP = null; rej(new Error('Backup is unavailable')); };
      document.head.append(s);
    });
    return backupP;
  }
  function reload() { window.SlopGuard.reload(); }
  let kitP = null;
  /** The SlopUI kit only (used when the backup kit is unavailable). Loaded beside a page's own window.SlopUI. */
  function plainKit() {
    if (window.SlopUI && window.SlopUI.confirm) return Promise.resolve(window.SlopUI);
    if (!kitP) kitP = new Promise((res, rej) => {
      const prev = window.SlopUI;
      window.SlopUI = undefined;
      const s = document.createElement('script'); s.src = new URL('shared/slopui.js', ROOT).href;
      s.onload = () => { const k = window.SlopUI; window.SlopUI = prev; res(k); };
      s.onerror = () => { window.SlopUI = prev; kitP = null; rej(new Error('SlopUI is unavailable')); };
      document.head.append(s);
    });
    return kitP;
  }

  let showing = null;
  /** Show the dialog. Resolves with 'export' | 'reload' | 'cancel' (after the dialog closes). */
  function show() {
    if (showing) return showing;
    const run = (async () => {
      let B, UI;
      try { B = await backup(); UI = await B.kit(); } catch (e) {
        // The backup kit did not load: ask with the plain SlopUI dialog instead of a browser prompt.
        let U = null;
        try { U = await plainKit(); } catch (err) { return 'cancel'; }
        const ok = await U.confirm(tr('ui.guard.title'), tr('ui.guard.msg_reload'), tr('ui.guard.reload_now'), { cancel: tr('menu.cancel') });
        if (ok) { reload(); return 'reload'; }
        return 'cancel';
      }
      return new Promise((resolve) => {
        const el = UI.el, never = UI.check(tr('ui.guard.never'), false);
        const status = el('p', { class: 'sui-p slop-guard-status', role: 'status' });
        let result = 'cancel';
        const remember = () => { if (never.input.checked) setEnabled(false); };
        const d = UI.dialog({ title: tr('ui.guard.title'), cls: 'slop-guard',
          body: el('div', null, el('p', { class: 'sui-p' }, tr('ui.guard.msg')), status, never.el),
          buttons: [
            { label: tr('ui.guard.export'), primary: true, act: async () => {
              result = 'export'; status.textContent = tr('ui.guard.preparing');
              try { const r = await B.exportNow({ onProgress: (t) => { status.textContent = t; } }); status.textContent = tr('ui.guard.saved', { name: r.name }); }
              catch (e) { status.textContent = tr('ui.backup.export_failed', { err: e.message }); }
              return false;
            } },
            { label: tr('ui.guard.reload_anyway'), act: () => { result = 'reload'; remember(); setTimeout(reload, 0); } },
            { label: tr('menu.cancel'), act: () => { result = result === 'export' ? 'export' : 'cancel'; remember(); } },
          ],
          onClose: () => { remember(); showing = null; resolve(result); } });
        d.box.dataset.guard = '1';
      });
    })();
    // Clear the flag however the dialog ends (the fallback path never reached onClose before).
    showing = run.finally(() => { showing = null; });
    return showing;
  }
  addEventListener('keydown', (e) => {
    if (!isHardReload(e) || !enabled()) return;
    e.preventDefault(); e.stopPropagation();
    show();
  }, true);

  /* ---------- unsaved work ---------- */
  const unsaved = new Set();
  function setUnsaved(key, dirty = true) { if (dirty) unsaved.add(String(key)); else unsaved.delete(String(key)); }
  const hasUnsaved = () => unsaved.size > 0;
  addEventListener('beforeunload', (e) => {
    if (!unsaved.size) return;
    e.preventDefault(); e.returnValue = '';
    return '';
  });

  window.SlopGuard = { show, isHardReload, enabled, setEnabled, setUnsaved, hasUnsaved, get MSG() { return tr('ui.guard.msg'); }, ROOT, reload: () => location.reload() };
})();
