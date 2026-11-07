/* Slop AI — ui/view-state: coming back to Slop AI reopens the chat you had open, with the text you had typed but not
 * sent. The tab is already kept in the prefs (shell.js); the chats themselves are in IndexedDB (core/store.js). The
 * place is kept in SlopSession. Classic script; adds AI.restoreChatPlace(), called by app/main.js at boot. */
(function (AI) {
  'use strict';
  const APP = 'ai';
  let ready = false; // nothing is saved until the saved chat has been reopened
  const chatOf = () => AI.chat || null;
  const auto = window.SlopSession.autosave(APP, 'place', function () {
    const c = chatOf();
    return { conv: c && c.conv ? c.conv.id : null, draft: c && c.input ? c.input.value : '' };
  }, { delay: 400 });
  const touch = function () { if (ready) auto.touch(); };
  ['pointerup', 'keyup', 'click', 'input'].forEach(function (t) { document.addEventListener(t, touch, true); });

  /** Boot, after the tabs are set and before a Slop Drive launch is consumed: reopen the chat and its unsent text. */
  AI.restoreChatPlace = async function () {
    const p = await window.SlopSession.load(APP, 'place', null).catch(function () { return null; });
    if (p && typeof p === 'object') {
      if (p.conv != null && AI.openConv) await AI.openConv(p.conv).catch(function () { /* the chat was deleted */ });
      const c = chatOf();
      if (c && c.input && typeof p.draft === 'string' && p.draft && !c.input.value) {
        c.input.value = p.draft;
        if (c.grow) c.grow();
      }
    }
    ready = true;
  };
})(window.AI);
