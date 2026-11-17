/* SlopNav validation: binding names, allowed values and key combos. Never throws: every bad input
 * comes back as { ok: false, errors: [...] }. Classic script; sets window.SlopNav.validate. */
(function () {
  'use strict';
  const N = (window.SlopNav = window.SlopNav || {});
  const say = (k, v) => { const I = window.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/print.js (ui.nav.*)

  const WHEEL = ['plain', 'ctrl', 'alt', 'shift', 'off'];
  /** Every binding name, in the order the modal lists them, with its allowed values. */
  const SPEC = {
    zoomWheel: { kind: 'choice', values: WHEEL },
    panWheel: { kind: 'choice', values: WHEEL },
    spacePan: { kind: 'bool' },
    middlePan: { kind: 'bool' },
    pinch: { kind: 'choice', values: ['zoom', 'off'] },
    touchPan: { kind: 'bool' },
    fitKey: { kind: 'combo' },
    actualKey: { kind: 'combo' },
    zoomInKeys: { kind: 'combos' },
    zoomOutKeys: { kind: 'combos' },
    handKey: { kind: 'combo' },
    clickZoomKey: { kind: 'combo' },
  };
  const KEYS = Object.keys(SPEC);
  const MOD_ALIAS = { mod: 'mod', ctrl: 'mod', control: 'mod', cmd: 'mod', command: 'mod', meta: 'mod', alt: 'alt', option: 'alt', opt: 'alt', shift: 'shift' };
  const KEY_OK = /^([A-Z0-9]|=|-|\[|\]|Space)$/;

  /** "Ctrl+Shift+1" → { mod, alt, shift, key } ('' → null). Unknown modifier, key or repeat → null. */
  function parseCombo(str) {
    if (typeof str !== 'string' || !str.trim()) return null;
    const parts = str.trim().split('+');
    if (parts.length > 4 || parts.some((p) => p === '')) {
      // "Mod++" or "+": a literal plus key is spelled "=" in the presets, so treat empty parts as bad.
      return null;
    }
    const key = parts.pop();
    const out = { mod: false, alt: false, shift: false, key: '' };
    for (const raw of parts) {
      const m = MOD_ALIAS[raw.toLowerCase()];
      if (!m || out[m]) return null;
      out[m] = true;
    }
    const k = key.length === 1 ? key.toUpperCase() : key.toLowerCase() === 'space' ? 'Space' : key;
    if (!KEY_OK.test(k)) return null;
    out.key = k;
    return out;
  }
  /** Canonical spelling: "Mod+Alt+Shift+KEY". Shift is dropped for "=" and "-" (Shift+= is still "=", so both match). */
  function canonCombo(str) {
    const p = parseCombo(str);
    if (!p) return null;
    const shift = p.shift && p.key !== '=' && p.key !== '-';
    return [p.mod && 'Mod', p.alt && 'Alt', shift && 'Shift', p.key].filter(Boolean).join('+');
  }

  function checkValue(name, v) {
    const s = SPEC[name];
    if (!s) return { ok: false, error: say('ui.nav.err.unknown', { name }) };
    if (s.kind === 'bool') return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false, error: say('ui.nav.err.bool', { name }) };
    if (s.kind === 'choice') return s.values.includes(v) ? { ok: true, value: v } : { ok: false, error: say('ui.nav.err.choice', { name, list: s.values.join(', ') }) };
    if (s.kind === 'combo') {
      if (v === '' || v == null) return { ok: true, value: '' };
      const c = typeof v === 'string' ? canonCombo(v) : null;
      return c ? { ok: true, value: c } : { ok: false, error: say('ui.nav.err.combo', { name, value: String(v) }) };
    }
    if (s.kind === 'combos') {
      if (!Array.isArray(v) || v.length > 4) return { ok: false, error: say('ui.nav.err.combos', { name }) };
      const out = [];
      for (const x of v) {
        const c = typeof x === 'string' ? canonCombo(x) : null;
        if (!c) return { ok: false, error: say('ui.nav.err.bad_combo', { name, value: String(x) }) };
        if (!out.includes(c)) out.push(c);
      }
      return { ok: true, value: out };
    }
    return { ok: false, error: say('ui.nav.err.no_rule', { name }) };
  }

  /** Checks a full bindings object. Returns { ok, value, errors }; value is a clean copy when ok. */
  function validate(bindings) {
    try {
      if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) return { ok: false, value: null, errors: [say('ui.nav.err.object')] };
      const errors = [];
      for (const k of Object.keys(bindings)) if (!SPEC[k]) errors.push(say('ui.nav.err.unknown', { name: k }));
      const value = {};
      for (const k of KEYS) {
        if (!(k in bindings)) { errors.push(say('ui.nav.err.missing', { name: k })); continue; }
        const r = checkValue(k, bindings[k]);
        if (r.ok) value[k] = r.value; else errors.push(r.error);
      }
      if (errors.length) return { ok: false, value: null, errors };
      errors.push(...conflicts(value));
      return errors.length ? { ok: false, value: null, errors } : { ok: true, value, errors: [] };
    } catch (err) {
      return { ok: false, value: null, errors: [say('ui.nav.err.unreadable', { error: String(err && err.message) })] };
    }
  }
  /** Conflicts between clean bindings: two wheel modes on one modifier, or one combo bound to two actions. */
  function conflicts(v) {
    const out = [];
    if (v.zoomWheel !== 'off' && v.zoomWheel === v.panWheel) out.push(say('ui.nav.err.same_modifier'));
    const used = {};
    const add = (name, combo) => {
      if (!combo) return;
      if (used[combo]) out.push(say('ui.nav.err.twice', { combo, a: used[combo], b: name }));
      else used[combo] = name;
    };
    add('fitKey', v.fitKey); add('actualKey', v.actualKey); add('handKey', v.handKey); add('clickZoomKey', v.clickZoomKey);
    for (const c of v.zoomInKeys) add('zoomInKeys', c);
    for (const c of v.zoomOutKeys) add('zoomOutKeys', c);
    return out;
  }

  N.validate = { KEYS, SPEC, WHEEL, parseCombo, canonCombo, validate, checkValue };
})();
