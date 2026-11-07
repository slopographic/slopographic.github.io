/* Slop AI — app/main: boot. */
'use strict';
(function (AI) {
  const E = AI.E;
  async function boot() {
    AI.initShell();
    AI.initChat();
    AI.initBuilder();
    AI.initSloppo();
    AI.wireCommands();
    AI.initCtxMenu();
    if (window.SlopWorkspace) SlopWorkspace.mount(AI.$('views'));
    if (window.SlopHub) SlopHub.register('ai');
    E.watchHosts();
    const hash = location.hash.slice(1);
    const preset = AI.tabOf(location.search);   // ?tab=sys from a task page: this visit only, not remembered
    if (AI.TABS.some((t) => t[0] === hash)) AI.setTab(hash);
    else if (preset) AI.setTab(preset, { save: false });
    else AI.setTab(AI.prefs.tab || 'chat');
    addEventListener('hashchange', () => { const h = location.hash.slice(1); if (AI.TABS.some((t) => t[0] === h)) AI.setTab(h); });
    await AI.restoreChatPlace(); // ui/view-state.js: the open chat and its unsent text
    // "Send to Slop AI" from another app: text files become an attachment
    await AI.intake.launch(); // through the intake (ui/intake.js); a picture is refused: the local models read text only
    if (!AI.sys && AI.tab !== 'sys') AI.runCheck({ bench: false });
    // the default model loads by itself only when it is already downloaded (never a surprise download), and only while
    // the site offers it (a model the site hides, shared/ai/makers.js, is no longer in the catalog)
    const def = AI.prefs.defaultModel;
    if (def && E.modelFor(def) && !E.ready() && AI.autoload !== false) {
      const st = await E.status(def).catch(() => null);
      if (st && st.state === 'ready') E.load(def, { skipConsent: true });
    }
    document.body.classList.add('ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.AI);
