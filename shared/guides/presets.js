/* SlopGuides presets: built-ins plus custom presets kept in localStorage, with JSON export/import.
 * A preset is { name, tab: 'form' | 'notation' | 'intervals', form?, notation?, intervals?, unit?, snap? }. A built-in's name is
 * the words of ui.guides.preset_<id> (shared/i18n/ui/<code>/guides.js), read each time (a getter). */
(function (root) {
  'use strict';
  const SG = root.SlopGuides = root.SlopGuides || {};
  const KEY = 'slopguides.presets.v1';
  const tr = (k) => (root.SlopI18n ? root.SlopI18n.t(k) : k);
  /** A built-in preset: its name follows the language. */
  const B = (id, p) => Object.defineProperty(Object.assign({ id, builtin: true }, p), 'name', { get: () => tr('ui.guides.preset_' + id), enumerable: true });

  const BUILTIN = [
    B('web12', { tab: 'form', unit: 'px',
      form: { margins: { top: '', right: '40', bottom: '', left: '40' }, cols: { count: 12, width: '', gutter: '20' }, rows: { count: '', height: '', gutter: '' } } }),
    B('pt8', { tab: 'intervals', unit: 'px', intervals: { x: { step: '8', origin: '0' }, y: { step: '8', origin: '0' } } }),
    B('golden', { tab: 'notation', notation: '| 38.197% | 23.607% | 38.197% | ( v )\n| 38.197% | 23.607% | 38.197% | ( h )' }),
    B('thirds', { tab: 'notation', notation: '| ~ | ~ | ~ | ( v )\n| ~ | ~ | ~ | ( h )' }),
    B('cross', { tab: 'form', form: { margins: {}, cols: {}, rows: {}, midV: true, midH: true } }),
    B('edges5', { tab: 'form', unit: '%', form: { margins: { top: '5', right: '5', bottom: '5', left: '5' }, cols: {}, rows: {}, edges: true } }),
    B('modular4', { tab: 'form', unit: 'px', form: { margins: { top: '40', right: '40', bottom: '40', left: '40' }, cols: { count: 4, gutter: '20' }, rows: { count: 4, gutter: '20' } } }),
  ];

  function storage() { try { return root.localStorage || null; } catch (e) { return null; } }
  function loadCustom(key = KEY) {
    const s = storage(); if (!s) return [];
    try { const v = JSON.parse(s.getItem(key) || '[]'); return Array.isArray(v) ? v.filter(valid) : []; } catch (e) { return []; }
  }
  function saveCustom(list, key = KEY) {
    const s = storage(); if (!s) return false;
    try { s.setItem(key, JSON.stringify(list.filter(valid).map(strip))); return true; } catch (e) { return false; }
  }
  const valid = (p) => !!(p && typeof p.name === 'string' && p.name.trim() && ['form', 'notation', 'intervals'].includes(p.tab));
  const strip = (p) => { const o = JSON.parse(JSON.stringify(p)); delete o.builtin; o.name = String(o.name).trim().slice(0, 80); return o; };
  const all = (key) => BUILTIN.concat(loadCustom(key));

  /** Add or replace (by name) a custom preset. Returns the new custom list. */
  function addPreset(p, key = KEY) {
    if (!valid(p)) throw new Error(tr('ui.guides.need_name'));
    const list = loadCustom(key).filter((x) => x.name !== p.name.trim());
    list.push(strip(p));
    saveCustom(list, key);
    return list;
  }
  function removePreset(name, key = KEY) { const list = loadCustom(key).filter((x) => x.name !== name); saveCustom(list, key); return list; }

  /** JSON text for a download: { format: 'slopguides', version: 1, presets }. */
  function exportJSON(key = KEY) { return JSON.stringify({ format: 'slopguides', version: 1, presets: loadCustom(key) }, null, 2); }
  /** Merge presets from JSON text (an export, or a bare array). Returns how many were added. */
  function importJSON(text, key = KEY) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error(tr('ui.guides.not_json')); }
    const arr = Array.isArray(data) ? data : data && data.format === 'slopguides' && Array.isArray(data.presets) ? data.presets : null;
    if (!arr) throw new Error(tr('ui.guides.not_presets'));
    const ok = arr.filter(valid);
    const names = new Set(ok.map((p) => p.name.trim()));
    saveCustom(loadCustom(key).filter((x) => !names.has(x.name)).concat(ok.map(strip)), key);
    return ok.length;
  }

  /** Guides for a preset (or any panel state) in rect. */
  function presetGuides(p, rect, { dpi = 72, snap } = {}) {
    const unit = p.unit || 'px', sn = snap || p.snap || 'off';
    if (p.tab === 'notation') return SG.notation(p.notation || '', rect, { unit, dpi, snap: sn }).guides;
    if (p.tab === 'intervals') return SG.intervals(rect, Object.assign({ unit, dpi, snap: sn }, p.intervals));
    return SG.compute(rect, Object.assign({ unit, dpi, snap: sn }, p.form));
  }

  Object.assign(SG, { PRESETS: BUILTIN, PRESET_KEY: KEY, presets: all, loadCustom, saveCustom, addPreset, removePreset, exportJSON, importJSON, presetGuides });
  if (typeof module === 'object' && module.exports) module.exports = SG;
})(typeof window !== 'undefined' ? window : globalThis);
