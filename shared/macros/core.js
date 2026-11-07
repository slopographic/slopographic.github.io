/* SlopMacrosCore: app macros, the pure part. A macro is a list of an app's own SlopCmd commands with their arguments
 * (shared/commands: the commands with args ARE the steps; there is no second action system). One recorder, one replay.
 * Classic script for app pages (window.SlopMacrosCore), a side-effect ES-module import for Slop Workflows, and CommonJS for
 * the Node tests. No DOM.
 *
 * A macro:  { kind: 'slopmacro', v: 1, id, app, name, steps: [{ cmd, args, title }], created, modified }
 *   normalize(raw, app?)     → { macro, errors }: a clean macro (unknown fields dropped, bad steps left out with a reason)
 *   toText(macros, app)      a .slopmacro file: one macro, or { kind: 'slopmacros', app, macros } for several
 *   fromText(text, app?)     → { macros, errors }
 *   opId(app, id)            the macro's operation id in the registry (shared/ops/registry.js): 'macro:<app>:<id>'
 *   replay(steps, { exec, prepare, signal, onStep })   runs each step through exec(cmd, args) (SlopCmd.exec), in order;
 *                            the first step that does not work stops it with "Step 2 of 3 (Sharpen) did not work: …".
 *                            Used by Play in the app and by the hidden host (macros.js serve) the workflows run.
 *   createRecorder(SlopCmd, { onChange })   → { start, stop, cancel, note, remove, steps, recording, playing(fn) }
 *       Records the commands with args that run through SlopCmd.exec (the AI panel, the palette, a key) and what the app
 *       reports with note(cmd, args, title, { merge }) for a menu item or dialog that does the same as a command (PhotoSlop's filter
 *       dialogs report ps.ai.filter; merge: true replaces the last step when it is the same command, so a slider drag is
 *       one step). Only the outermost command counts: what a command does inside is not recorded twice.
 *       Never recorded: cmd.* and macro.* commands, commands without args (they open dialogs), and commands with macro: false. */
