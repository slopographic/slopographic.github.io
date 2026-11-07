/* SlopAIKit handoff: one task that moves through apps, in this tab, with the person following along. Classic script;
 * adds SlopAIKit.handoff.
 * Two kinds of work (the system prompt says so too): file in → file out operations run on any page (run_operation, no
 * move); editing that needs an app's state (PhotoSlop layers, a SlopCut timeline, Slop PDF pages) moves to that app.
 *   mode() / setMode('stay' | 'show')   "When a task uses other apps": Stay on this page when possible (default) or Show
 *        me in each app (localStorage 'slop-ai.hops'); the person can also say "do it here" or "show me"
 *   tool(env) → open_in_app({ app, files?, task }): the files go the way a person's "Open in…" sends them (SlopOuttake:
 *        an app's richer handover first, e.g. SlopIsolate → PhotoSlop as a layer with its mask; else Slop Drive and the
 *        app's intake on arrival); with no files, the app just opens. env.hop(rec, go) saves and navigates.
 *   save(rec) / take(appId) / peek(appId) / clear()   the record in sessionStorage 'slop-ai.handoff' (this tab: it survives
 *        the navigation): { to, toName, from, fromName, task, line, messages, chain: { id, hop }, at }
 *   carry(messages) → the conversation as plain text (steps as short lines), the last 40 messages
 *   cancel(chainId) / cancelled(chainId)   Stop on any page ends the whole chain: a record of a stopped chain never runs
 *   MAX_HOPS (8): a chain that keeps moving stops there
 *   renderSetting(box) → the mode as two choices, for the panel's ⚙ view */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // the words: shared/i18n/ui/<code>/ai2.js
  const KEY = 'slop-ai.handoff', MODE = 'slop-ai.hops', STOPPED = 'slop-ai.chain.stopped', FRESH = 10 * 60 * 1000, MAX_HOPS = 8;
  const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } return null; };
  const read = () => { try { return JSON.parse(ss(KEY) || 'null'); } catch (e) { return null; } };

  function mode() { try { return localStorage.getItem(MODE) === 'show' ? 'show' : 'stay'; } catch (e) { return 'stay'; } }
  function setMode(m) { try { localStorage.setItem(MODE, m === 'show' ? 'show' : 'stay'); } catch (e) { /* this visit only */ } return mode(); }

  function carry(messages) {
    const out = [];
    const add = (role, text) => { const prev = out[out.length - 1]; if (prev && prev.role === role) prev.content += '\n' + text; else out.push({ role, content: text }); };
    for (const m of messages || []) {
      if (m.error || m.meter || (m.handoff && !m.line)) continue;
      if (m.role === 'user') add('user', String(m.content || ''));
      else if (m.role === 'tool') add('assistant', `(${m.ok === false ? 'Failed' : 'Done'}: ${m.label || m.name})`);
      else if (m.role === 'assistant') { const t = String(m.display != null ? m.display : m.content || '').trim(); if (t) add('assistant', t); }
    }
    return out.slice(-40);
  }
  function save(rec) { const r = Object.assign({ at: Date.now() }, rec); ss(KEY, JSON.stringify(r)); return r; }
  const cancelled = (id) => !!id && String(ss(STOPPED) || '').split(',').includes(String(id));
  function peek(appId) { const r = read(); return r && r.to === appId && Date.now() - (r.at || 0) < FRESH && !cancelled(r.chain && r.chain.id) ? r : null; }
  function clear() { ss(KEY, null); }
  function take(appId) { const r = peek(appId); if (r) clear(); return r; }
  function cancel(id) { clear(); if (id && !cancelled(id)) ss(STOPPED, [ss(STOPPED), id].filter(Boolean).join(',')); }

  const isOpen = (q) => /^(open|current|this|app)$/i.test(String(q || '').trim());
  /** The files to carry: what the app has open (as it hands it to Convert), or Slop Drive files by name or id. */
  async function filesOf(list, env) {
    const out = [], hub = env.hub !== undefined ? env.hub : window.SlopHub;
    for (const q of [].concat(list || [])) {
      if (isOpen(q)) {
        const { ask } = await import(new URL('../../', K.base || document.baseURI).href + 'shared/convert/provided.js');
        out.push(...(await ask()).files);
      } else { const f = await K.appTools.findFile(hub, q); out.push(new File([f.blob], f.name, { type: f.type || f.blob.type || '' })); }
    }
    return out;
  }

  function tool(env = {}) {
    const apps = env.apps || (() => window.SLOP_APPS || []);
    return {
      name: 'open_in_app',
      description: 'Move the task to another app in this tab, with files (as "Open in…" does: a SlopIsolate cut-out arrives in PhotoSlop as a layer with its mask). The chat comes along; you continue there with "task". For editing that needs that app; file in → file out jobs: run_operation here.',
      params: { app: { type: 'string', description: 'app id, e.g. "photoslop"', required: true }, files: { type: 'array', description: 'Slop Drive file names, or "open" for what this app has open; none to just open the app' }, task: { type: 'string', description: 'what to do there, in full (the next page starts from it)', required: true } },
      schema: { type: 'object', properties: { app: { type: 'string', description: 'app id, e.g. "photoslop"' }, files: { type: 'array', items: { type: 'string' }, description: 'Slop Drive names, or "open" (what is open here)' }, task: { type: 'string', description: 'what to do there, in full' } }, required: ['app', 'task'] },
      label: (a) => { const app = ((apps().find((x) => x.id === a.app) || {}).name) || a.app, files = [].concat(a.files || []); return files.length ? T('ui.ai.hop.open_with', { app, files: files.join(', ') }) : T('ui.ai.hop.open', { app }); },
      run: async (a) => {
        const app = apps().find((x) => x.id === a.app || x.name.toLowerCase() === String(a.app).toLowerCase());
        if (!app) throw new Error(`No app "${a.app}". Use list_apps.`);
        if (!env.hop) throw new Error('Moving to another app is not available here.');
        const files = await filesOf(a.files, env), hub = env.hub !== undefined ? env.hub : window.SlopHub, O = window.SlopOuttake;
        const f = files[0];
        let go = () => { location.href = hub && hub.urlOf ? hub.urlOf(app) : new URL(app.path, location.href).href; };
        if (f) {
          const item = O && O.items({ get: () => f, name: f.name, type: f.type, folder: false }).find((it) => it && it.to === app.id);
          if (item) go = () => item.act();
          else if (hub && hub.sendTo) go = () => hub.sendTo(app.id, f, f.name);
          else throw new Error(`${app.name} cannot take ${f.name} here.`);
        }
        const dk = f ? 'ui.ai.run.continuing_with' : 'ui.ai.run.continuing', dv = { app: app.name, file: f ? f.name : '' };
        return env.hop({ app, task: String(a.task), line: T(dk, dv), dk, dv, files: files.map((x) => x.name) },
          async () => { if (hub) hub.sameTab = true; try { await go(); } finally { setTimeout(() => { if (hub) hub.sameTab = false; }, 2000); } });
      },
    };
  }

  function renderSetting(box) {
    const el = (t, a, ...k) => { const n = document.createElement(t); for (const x in a || {}) n.setAttribute(x, a[x]); n.append(...k); return n; };
    const wrap = el('div', { class: 'sap-perm sap-hops' }), now = mode();
    wrap.append(el('b', {}, T('ui.ai.hop.heading')));
    for (const id of ['stay', 'show']) {
      const label = T('ui.ai.hop.' + id), note = T(`ui.ai.hop.${id}_note`);
      const r = el('input', { type: 'radio', name: 'sap-hops', value: id, class: 'sap-hops-mode' });
      r.checked = id === now;
      r.addEventListener('change', () => setMode(id));
      wrap.append(el('label', {}, r, el('span', {}, el('span', {}, label), el('br'), el('span', { class: 'sap-dim' }, note))));
    }
    box.append(wrap);
    return wrap;
  }

  K.handoff = { mode, setMode, carry, save, take, peek, clear, cancel, cancelled, tool, renderSetting, KEY, MAX_HOPS };
})();
