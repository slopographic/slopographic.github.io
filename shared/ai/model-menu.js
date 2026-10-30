/* SlopAIKit modelMenu: the panel header's model name as a menu button (shared/ui/menubutton.js), so changing the model
 * is two clicks. Classic script; adds SlopAIKit.modelMenu = { attach(P), items(P), refresh() }.
 * The menu: each connected provider (a key in this browser, or a server on this computer that was used) with its models,
 * the current one ticked, each with its hint ("most capable", "fastest, cheapest") and "· Free" when it costs nothing (a
 * provider with a free tier says so in its heading, cloud/free.js); then "Use your own AI account…" (the model choice
 * with the key form open), "AI settings…" (the full
 * model choice), "AI permissions…", and "Disconnect <provider>" (forgets its key). Picking a model uses it at once and
 * remembers it for this app (settings.lastByApp; connect.restore prefers it on this app's pages). */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // the words: shared/i18n/ui/<code>/ai.js
  let connected = [];   // [{ provider, models: [{ id, name, note }] }], refreshed before the menu is needed

  async function refresh() {
    const C = K.cloud;
    if (!C || !C.keys) { connected = []; return connected; }
    const s = C.keys.settings(), out = [];
    for (const p of C.providers) {   // every catalog entry (cloud/catalog/*.js, served by cloud/providers.js)
      if (p.chat === false || p.usable === false) continue;   // a picture-only key, or one the browser cannot call
      const ps = (s.providers || {})[p.id];
      const has = p.needsKey ? !!(await C.keys.get(p.id)) : !!(ps && ps.model);
      if (!has) continue;
      const models = C.suggested(p, C.connect && C.connect.fetched.get(p.id)).slice();
      if (ps && ps.model && !models.some((m) => m.id === ps.model)) models.unshift({ id: ps.model, name: ps.modelName || ps.model });
      out.push({ provider: p, models });
    }
    return (connected = out);
  }

  function items(P) {
    const cur = P.local && P.local.kind === 'cloud' ? P.local : null, list = [];
    for (const { provider: p, models } of connected) {
      const F = K.cloud && K.cloud.free, tier = F ? F.label(p) : '';
      list.push({ heading: p.name + (tier ? ` · ${tier}` : '') });
      for (const m of models) {
        const free = !!F && !p.local && F.model(p, m) === true;
        list.push({ value: `use|${p.id}|${m.id}`, label: m.name + (m.note ? ` · ${m.note}` : '') + (free ? ' · ' + T('ui.ai.menu.free') : ''), keywords: free ? ['free'] : [], checked: !!cur && cur.provider.id === p.id && cur.model.id === m.id });
      }
    }
    list.push({ heading: T('ui.more') }, { value: 'own', label: T(connected.length ? 'ui.ai.menu.add_account' : 'ui.ai.menu.own_account') }, { value: 'settings', label: T('ui.ai.menu.settings') }, { value: 'permissions', label: T('ui.ai.menu.permissions') });
    if (cur) list.push({ value: 'forget', label: T('ui.ai.menu.disconnect', { name: cur.provider.short }) });
    return list;
  }

  async function pick(P, value) {
    const C = K.cloud;
    if (value === 'settings') return P.choose();
    if (value === 'own') {   // the model choice with "Use your own AI account" open and in view (it works in every browser)
      if (!P.choosing) P.choose();
      const t0 = Date.now(), find = () => { const d = document.querySelector('.sap details.sap-cloud'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } else if (Date.now() - t0 < 10000) setTimeout(find, 100); };
      return find();
    }
    if (value === 'permissions') return P.settings();
    if (value === 'forget' && P.local && P.local.kind === 'cloud') {
      const p = P.local.provider;
      await C.keys.forget(p.id);
      const st = C.keys.settings(); if (st.active === p.id) { st.active = ''; C.keys.save(st); }
      P.forgot(p); await refresh(); P.render();
      return;
    }
    const [, pid, ...rest] = String(value).split('|'), mid = rest.join('|');
    const entry = connected.find((c) => c.provider.id === pid), m = entry && entry.models.find((x) => x.id === mid);
    if (!entry) return;
    const st = C.keys.settings();
    st.active = pid;
    st.providers = Object.assign({}, st.providers, { [pid]: Object.assign({}, st.providers[pid], { model: mid, modelName: m ? m.name : mid }) });
    st.lastByApp = Object.assign({}, st.lastByApp, { [P.appId()]: { provider: pid, model: mid } });
    C.keys.save(st);
    const eng = C.connect.engineFor(pid, st);
    await eng.load();
    P.use(eng);
  }

  function attach(P) {
    if (!window.SlopMenuButton || P.modelMenu) { if (!P.modelMenu) P.status.addEventListener('click', () => P.choose()); return; }
    P.modelMenu = SlopMenuButton.attach(P.status, { label: T('ui.ai.menu.model'), items: () => items(P), onPick: (v) => pick(P, v), search: false });
    refresh();
    // the list is read again as the menu opens (a key added or forgotten in another tab); an open menu redraws with it
    const again = () => refresh().then(() => { if (P.modelMenu.isOpen()) { P.modelMenu.close(); P.modelMenu.open(); } }).catch(() => {});
    P.status.addEventListener('pointerdown', again); P.status.addEventListener('click', again); P.status.addEventListener('keydown', (e) => { if (/^(Enter| |ArrowDown|ArrowUp)$/.test(e.key)) again(); });
    const use = P.use;
    P.use = (eng) => { use(eng); refresh(); };
  }

  K.modelMenu = { attach, items, refresh, pick };
})();