(function (root, factory) {
  const api = factory();
  root.SlopMacrosCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const KIND = 'slopmacro', LIST = 'slopmacros', VERSION = 1, EXT = '.slopmacro', MAX_STEPS = 200;
  // Words: shared/i18n/ui/<code>/macros.js (keys ui.macro.*), read when a message is made
  const tr = (key, vars) => { const I = (typeof window !== 'undefined' ? window : globalThis).SlopI18n; return I && I.t ? I.t(key, vars) : key; };
  const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
  let seq = 0;
  const newId = () => 'm' + Date.now().toString(36) + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
  const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

  /** Argument values a step keeps: strings, numbers, booleans (and null, "not set"). */
  function cleanArgs(a) {
    const out = {};
    if (!plain(a)) return out;
    for (const [k, v] of Object.entries(a)) {
      if (!/^[A-Za-z_][\w-]{0,40}$/.test(k) || v === undefined) continue;
      if (v === null || typeof v === 'boolean' || (typeof v === 'number' && isFinite(v))) out[k] = v;
      else if (typeof v === 'string') out[k] = v.slice(0, 20000);
      else if (typeof v === 'object') { const s = JSON.stringify(v); if (s.length <= 200000) out[k] = JSON.parse(s); }   // a json argument (an edit list)
    }
    return out;
  }
  function cleanStep(s) {
    if (!plain(s) || typeof s.cmd !== 'string' || !/^[\w.-]{1,120}$/.test(s.cmd)) return null;
    return { cmd: s.cmd, args: cleanArgs(s.args), title: clip(s.title || s.cmd, 120) };
  }

  function normalize(raw, app) {
    const errors = [];
    if (!plain(raw) || (raw.kind !== undefined && raw.kind !== KIND)) return { macro: null, errors: [tr('ui.macro.not_macro')] };
    if (app && raw.app && raw.app !== app) errors.push(tr('ui.macro.made_in', { app: raw.app }));
    const steps = [];
    (Array.isArray(raw.steps) ? raw.steps : []).slice(0, MAX_STEPS).forEach((s, i) => {
      const st = cleanStep(s);
      if (st) steps.push(st); else errors.push(tr('ui.macro.bad_step', { i: i + 1 }));
    });
    const now = Date.now();
    const macro = { kind: KIND, v: VERSION, id: typeof raw.id === 'string' && /^[\w-]{1,60}$/.test(raw.id) ? raw.id : newId(),
      app: clip(raw.app || app || '', 40), name: clip(raw.name, 80) || tr('ui.macro.untitled'), steps,
      created: Number(raw.created) || now, modified: Number(raw.modified) || now };
    return { macro, errors };
  }

  const bare = (m) => ({ kind: KIND, v: VERSION, id: m.id, app: m.app, name: m.name, steps: m.steps.map((s) => ({ cmd: s.cmd, args: cleanArgs(s.args), title: s.title })), created: m.created, modified: m.modified });
  function toText(macros, app) {
    const list = [].concat(macros);
    const data = list.length === 1 ? bare(list[0]) : { kind: LIST, v: VERSION, app: app || (list[0] && list[0].app) || '', macros: list.map(bare) };
    return JSON.stringify(data, null, 2) + '\n';
  }
  function fromText(text, app) {
    let raw;
    try { raw = JSON.parse(String(text)); } catch (e) { return { macros: [], errors: [tr('ui.macro.not_json')] }; }
    const list = plain(raw) && raw.kind === LIST && Array.isArray(raw.macros) ? raw.macros : [raw];
    const macros = [], errors = [];
    for (const r of list) {
      const n = normalize(r, app);
      if (n.macro) macros.push(n.macro);
      for (const e of n.errors) if (!errors.includes(e)) errors.push(e);
    }
    return { macros, errors };
  }

  const opId = (app, id) => `macro:${app}:${id}`;

  const abortError = () => { const e = new Error('Cancelled'); e.name = 'AbortError'; return e; };
  async function replay(steps, { exec, prepare = null, signal = null, onStep = null } = {}) {
    if (typeof exec !== 'function') throw new Error('Nothing to run the macro with.');
    const list = [].concat(steps || []), out = [];
    if (!list.length) throw new Error(tr('ui.macro.no_steps'));
    if (prepare) await prepare();
    for (let i = 0; i < list.length; i++) {
      if (signal && signal.aborted) throw abortError();
      const s = list[i];
      if (onStep) onStep({ index: i, step: s, state: 'run' });
      let r;
      try { r = await exec(s.cmd, cleanArgs(s.args)); } catch (e) { r = { ok: false, error: (e && e.message) || String(e) }; }
      if (!r || !r.ok) {
        if (onStep) onStep({ index: i, step: s, state: 'error' });
        throw new Error(tr('ui.macro.step_failed', { i: i + 1, of: list.length, title: s.title || s.cmd, err: (r && r.error) || tr('ui.macro.no_answer') }));
      }
      out.push(r.value);
      if (onStep) onStep({ index: i, step: s, state: 'done', value: r.value });
    }
    return out;
  }

  function createRecorder(C, { onChange = null } = {}) {
    let steps = null, depth = 0, playing = 0;
    const changed = () => { if (onChange) try { onChange(steps ? steps.slice() : null); } catch (e) { /* the panel must not stop the app */ } };
    const titleOf = (id) => { const c = C.get(id); return (c && c.title) || id; };
    const recordable = (id) => {
      if (/^(cmd|macro)\./.test(id)) return false;
      const c = C.get(id);
      return !!(c && Array.isArray(c.args) && c.macro !== false);
    };
    const push = (cmd, args, title, merge) => {
      if (!steps || playing) return false;
      const step = { cmd, args: cleanArgs(args), title: clip(title || titleOf(cmd), 120) }, last = steps[steps.length - 1];
      if (merge && last && last.cmd === cmd) steps[steps.length - 1] = step;   // a slider drag is one step, its last value
      else if (steps.length < MAX_STEPS) steps.push(step); else return false;
      changed(); return true;
    };

    const exec0 = C.exec;
    C.exec = async function (id, args, ctx) {
      depth++;
      try {
        const r = await exec0.call(C, id, args, ctx);
        if (depth === 1 && r && r.ok && recordable(id)) push(id, r.args);
        return r;
      } finally { depth--; }
    };
    // a command with args run from a key or the palette (args null: its defaults)
    C.on('run', (e) => { if (e && !depth && (e.source === 'key' || e.source === 'palette') && recordable(e.id)) push(e.id, {}); });

    return {
      start() { steps = []; changed(); },
      stop() { const s = steps || []; steps = null; changed(); return s; },
      cancel() { steps = null; changed(); },
      /** The app reports a UI action that is the same as a command with these args (ignored inside a command). */
      note(cmd, args, title, { merge = false } = {}) { return depth ? false : push(cmd, args, title, merge); },
      remove(i) { if (steps && steps[i]) { steps.splice(i, 1); changed(); } },
      steps: () => (steps ? steps.slice() : null),
      get recording() { return !!steps; },
      /** Runs fn with recording paused (Play must not record its own steps). */
      async playing(fn) { playing++; try { return await fn(); } finally { playing--; } },
    };
  }

  return { KIND, LIST, VERSION, EXT, MAX_STEPS, newId, opId, cleanArgs, normalize, toText, fromText, replay, createRecorder };
});
