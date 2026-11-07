/* SlopTyping: the one answer to "is the person typing in a field, and does this key belong to the field?" Every keyboard
 * shortcut handler asks it (shared/commands, shared/nav, the apps' own key handlers), so no app or global shortcut ever
 * takes a key from an input, a textarea or a contenteditable: not in the app, not in Slop AI's message box, not in a panel.
 *
 *   SlopTyping.editable(el)    an input that takes text, a textarea, a select or a contenteditable
 *   SlopTyping.target(e)       the element a key event is really for (inside a shadow root too)
 *   SlopTyping.isTyping(x, o)  x: an element or a key event; true when it is (for) an editable. o.controls: any <input>
 *                              counts too (a focused slider or checkbox keeps its arrow keys and Space: shared/nav)
 *   SlopTyping.fieldKey(e)     the key is the field's own: any key without Ctrl/⌘, the editing shortcuts (Ctrl/⌘ + A, C, V, X,
 *                              Z, Y, Backspace, Delete, Insert, arrows, Home, End), and AltGr characters (Ctrl+Alt+@ …)
 *   SlopTyping.yields(e)       isTyping(e) && fieldKey(e): a shortcut handler leaves this key alone. Not in a field marked
 *                              data-slop-keys="app": the hidden textarea an app's own editor types through (Slop Docs,
 *                              Slop Press), whose Undo, Select all and clipboard are the app's commands
 *
 * Loaded by shared/commands/commands.js and shell/shell.js (whichever is first); also a CommonJS module for the node tests.
 * Tests: tests/node/typing.test.mjs, tests/shared/typing-keys.test.html. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && !root.SlopTyping) root.SlopTyping = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const NOT_TEXT = /^(button|checkbox|radio|range|color|file|submit|reset|image|hidden)$/i;
  const EDIT_MOD = /^(a|c|v|x|z|y|backspace|delete|insert|arrowleft|arrowright|arrowup|arrowdown|home|end)$/i;

  function editable(t) {
    if (!t || t.nodeType !== 1) return false;
    if (t.isContentEditable) return true;
    const tag = String(t.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return tag === 'INPUT' && !NOT_TEXT.test(t.type || '');
  }
  function target(e) {
    if (!e) return null;
    const path = typeof e.composedPath === 'function' ? e.composedPath() : null;
    return (path && path.length && path[0].nodeType === 1 ? path[0] : e.target) || null;
  }
  const isKeyEvent = (x) => !!x && typeof x === 'object' && 'key' in x && !('nodeType' in x);
  function isTyping(x, o) {
    const t = isKeyEvent(x) ? target(x) : x;
    return editable(t) || !!(o && o.controls && t && t.nodeType === 1 && String(t.tagName).toUpperCase() === 'INPUT');
  }
  function fieldKey(e) {
    if (!e) return false;
    const ctrl = !!(e.ctrlKey || e.metaKey);
    if (!ctrl) return true;
    if (!e.altKey && EDIT_MOD.test(e.key || '')) return true;   // Ctrl+Alt+Z is a shortcut (Slop Code: line wrap)
    // AltGr arrives as Ctrl+Alt on Windows: a character it types (@, €, {) is the field's
    return !!(e.ctrlKey && e.altKey && !e.metaKey && typeof e.key === 'string' && e.key.length === 1 && !/[a-z]/i.test(e.key));
  }
  const appKeys = (t) => !!(t && t.closest && t.closest('[data-slop-keys="app"]'));
  const yields = (e) => isTyping(e) && fieldKey(e) && !appKeys(target(e));
  return { editable, target, isTyping, fieldKey, yields };
});
