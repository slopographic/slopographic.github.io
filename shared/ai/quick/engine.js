/* Slop AI quick prompts, the engine: the ready-made requests of the AI panel ("Summarize this document", "Translate the
 * selection into {language}") with their variables. Classic script and CommonJS module; sets SlopAIKit.quick. No DOM:
 * the panel's part is quick/ui.js, the context it reads is quick/context.js. The words are the prompts.* tables,
 * shared/ai/i18n/<code>/<part>.js (English and Swedish; another language reads English until it is translated), and the
 * text sent is in the person's language, so the model answers in it.
 * The lists, one assignment per file: quick/shared.js (every app, scope 'all') and quick/apps/<app id>.js (one app's):
 *   SlopAIKit.quickLists['<scope>'] = { skip: [shared ids or groups the app leaves out], prompts: [prompt, …] }
 * A prompt: { id, group, when: [names], vars: [var, …] }
 *   label 'prompts.<scope>.<id>', text 'prompts.<scope>.<id>.text' (a '-' in the scope is '_' in keys) (with {variables}; its own keys: label, text)
 *   group: the shared ones 'understand' | 'write' | 'translate' | 'ideas' | 'help'; an app's prompts are its own group
 *   when: what must be there, else the prompt is disabled with the reason prompts.when.<name>: 'selection', 'tools'
 *     (Control <app> on) or any context source the app reports ('document', 'sheet'). A source the app does not report
 *     is unknown and counts as there; the selection is always known.
 *   a var: { name, kind, from, options, default, min, max, optional, hint }
 *     'context'  filled from the context source `from` (default: its name), never asked
 *     'choice'   options: a named set (SETS: 'language', 'tone', 'length', 'audience', 'period') or values ['gentle', 'firm'];
 *                labels prompts.opt.<set>.<value>, or prompts.<scope>.opt.<name>.<value> for an app's own values
 *     'text'     a field, prefilled from `from` when the app reports it; hint: true → placeholder prompts.<scope>.<id>.<name>
 *     'number'   a field with min and max
 *   its label: prompts.<scope>.var.<name> when there is one, else prompts.var.<name>. A var is required unless optional.
 *   Never name a var text or label: its hint key would be the prompt's own text key.
 *   A value the person picks is remembered (per set for the named sets, so the last language comes back everywhere).
 * create({ T, has, lang, langs, storage }) → the API below; tests/node/ai-quick.test.mjs. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { const K = (root.SlopAIKit = root.SlopAIKit || {}); K.quickLists = K.quickLists || {}; K.quick = K.quick || api; }
})(typeof window !== 'undefined' ? window : globalThis, function (g) {
  'use strict';
  const KEY = 'slop-ai.quick', RECENT = 6, MAX_CTX = 6000;
  const GROUPS = ['understand', 'write', 'translate', 'ideas', 'help'];
  /** The named option sets: values (labels prompts.opt.<set>.<value>); 'language' is the site's languages. */
  const SETS = { tone: ['friendly', 'formal', 'neutral', 'confident', 'persuasive', 'playful'], length: ['short', 'medium', 'long'],
    audience: ['general', 'expert', 'beginner', 'child', 'customer', 'colleague'], period: ['week', 'month', 'quarter', 'year'] };
  const DEFAULTS = { tone: 'friendly', length: 'short', audience: 'general', period: 'month' };
  const PH = /\{(\w+)\}/g;

  function create(o = {}) {
    const T = o.T || ((k) => k), has = o.has || (() => false);
    const lang = () => (typeof o.lang === 'function' ? o.lang() : o.lang) || 'en';
    const langs = () => (typeof o.langs === 'function' ? o.langs() : o.langs) || [{ code: 'en', english: 'English' }];
    let memory = { recent: [], vals: {} };
    const store = () => { try { return o.storage !== undefined ? o.storage : g.localStorage || null; } catch (e) { return null; } };
    function load() {
      const s = store();
      if (!s) return memory;
      try { const v = JSON.parse(s.getItem(KEY) || 'null'); return v && Array.isArray(v.recent) && v.vals && typeof v.vals === 'object' ? v : { recent: [], vals: {} }; } catch (e) { return memory; }
    }
    function save(v) { memory = v; const s = store(); if (s) try { s.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage full or blocked: this page only */ } }

    /** One prompt with its keys and scope, as the UI uses it. */
    function norm(p, scope) {
      const ns = 'prompts.' + scope.replace(/-/g, '_'), base = `${ns}.${p.id}`;   // keys: 'paint-classic' → prompts.paint_classic
      return Object.assign({}, p, { scope, ns, key: `${scope}.${p.id}`, label: p.label || base, text: p.text || base + '.text',
        group: scope === 'all' ? p.group || 'help' : 'app', when: p.when || [], vars: (p.vars || []).map((v) => Object.assign({ kind: 'text' }, v)) });
    }
    /** Every prompt for an app: its own first, then the shared ones it does not skip. lists: SlopAIKit.quickLists. */
    function all(appId, lists) {
      const own = lists && appId && appId !== 'all' ? lists[appId] : null, shared = (lists && lists.all) || { prompts: [] };
      const skip = new Set((own && own.skip) || []);
      return [...((own && own.prompts) || []).map((p) => norm(p, appId)),
        ...shared.prompts.filter((p) => !skip.has(p.id) && !skip.has(p.group)).map((p) => norm(p, 'all'))];
    }
    const name = (p) => T(p.label);
    const varLabel = (v, p) => (has(`${p.ns}.var.${v.name}`) ? `${p.ns}.var.${v.name}` : `prompts.var.${v.name}`);
    const setOf = (v) => (typeof v.options === 'string' ? v.options : null);
    /** The choices of a choice var: [{ value, label }] in the language now. */
    function options(v, p) {
      const set = setOf(v);
      if (set === 'language') return langs().map((l) => ({ value: l.code, label: langName(l.code) }));
      const vals = set ? SETS[set] || [] : v.options || [];
      return vals.map((x) => ({ value: x, label: T(set ? `prompts.opt.${set}.${x}` : `${p.ns}.opt.${v.name}.${x}`) }));
    }
    /** A language's name in the language now ("tyska" in Swedish), from Intl, else the list's English name. */
    function langName(code) {
      try { const n = new Intl.DisplayNames([lang()], { type: 'language' }).of(code); if (n && n !== code) return n; } catch (e) { /* compat-ok: older Intl, the English name below */ }
      const l = langs().find((x) => x.code === code);
      return (l && (l.english || l.name)) || code;
    }

    /** Whether a prompt can run now: { ok, reason (a key), why (its text) }. env: { tools } (Control <app> is on). */
    function check(p, ctx = {}, env = {}) {
      for (const w of p.when) {
        const met = w === 'tools' ? !!env.tools : w === 'selection' ? !!String(ctx.selection || '').trim() : !(w in ctx) || !!ctx[w];
        if (!met) return { ok: false, reason: `prompts.when.${w}`, why: T(`prompts.when.${w}`, { app: ctx.app || '' }) };
      }
      return { ok: true };
    }
    /** The vars the person fills in (choice, text, number), in order. */
    const asks = (p) => p.vars.filter((v) => v.kind !== 'context');
    const memKey = (v, p) => (setOf(v) ? 'set.' + setOf(v) : `${p.key}.${v.name}`);
    /** The values a form starts with: remembered, else what the app reports, else the default. */
    function initial(p, ctx = {}) {
      const vals = load().vals, out = {};
      for (const v of asks(p)) {
        const mem = vals[memKey(v, p)], from = ctx[v.from || ''];
        let x = mem != null ? mem : v.from && from != null && from !== '' ? from : v.default != null ? v.default : setOf(v) ? DEFAULTS[setOf(v)] : '';
        if (setOf(v) === 'language' && mem == null && v.default == null) x = lang() === 'en' ? 'es' : 'en';
        if (v.kind === 'choice') { const opts = options(v, p).map((c) => c.value); if (!opts.includes(x)) x = opts[0]; }
        out[v.name] = x;
      }
      return out;
    }
    const clip = (s) => { s = String(s == null ? '' : s).trim(); return s.length > MAX_CTX ? s.slice(0, MAX_CTX) + ' …' : s; };
    /** The text to send: { text, missing: [var names] } (text is null when a required value is missing). */
    function fill(p, values = {}, ctx = {}) {
      const out = {}, missing = [];
      for (const v of p.vars) {
        let x = v.kind === 'context' ? ctx[v.from || v.name] : values[v.name];
        if (v.kind === 'choice' && x != null && x !== '') { const c = options(v, p).find((y) => y.value === x); x = c ? c.label : ''; }
        if (v.kind === 'number' && x !== '' && x != null) { x = Number(x); if (!isFinite(x)) x = ''; else { if (v.min != null) x = Math.max(v.min, x); if (v.max != null) x = Math.min(v.max, x); x = String(x); } }
        x = clip(x);
        if (!x && !v.optional) missing.push(v.name);
        out[v.name] = x;
      }
      const vars = Object.assign({ app: ctx.app || '', lang: ctx.lang || langName(lang()) }, out);
      const text = T(p.text).replace(PH, (m, k) => (k in vars ? vars[k] : m)).replace(/\n{3,}/g, '\n\n').trim();
      return { text: missing.length ? null : text, missing };
    }
    /** After a send: the values come back next time, the prompt goes to the top of Recent. */
    function remember(p, values = {}) {
      const v = load(), vals = Object.assign({}, v.vals);
      for (const x of asks(p)) {
        const val = values[x.name];
        if (val == null || val === '' || (x.kind === 'text' && x.from)) continue;   // a value the app reports comes from the app next time
        vals[memKey(x, p)] = val;
      }
      save({ recent: [p.key, ...v.recent.filter((k) => k !== p.key)].slice(0, RECENT), vals });
    }
    const recent = () => load().recent.slice();

    const lower = (s) => String(s || '').toLocaleLowerCase();
    /** The prompts that match what follows "/": every word in the label, the group or the id; best first (the label
     * starts with it, a word of it does, it holds it, the id does). An empty query keeps the order: recent first. */
    function filter(list, q) {
      const words = lower(q).trim().split(/\s+/).filter(Boolean);
      if (!words.length) return order(list);
      const hay = (p) => [lower(name(p)), lower(p.group === 'app' ? '' : T('prompts.group.' + p.group)), lower(p.id.replace(/_/g, ' '))];
      const rank = (p) => {
        const [l, gr, id] = hay(p), w = words[0];
        if (!words.every((x) => l.includes(x) || gr.includes(x) || id.includes(x))) return -1;
        return l.startsWith(w) ? 0 : l.split(/\s+/).some((x) => x.startsWith(w)) ? 1 : l.includes(w) ? 2 : 3;
      };
      return order(list).map((p, i) => ({ p, r: rank(p), i })).filter((x) => x.r >= 0).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.p);
    }
    /** Recently used first (newest first), then the list's own order. */
    function order(list) {
      const r = recent();
      return [...r.map((k) => list.find((p) => p.key === k)).filter(Boolean), ...list.filter((p) => !r.includes(p.key))];
    }
    /** Every {variable} a prompt's text uses that it does not declare (app and lang always are): for the tests. */
    function undeclared(p, text) {
      const names = new Set(['app', 'lang', ...p.vars.map((v) => v.name)]);
      return [...String(text).matchAll(PH)].map((m) => m[1]).filter((n) => !names.has(n));
    }
    return { all, norm, name, varLabel, options, langName, check, asks, initial, fill, remember, recent, filter, order, undeclared, memKey, SETS, GROUPS, KEY, MAX_CTX };
  }
  return { create, SETS, GROUPS, DEFAULTS, KEY };
});
