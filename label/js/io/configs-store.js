/* SlopLabel — io/configs-store: saved label configs and the user's presets, in one versioned localStorage envelope
 * { v: 1, data: { configs: [...], presets: [...] } } under 'slop.label.configs.v1'. Every storage call is in a try/catch: when
 * storage is blocked the store still works for this visit (persisted = false). A file made by another version is read
 * as empty and never overwritten. Export and import use the JSON format { format: 'sloplabel-configs', version: 1 }.
 * makeConfigStore takes the storage object (tests pass an in-memory one). Classic script; uses core/configs.js. */
'use strict';

const CONFIG_KEY = 'slop.label.configs.v1';
const CONFIG_MAX = 200;

function memoryStorage() { const m = new Map(); return { memory: true, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }
function browserStorage() { try { const s = window.localStorage; s.getItem(CONFIG_KEY); return s; } catch (e) { return null; } }

function makeConfigStore(storage, key = CONFIG_KEY) {
  const store = { persisted: !!storage && !storage.memory, readOnly: false, configs: [], presets: [] };
  let seq = 0;
  const newId = (p) => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

  /** A stored record, checked: anything that does not validate is dropped (a hand edit, another version). */
  function record(r) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string') return null;
    const name = cleanConfigName(r.name), v = validateConfig(r.body);
    if (!name || !v.ok) return null;
    return { id: r.id, name, created: +r.created || 0, updated: +r.updated || 0, body: v.body };
  }
  function load() {
    store.configs = []; store.presets = [];
    if (!storage) return;
    try {
      const raw = storage.getItem(key);
      if (!raw) return;
      const env = JSON.parse(raw);
      if (!env || env.v !== 1 || !env.data) { store.readOnly = true; return; }
      store.configs = (Array.isArray(env.data.configs) ? env.data.configs : []).map(record).filter(Boolean).slice(0, CONFIG_MAX);
      store.presets = (Array.isArray(env.data.presets) ? env.data.presets : []).map(record).filter(Boolean).slice(0, CONFIG_MAX);
    } catch (e) { store.readOnly = true; }
  }
  /** Writes the envelope. → true when it was saved to storage (false when storage is blocked or read-only). */
  function write() {
    if (store.readOnly || !storage) return false;
    try { storage.setItem(key, JSON.stringify({ v: 1, data: { configs: store.configs, presets: store.presets } })); return true; }
    catch (e) { store.persisted = false; return false; }
  }
  const takenBy = (list, id) => list.filter((r) => r.id !== id).map((r) => r.name);

  /** Save a new config from a validated body. → { ok, record } or { ok: false, error }. */
  function add(name, body, list = store.configs) {
    const clean = cleanConfigName(name), v = validateConfig(body);
    if (!clean) return { ok: false, error: LT('label.store.give_the_config_a_name') };
    if (!v.ok) return { ok: false, error: v.errors[0] };
    if (list.some((r) => r.name.toLowerCase() === clean.toLowerCase())) return { ok: false, error: `A ${list === store.presets ? 'preset' : 'config'} called “${clean}” already exists` };
    if (list.length >= CONFIG_MAX) return { ok: false, error: LT('label.store.full', { n: CONFIG_MAX }) };
    const now = Date.now(), rec = { id: newId(list === store.presets ? 'p' : 'c'), name: clean, created: now, updated: now, body: v.body };
    list.push(rec);
    write();
    return { ok: true, record: rec };
  }
  const find = (id) => store.configs.find((r) => r.id === id) || null;
  const findPreset = (id) => store.presets.find((r) => r.id === id) || null;

  function rename(id, name, list = store.configs) {
    const r = list.find((x) => x.id === id), clean = cleanConfigName(name);
    if (!r) return { ok: false, error: LT('label.store.that_config_is_gone') };
    if (!clean) return { ok: false, error: LT('label.store.give_the_config_a_name') };
    if (takenBy(list, id).some((n) => n.toLowerCase() === clean.toLowerCase())) return { ok: false, error: `A config called “${clean}” already exists` };
    r.name = clean; r.updated = Date.now(); write();
    return { ok: true, record: r };
  }
  function duplicate(id, list = store.configs) {
    const r = list.find((x) => x.id === id);
    if (!r) return { ok: false, error: LT('label.store.that_config_is_gone') };
    if (list.length >= CONFIG_MAX) return { ok: false, error: LT('label.store.full', { n: CONFIG_MAX }) };
    const now = Date.now(), copy = { id: newId(list === store.presets ? 'p' : 'c'), name: uniqueConfigName(list.map((x) => x.name), r.name + ' copy'), created: now, updated: now, body: deepClone(r.body) };
    list.push(copy); write();
    return { ok: true, record: copy };
  }
  function remove(id, list = store.configs) {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    list.splice(i, 1); write();
    return true;
  }
  /** A config as a user preset (the same body, its own name). */
  function saveAsPreset(id) {
    const r = find(id);
    if (!r) return { ok: false, error: LT('label.store.that_config_is_gone') };
    return add(uniqueConfigName(store.presets.map((x) => x.name), r.name), r.body, store.presets);
  }

  /** The JSON text of the given configs (all when ids is omitted). */
  function exportText(ids) {
    const list = ids ? store.configs.filter((r) => ids.includes(r.id)) : store.configs;
    return JSON.stringify({ format: CONFIG_FORMAT, version: CONFIG_VERSION, exported: new Date().toISOString(), configs: list.map((r) => ({ name: r.name, body: r.body })) }, null, 1);
  }
  /** Imports a file. Each config is checked; a name already in use gets a number. → { ok, added, rejected: [{ name, error }] } */
  function importText(text) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { return { ok: false, error: LT('label.store.the_file_is_not_json') }; }
    if (!doc || doc.format !== CONFIG_FORMAT) return { ok: false, error: LT('label.store.this_is_not_a_sloplabel') };
    if (doc.version !== CONFIG_VERSION) return { ok: false, error: LT('label.store.version', { file: String(doc.version), app: String(CONFIG_VERSION) }) };
    if (!Array.isArray(doc.configs)) return { ok: false, error: LT('label.store.the_file_has_no_configs') };
    const rejected = [];
    let added = 0;
    for (const item of doc.configs) {
      const name = cleanConfigName(item && item.name), v = validateConfig(item && item.body);
      if (!name) { rejected.push({ name: '(no name)', error: LT('label.store.no_name') }); continue; }
      if (!v.ok) { rejected.push({ name, error: v.errors[0] }); continue; }
      if (store.configs.length >= CONFIG_MAX) { rejected.push({ name, error: LT('label.store.the_list_is_full') }); continue; }
      const now = Date.now();
      store.configs.push({ id: newId('c'), name: uniqueConfigName(store.configs.map((x) => x.name), name), created: now, updated: now, body: v.body });
      added++;
    }
    if (added) write();
    return { ok: true, added, rejected };
  }

  load();
  Object.assign(store, { load, write, add, find, findPreset, rename, duplicate, remove, saveAsPreset, exportText, importText, removePreset: (id) => remove(id, store.presets), renamePreset: (id, n) => rename(id, n, store.presets), duplicatePreset: (id) => duplicate(id, store.presets), addPreset: (name, body) => add(name, body, store.presets) });
  return store;
}

/** The store the app uses: browser localStorage when it is there, else memory for this visit. */
const LabelConfigs = makeConfigStore(browserStorage() || memoryStorage());
