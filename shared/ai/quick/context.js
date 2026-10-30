/* Slop AI quick prompts, the context: what the ready-made prompts fill in by themselves (quick/engine.js). Classic
 * script, loaded with the panel's kit; adds SlopAIKit.quickContext.
 *   now(P) → { app, lang, selection, …the app's own } at once, no round trip:
 *     app        the app's name (P.appName())
 *     lang       the language the page is in, by name in that language
 *     selection  the text selected in the app (a text field's or the page's), kept while the focus is in the panel,
 *                where a click would otherwise lose it; an app's own selection (context.selection) comes first
 *     anything the app reports: SlopCmd.provide({ context: () => ({ document, sheet, range, … }) }), read synchronously
 *     (SlopCmd.context()). A source an app does not report stays unknown (a prompt's `when` counts it as there).
 *   selection() → the remembered page selection; track() starts following it (once). */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  if (K.quickContext) return;
  const PANEL = '.sap, .sap-host, .ssh-panel';
  const inPanel = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return !!(el && el.closest && el.closest(PANEL)); };
  let last = '', on = false;

  /** The selected text outside the panel now, or null when the focus or the selection is in the panel (keep the last). */
  function read() {
    const a = document.activeElement;
    if (a && inPanel(a)) return null;
    if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|url|email)$/i.test(a.type || 'text')))) {
      try { return a.value.slice(a.selectionStart, a.selectionEnd); } catch (e) { return ''; }
    }
    const s = window.getSelection && window.getSelection();
    if (!s || !s.rangeCount) return '';
    if (inPanel(s.anchorNode) || inPanel(s.focusNode)) return null;
    return s.toString();
  }
  function update() { const v = read(); if (v !== null) last = v; }
  function track() {
    if (on) return;
    on = true;
    update();   // what was selected before the panel opened
    document.addEventListener('selectionchange', update);
    document.addEventListener('select', update, true);   // a text field's selection (older engines fire no selectionchange there)
  }
  const selection = () => last;

  /** The app's own context, when it reports one (synchronously; a promise is ignored here). */
  function own() {
    const C = window.SlopCmd;
    try { const v = C && typeof C.context === 'function' ? C.context() : null; return v && typeof v === 'object' && typeof v.then !== 'function' ? v : {}; } catch (e) { return {}; }
  }
  function langName() {
    const I = window.SlopI18n, code = I ? I.get() : 'en';
    try { return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code; } catch (e) { return code; }   // compat-ok: the code itself
  }
  function now(P) {
    track();
    const app = own(), out = Object.assign({}, app, { app: P && P.appName ? P.appName() : '', lang: langName() });
    out.selection = app.selection != null && String(app.selection).trim() ? String(app.selection) : last;
    return out;
  }

  K.quickContext = { now, selection, track, read };
})();
