/* SlopAIPermissions: the one place that decides whether an AI action may run without asking, for every assistant on the
 * site: the side panel with a local model or a provider with the person's own key, and (later) agents through WebMCP.
 * Classic script (window.SlopAIPermissions) and a CommonJS module for Node tests. No DOM here: the question itself is
 * permissions-ui.js (prompt), which this file calls through api.prompt so a page or a test can replace it.
 *
 * Kinds of action that ask (anything else, reading or an ordinary edit, never asks):
 *   change  an app change that Undo can take back but that the word rule marks (crop, flatten, merge, replace, new…)
 *   delete  deleting, clearing, closing or overwriting (delete, remove, clear, erase, reset, close, discard, overwrite…)
 *   send    sending a copy of a file or picture to the AI provider (look_at_file). Never covered by "allow app changes".
 *   control running the commands of another app open beside the chat (Slop AI's workspace): asked once per app and
 *          visit; never covered by "allow app changes"
 *   spend-image  making or editing a picture at the person's provider, which costs money (generate_image, edit_image).
 *          Never covered by "allow app changes" either.
 *   kindOf(text) → 'delete' | 'change'   (a command's id and title; send is set by the tool itself)
 * Modes (one per device): 'ask' (default: every action of these kinds asks), 'changes' (app changes run, deleting and
 *   sending ask), 'all' (nothing asks). mode(), setMode(id) (then a 'slopaipermissions' event on window), MODES (label,
 *   short: the panel's mode switch, note, warning).
 * Answers to a question: 'once' · 'request' (this kind in this app until the reply ends) · 'visit' (this kind in this app
 *   until the tab closes, sessionStorage) · 'always' (this kind in this app on this device, a rule) · 'deny'.
 *   rules() → [{ kind, app, appName, added }]   addRule(kind, app, appName)   removeRule(kind, app)
 *   startRequest() / endRequest()     the panel calls them around each request; request grants end with it
 *   decide(kind, app) → { allow, why: 'mode' | 'rule' | 'visit' | 'request' | null }
 *   ask({ kind, app, appName, action, detail, who }) → Promise<bool>: decide, else prompt and remember the answer.
 * Storage: localStorage 'slop-ai.permissions' ({ mode, always }), sessionStorage 'slop-ai.permissions.visit'. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root.SlopAIPermissions) root.SlopAIPermissions = api;   // one object: permissions-ui.js sets its prompt on it
})(typeof window !== 'undefined' ? window : globalThis, function (g) {
  'use strict';
  const KEY = 'slop-ai.permissions', VISIT = 'slop-ai.permissions.visit';
  // the words (shared/i18n/ui/<code>/ai2.js) are read when shown, so a language change shows at once
  const T = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const kind = (id, key) => ({ id, get name() { return T(`ui.ai.perm.kind_${key}`); }, get what() { return T(`ui.ai.perm.kind_${key}_what`); } });
  const KINDS = { change: kind('change', 'change'), delete: kind('delete', 'delete'), send: kind('send', 'send'), control: kind('control', 'control'), 'spend-image': kind('spend-image', 'spend') };
  const MODES = [
    { id: 'ask', get label() { return T('ui.ai.perm.mode_ask'); }, get short() { return T('ui.ai.perm.mode_ask'); }, get note() { return T('ui.ai.perm.mode_ask_note'); } },
    { id: 'changes', get label() { return T('ui.ai.perm.mode_changes'); }, get short() { return T('ui.ai.perm.mode_changes_short'); }, get note() { return T('ui.ai.perm.mode_changes_note'); } },
    { id: 'all', get label() { return T('ui.ai.perm.mode_all'); }, get short() { return T('ui.ai.perm.mode_all'); }, get note() { return T('ui.ai.perm.mode_all_note'); },
      get question() { return T('ui.ai.perm.mode_all_q'); }, get warning() { return T('ui.ai.perm.mode_all_warning'); } },
  ];
  const DELETE = /\b(delete|remove|trash|purge|clear|erase|empty|wipe|destroy|discard|overwrite|reset|close|quit)\b/i;
  const kindOf = (text) => (DELETE.test(String(text || '').replace(/[._-]/g, ' ')) ? 'delete' : 'change');

  const stores = { local: () => g.localStorage, session: () => g.sessionStorage };
  function read(which, key, fallback) { try { const v = stores[which]().getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
  function write(which, key, v) { try { stores[which]().setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked: this page only */ } }
  let memory = null;   // when storage is blocked
  const state = () => { const s = read('local', KEY, null) || memory || {}; return { mode: MODES.some((m) => m.id === s.mode) ? s.mode : 'ask', always: Array.isArray(s.always) ? s.always : [] }; };
  const save = (s) => { memory = s; write('local', KEY, s); };

  const mode = () => state().mode;
  function setMode(id) { if (!MODES.some((m) => m.id === id)) throw new Error('Unknown permission mode ' + id); const s = state(); s.mode = id; save(s); changed(id); return id; }
  /** Every mode switch, from any control on this page: a 'slopaipermissions' event on window ({ mode }). */
  function changed(id) { try { if (g.dispatchEvent && g.CustomEvent) g.dispatchEvent(new g.CustomEvent('slopaipermissions', { detail: { mode: id } })); } catch (e) { /* no events here */ } }
  const rules = () => state().always.slice();
  function addRule(kind, app, appName) {
    const s = state();
    if (!s.always.some((r) => r.kind === kind && r.app === app)) s.always.push({ kind, app, appName: appName || app, added: Date.now() });
    save(s);
  }
  function removeRule(kind, app) { const s = state(); s.always = s.always.filter((r) => !(r.kind === kind && r.app === app)); save(s); }

  const id = (kind, app) => `${kind}|${app}`;
  let request = new Set();
  const startRequest = () => { request = new Set(); };
  const endRequest = () => { request = new Set(); };
  const visit = () => new Set(read('session', VISIT, []));
  function grant(kind, app, scope, appName) {
    if (scope === 'request') request.add(id(kind, app));
    else if (scope === 'visit') { const v = visit(); v.add(id(kind, app)); write('session', VISIT, [...v]); }
    else if (scope === 'always') addRule(kind, app, appName);
  }

  function decide(kind, app) {
    if (!kind) return { allow: true, why: 'none' };
    const m = mode();
    if (m === 'all' || (m === 'changes' && kind === 'change')) return { allow: true, why: 'mode' };
    if (state().always.some((r) => r.kind === kind && r.app === app)) return { allow: true, why: 'rule' };
    if (visit().has(id(kind, app))) return { allow: true, why: 'visit' };
    if (request.has(id(kind, app))) return { allow: true, why: 'request' };
    return { allow: false, why: null };
  }

  const api = {
    KINDS, MODES, kindOf, mode, setMode, rules, addRule, removeRule, startRequest, endRequest, decide, grant,
    /** Shows the question; permissions-ui.js replaces it. Without a UI, a plain confirm: yes = once. */
    prompt: async (req) => (typeof g.confirm === 'function' && g.confirm(`${T('ui.ai.perm.in_app', { action: req.action || T('ui.ai.perm.an_action'), app: req.appName || T('ui.ai.this_app') })}\n\n${req.detail || ''}`) ? 'once' : 'deny'),
    async ask(req) {
      const kind = KINDS[req.kind] ? req.kind : 'delete', app = req.app || 'site';
      if (decide(kind, app).allow) return true;
      const choice = await api.prompt(Object.assign({}, req, { kind, app }));
      if (!choice || choice === 'deny') return false;
      grant(kind, app, choice, req.appName);
      return true;
    },
  };
  return api;
});
