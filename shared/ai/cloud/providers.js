/* SlopAIKit cloud providers: who the person can connect with their own key, in plain words. Classic script; adds to
 * SlopAIKit.cloud: providers (every catalog entry, normalized), byId(id), GROUPS, FORMATS, price(provider, model) →
 * { input, output, cacheRead } $ per million tokens or null, cost(usage, price) → $ or null (cache reads and writes priced), suggested(provider, models) → the few
 * models offered first, search(query) → the matching providers best first, resolve(p, values) → { url, missing },
 * baseFor(p, saved), endpoint(base, path), authHeaders(cfg), checkBase(url), localHelp(p).
 * The entries themselves are data in cloud/catalog/*.js (one file per group, see catalog/main.js for the fields). They
 * push into K.cloud.catalog, so they may load before or after this file; each entry is normalized once, on first use:
 *   needsKey / keyOptional from auth ('bearer' default, 'none', 'optional', or { header, prefix }), who / short from
 *   name, editBase for an address the person types, test() from testPath (OpenRouter's key check), usable (false when
 *   the browser cannot call it: cors 'needs-proxy'); chat (false for a picture-only provider).
 * One code path per API format: FORMATS maps the catalog's format to its file (openai-chat → compat.js, openai-responses
 * → openai.js); a provider adds no code of its own. Prices are what we know for sure: Anthropic's published list
 * (2026-10) and OpenRouter's, which its model list carries. For the others the panel shows tokens only and says so.
 * The models the site hides (shared/ai/makers.js, the brand profile's "ai") are left out everywhere here: providers and
 * byId skip a hidden provider, p.models and suggested() a hidden model, offered(p, list) a fetched list's. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  C.formats = C.formats || {};
  const raw = (C.catalog = C.catalog || []);
  const origin = () => { try { return location.origin; } catch (e) { return 'https://slopographic.com'; } };

  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  const has = (k) => !!(window.SlopI18n && SlopI18n.has && SlopI18n.has(k));
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  /** A group's name is read when shown (ui.ai.cloud.group_<id>), so it follows a language change. */
  const group = (id) => { const g = { id }; Object.defineProperty(g, 'name', { get: () => T('ui.ai.cloud.group_' + slug(id)), enumerable: true }); return g; };
  const GROUPS = ['main', 'fast', 'open-models', 'cloud', 'local', 'images', 'other'].map(group);
  /** Chat formats: catalog name → the file in cloud/ that speaks it. Picture formats are spoken by shared/ai/imagegen. */
  const FORMATS = { anthropic: 'anthropic', 'openai-responses': 'openai', 'openai-chat': 'compat', gemini: 'gemini' };
  const IMAGE_FORMATS = ['openai-images', 'fal', 'replicate', 'stability', 'bfl', 'ideogram', 'recraft', 'runpod-sync'];
  for (const [name, file] of Object.entries(FORMATS)) {
    if (name !== file && !Object.getOwnPropertyDescriptor(C.formats, name)) Object.defineProperty(C.formats, name, { get: () => C.formats[file], configurable: true });
  }

  /** The words people read live in the ui tables, not in the catalog: a getter per field that has a key, read when shown.
   *   ui.ai.prov.<id>_<name|who|short|notes|where|cors|pull|start>, <id>_setup_<n> / <id>_after_<n> (lines),
   *   <id>_free_<note|limits|reset|training> (else the group's: ui.ai.prov.local_free_note), <id>_<field>_help / _ph,
   *   <id>_model_<model id> (a model's name); ui.ai.cloud.field_<field id> (a field's label), ui.ai.cloud.hint_<hint>
   *   (a model's note: { hint: 'capable' }, { hint: 'recommended', by: 'OpenAI' }). */
  const live = (o, field, keys, vars) => { const k = keys.find(has); if (k) Object.defineProperty(o, field, { get: () => T(k, vars), enumerable: true, configurable: true }); return !!k; };
  const lines = (o, field, base) => { const ks = []; for (let i = 1; has(base + i); i++) ks.push(base + i); if (ks.length) Object.defineProperty(o, field, { get: () => ks.map((k) => T(k)), enumerable: true, configurable: true }); };
  function words(p) {
    const id = 'ui.ai.prov.' + slug(p.id) + '_', grp = 'ui.ai.prov.' + slug(p.group) + '_';
    for (const [f, k] of [['name', 'name'], ['who', 'who'], ['short', 'short'], ['notes', 'notes'], ['where', 'where'], ['corsNote', 'cors'], ['pull', 'pull'], ['start', 'start']]) live(p, f, [id + k]);
    lines(p, 'setup', id + 'setup_'); lines(p, 'after', id + 'after_');
    if (p.free) for (const f of ['note', 'limits', 'reset', 'training']) if (p.free[f] !== null) live(p.free, f, [id + 'free_' + f, grp + 'free_' + f]);
    for (const f of p.fields || []) { live(f, 'label', ['ui.ai.cloud.field_' + slug(f.id)]); live(f, 'help', [id + slug(f.id) + '_help']); live(f, 'placeholder', [id + slug(f.id) + '_ph']); }
    for (const m of p.models || []) { live(m, 'name', [id + 'model_' + slug(m.id)]); if (m.hint) live(m, 'note', ['ui.ai.cloud.hint_' + m.hint], { who: m.by || '' }); }
  }
  function norm(p) {
    if (p._n) return p;
    const auth = p.auth || 'bearer';
    words(p);
    for (const f of ['who', 'short']) if (p[f] == null) Object.defineProperty(p, f, { get: () => p.name, enumerable: true, configurable: true });
    p._models = p.models || [];   // as the catalog has them; models: the ones the site offers
    Object.defineProperty(p, 'models', { get: () => offered(p, p._models), enumerable: true, configurable: true });
    Object.assign(p, { _n: true, prefer: p.prefer || [/./], caps: p.caps || {},
      needsKey: auth !== 'none' && auth !== 'optional', keyOptional: auth === 'optional', chat: !!FORMATS[p.format] });
    p.usable = p.cors !== 'needs-proxy';   // a picture-only provider can be chosen: its key is kept for AI pictures
    if (p.local || p.anyAddress) p.editBase = true;
    if (p.testPath && !p.test) p.test = async (cfg) => { await C.call(endpoint(cfg.base, p.testPath), { headers: authHeaders(cfg), signal: cfg.signal }, { secret: cfg.key, provider: cfg.provider }); };
    return p;
  }
  const order = (p) => GROUPS.findIndex((g) => g.id === p.group);
  const M = () => K.makers;
  const shown = (p) => !M() || M().provider(p);
  /** The models of a list (the catalog's, or one fetched from the provider) that the site offers. */
  const offered = (p, list) => (M() ? M().filter(list, p && p.id) : (list || []).slice());
  const all = () => raw.map(norm).filter(shown).sort((a, b) => order(a) - order(b) || (a.rank || 50) - (b.rank || 50));
  Object.defineProperty(C, 'providers', { get: all, configurable: true });
  const byId = (id) => { const p = raw.find((x) => x.id === id); return p && shown(norm(p)) ? p : null; };

  /** A templated base URL filled in: { url, missing: [the labels of empty fields] }. Values are URL-encoded. */
  function resolve(p, values = {}) {
    const missing = [];
    const url = String(p.base || '').replace(/\{(\w+)\}/g, (m, k) => {
      const f = (p.fields || []).find((x) => x.id === k) || { label: k };
      const v = String(values[k] != null && values[k] !== '' ? values[k] : f.default || '').trim();
      if (!v) { missing.push(f.label); return m; }
      return encodeURIComponent(v);
    });
    return { url, missing };
  }
  /** The base a request uses: the typed address (local, any address), else the template with the saved fields. */
  const baseFor = (p, saved = {}) => (p.editBase ? saved.base || p.base || '' : resolve(p, saved.fields).url);
  /** base + path, with a query in the base (Azure's ?api-version=…) kept at the end. */
  function endpoint(base, path) {
    const s = String(base || ''), i = s.indexOf('?');
    return (i < 0 ? s : s.slice(0, i)).replace(/\/+$/, '') + path + (i < 0 ? '' : s.slice(i));
  }
  /** The key's header: Authorization: Bearer by default, or the provider's own ({ header: 'api-key' } for Azure). */
  function authHeaders(cfg) {
    const p = (cfg && cfg.provider) || {}, a = p.auth;
    const h = Object.assign({}, p.headers || {});
    if (!cfg.key) return h;
    if (a && typeof a === 'object') h[a.header] = (a.prefix || '') + cfg.key;
    else h.authorization = 'Bearer ' + cfg.key;
    return h;
  }

  /** Search over names, aliases, ids, the company and model names. Empty query: every provider. */
  function search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return all();
    const words = q.split(/\s+/);
    const score = (p) => {
      const name = p.name.toLowerCase(), hay = [p.id, p.who, ...(p.aliases || [])].join(' ').toLowerCase();
      const models = [...p.models.map((m) => m.id + ' ' + (m.name || '')), ...offered(p, p.modelHints)].join(' ').toLowerCase();
      let s = 0;
      for (const w of words) {
        if (name.startsWith(w) || p.id.startsWith(w)) s += 8; else if (name.includes(w)) s += 5; else if (hay.includes(w)) s += 4; else if (models.includes(w)) s += 2; else return 0;
      }
      return s;
    };
    return all().map((p) => [p, score(p)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0])).map((x) => x[0]);
  }

  /** True for plain http to another machine from an https page (mixed content: the browser blocks it). */
  function mixed(url) { try { const u = new URL(String(url || '').trim()); return u.protocol === 'http:' && !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(u.hostname); } catch (e) { return false; } }
  /** The address of a local or custom server: https anywhere, plain http only to this computer. An https page may not
   * call plain http on another machine (mixed content), so that is said before trying. */
  function checkBase(url) {
    let u;
    try { u = new URL(String(url || '').trim()); } catch (e) { return T('ui.ai.cloud.base_full'); }
    if (u.protocol === 'https:') return '';
    if (u.protocol === 'http:' && /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(u.hostname)) return '';
    if (u.protocol === 'http:') return T('ui.ai.cloud.base_mixed', { host: u.host });
    return T('ui.ai.cloud.base_https');
  }

  function price(p, model, fetched) {
    if (fetched && fetched.price) return fetched.price;
    const row = p && p.prices && p.prices[model];
    return row ? { input: row[0], output: row[1], cacheRead: row[2] != null ? row[2] : row[0] * 0.1 } : null;
  }
  /** $ for a reply: cached input at the cache price (0.1× input when unknown), cache writes at 1.25× input. */
  function cost(u, pr) {
    if (!pr || !u) return null;
    const read = u.cacheRead || 0, wrote = u.cacheWrite || 0, plain = Math.max(0, (u.input || 0) - read - wrote);
    const cr = pr.cacheRead != null ? pr.cacheRead : pr.input * 0.1;
    return (plain * pr.input + read * cr + wrote * pr.input * 1.25 + (u.output || 0) * pr.output) / 1e6;
  }

  /** The models offered first: the provider's preferred ones that the fetched list has, else its defaults. */
  function suggested(p, models) {
    models = offered(p, models);
    if (!models.length) return p.models.slice();
    const usable = models.filter((m) => m.tools !== false || !p.toolsOnly), out = [];
    for (const re of p.prefer || []) { const m = usable.find((x) => re.test(x.id) && !out.includes(x)); if (m) out.push(m); }
    return (out.length ? out : usable).slice(0, 4);
  }

  /** Plain help for a server on this computer: the entry's own setup lines ({site} = this website), then Chrome's prompt. */
  function localHelp(p) {
    const site = origin(), lines = (p.setup || [T('ui.ai.cloud.setup_any')]).map((t) => t.split('{site}').join(site));
    return [...lines, T('ui.ai.cloud.setup_chrome'), ...(p.after || [])];
  }

  Object.assign(C, { byId, offered, GROUPS, FORMATS, IMAGE_FORMATS, price, cost, suggested, search, resolve, baseFor, endpoint, authHeaders, checkBase, mixed, localHelp, norm });
})();
