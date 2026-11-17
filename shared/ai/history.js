/* Slop AI message history: Up and Down in the message box recall what was sent before, as in the Claude Code CLI.
 * One list for every app on this device (localStorage 'slop-ai.history', the last 100, a repeat of the last one is not
 * kept twice). Classic script and CommonJS module; sets window.SlopAIKit.history.
 *
 *   history.add(text)                  remembers a sent message
 *   history.list()                     oldest first
 *   history.clear()
 *   history.cursor(get, set)           → { up(), down(), reset() } for one message box: get() the box's text now, set(text)
 *       up(): the message before (from the draft, the newest); false when there is none. The draft being typed is kept
 *       and comes back after the newest on down(). down(): false when already on the draft. Typing (reset) starts over.
 *   history.atEdge(el, dir)            the caret is on the box's first line (dir 'up') or last line ('down'), nothing
 *                                      selected: only then do the arrows recall, so they still move between lines
 * Tests: tests/node/ai-history.test.mjs, tests/ai/composer.test.html. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { const K = (root.SlopAIKit = root.SlopAIKit || {}); K.history = K.history || api; }
})(typeof window !== 'undefined' ? window : globalThis, function (g) {
  'use strict';
  const KEY = 'slop-ai.history', MAX = 100;
  let memory = [];   // storage blocked (a private window): this page only
  const store = () => { try { return g.localStorage || null; } catch (e) { return null; } };
  function list() {
    const s = store();
    if (!s) return memory.slice();
    try { const v = JSON.parse(s.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch (e) { return memory.slice(); }
  }
  function save(items) {
    memory = items.slice(-MAX);
    const s = store();
    if (s) try { s.setItem(KEY, JSON.stringify(memory)); } catch (e) { /* full or blocked: memory only */ }
  }
  function add(text) {
    const t = String(text == null ? '' : text);
    if (!t.trim()) return;
    const items = list();
    if (items[items.length - 1] === t) return;
    items.push(t);
    save(items);
  }
  const clear = () => save([]);

  function cursor(get, set) {
    let at = -1, draft = '', items = null;   // at: -1 is the draft; 0 the newest message, 1 the one before…
    const show = (i) => { at = i; set(i < 0 ? draft : items[items.length - 1 - i]); return true; };
    return {
      up() {
        if (at < 0) { items = list(); draft = get(); }
        if (!items || at + 1 >= items.length) return false;
        return show(at + 1);
      },
      down() { return at < 0 ? false : show(at - 1); },
      reset() { at = -1; items = null; },
      get index() { return at; },
    };
  }
  function atEdge(el, dir) {
    if (!el || el.selectionStart !== el.selectionEnd) return false;
    const v = el.value || '', i = el.selectionStart;
    return dir === 'up' ? i === 0 || v.lastIndexOf('\n', i - 1) < 0 : v.indexOf('\n', i) < 0;
  }
  return { KEY, MAX, add, list, clear, cursor, atEdge };
});
