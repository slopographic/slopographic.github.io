/* SlopAIKit cloud connect: "Use your own AI account", the part of the AI panel's model choice (picker.js) where the
 * person picks a provider, pastes their key, tests the connection and chooses a model. Classic script; adds
 * SlopAIKit.cloud.connect = { render(box, { onReady(engine) }), restore() → Promise<engine|null>, engineFor(id, s) }.
 * The key field is a password field with autocomplete off; the key goes to keys.js (this tab, or this device when
 * "Remember on this device" is on) and from there only into requests to that provider. Forget key removes it.
 * restore(appId): the provider chosen last (or the model last picked in this app), used again on the next page when its
 * key is still here (or none is needed).
 * The provider is chosen in the searchable picker (cloud/pick.js), which drives a hidden select (the form's one value);
 * a provider's own fields (endpoint id, account id…) come from its address template; a server on this computer gets
 * "Find servers" and a diagnosis on Test connection (cloud/local.js, local-ui.js). A picture-only provider just keeps
 * its key here, for AI pictures. Free tiers: "Get a free key in 2 minutes" (free-guide.js), "· Free" on free models and
 * "Show only free models" (cloud/free.js, pick.js). A provider with a `signin` entry (OpenRouter) gets "Sign in with <name>"
 * beside the key field (cloud/signin.js): back from its consent page, this form finishes the sign-in, stores the key like a
 * pasted one, and runs Test connection, so the models are there to choose. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = K.cloud;
  const h = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); return n; };
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  const fetched = new Map();   // provider id → the models its list returned this visit
  /** A sentence with one link in it ({link} in the words): [text, <a>, text]. */
  const linked = (k, href, v) => { const [a, b] = T(k, Object.assign({}, v, { link: '\u0000' })).split('\u0000'); return [a, h('a', { href, target: '_blank', rel: 'noopener' }, href.replace(/^https:\/\//, '')), b || '']; };

  function engineFor(id, s = C.keys.settings()) {
    const p = C.byId(id), ps = (s.providers || {})[id] || {};
    const model = ps.model || (C.suggested(p, fetched.get(id))[0] || {}).id;
    if (!model) return null;
    const f = (fetched.get(id) || []).find((m) => m.id === model);
    return new K.CloudEngine({ provider: p, model, base: C.baseFor(p, ps), key: () => C.keys.get(id), modelName: (f && f.name) || ps.modelName || '', price: C.price(p, model, f) || ps.price || null });
  }
  /** appId: the model last picked in this app (model-menu.js) wins when its provider is still connected. */
  async function restore(appId) {
    const s = C.keys.settings(), last = appId && s.lastByApp && s.lastByApp[appId], lp = last && C.byId(last.provider);
    if (lp && (!lp.needsKey || (await C.keys.get(lp.id)))) { s.active = lp.id; s.providers = Object.assign({}, s.providers, { [lp.id]: Object.assign({}, s.providers[lp.id], { model: last.model }) }); }
    const p = s.active && C.byId(s.active);
    if (!p) return null;
    if (p.needsKey && !(await C.keys.get(p.id))) return null;
    const eng = engineFor(p.id, s);
    if (eng) await eng.load();
    return eng;
  }

  /** The form into box. A language change builds it again in the new words, keeping the provider, what is open and a
   * key typed but not saved. */
  function render(box, o = {}) {
    let cur = build(o);
    box.append(cur.wrap);
    const off = window.SlopI18n && SlopI18n.on ? SlopI18n.on(() => {
      if (!cur.wrap.isConnected) { off(); return; }
      const next = build(Object.assign({}, o, { open: cur.wrap.open, pid: cur.sel.value }));
      next.key.value = cur.key.value; cur.wrap.replaceWith(next.wrap); cur = next;
    }) : null;
    return cur.wrap;
  }

  function build(o) {
    const s = C.keys.settings();
    let p = C.byId(o.pid) || C.byId(s.active) || C.providers[0];
    const sel = h('select', { class: 'sap-cloud-provider', 'aria-label': T('ui.ai.cloud.provider'), hidden: true }, C.providers.filter((x) => x.usable).map((x) => h('option', { value: x.id }, x.name)));
    const pp = C.pick.providers(sel), fieldBox = h('div', { class: 'sap-cloud-fieldbox' }), diag = h('div', { class: 'sap-cloud-diag', hidden: true });
    let fl = C.pick.fields({}, {});
    const kid = () => p.keyOf || p.id;   // a picture provider may use another entry's key (Together, RunPod)
    const base = h('input', { class: 'sap-cloud-base', type: 'url', spellcheck: 'false', autocomplete: 'off', 'aria-label': T('ui.ai.cloud.server_address') });
    const key = h('input', { class: 'sap-cloud-key', type: 'password', spellcheck: 'false', autocomplete: 'off', 'data-lpignore': 'true', 'aria-label': T('ui.ai.cloud.api_key') });
    const remember = h('input', { class: 'sap-cloud-remember', type: 'checkbox' });
    const model = h('select', { class: 'sap-cloud-model', 'aria-label': T('ui.ai.cloud.model') });
    const cap = h('input', { class: 'sap-cloud-cap', type: 'number', min: '0', step: '10000', inputmode: 'numeric', placeholder: T('ui.ai.cloud.no_cap'), 'aria-label': T('ui.ai.cloud.cap_aria') });
    const steps = h('input', { class: 'sap-cloud-steps', type: 'number', min: '1', max: '30', step: '1', inputmode: 'numeric', 'aria-label': T('ui.ai.cloud.steps') });
    const msg = h('p', { class: 'sap-dim sap-cloud-msg', role: 'status' }), est = h('span', { class: 'sap-dim sap-cloud-est' });
    const help = h('p', { class: 'sap-dim sap-cloud-help' }), local = h('details', { class: 'sap-cloud-local' });
    const signBtn = h('button', { type: 'button', class: 'sap-btn primary sap-cloud-signin-btn' }), signNote = h('p', { class: 'sap-dim sap-cloud-signin-note' });
    const signRow = h('div', { class: 'sap-cloud-signin' }, signBtn, signNote);
    const keyRow = h('label', { class: 'sap-cloud-f' }, T('ui.ai.cloud.api_key'), key), baseRow = h('label', { class: 'sap-cloud-f' }, T('ui.ai.cloud.address'), base);
    const remRow = h('label', { class: 'sap-cloud-check' }, remember, ' ' + T('ui.ai.cloud.remember'));
    const test = h('button', { type: 'button', class: 'sap-btn sap-cloud-test' }, T('ui.ai.cloud.test'));
    const forget = h('button', { type: 'button', class: 'sap-btn sap-cloud-forget' }, T('ui.ai.cloud.forget'));
    const use = h('button', { type: 'button', class: 'sap-btn primary sap-cloud-use' }, T('ui.ai.cloud.use'));
    const say = (t, bad) => { msg.textContent = t; msg.classList.toggle('bad', !!bad); };

    function fillModels() {
      const list = fetched.get(p.id) || [], top = C.suggested(p, list), ps = (C.keys.settings().providers || {})[p.id] || {};
      model.textContent = '';
      // a free model says so (cloud/free.js: OpenRouter's :free ids and zero prices, the catalog's free models)
      const opt = (m, text) => { const free = C.free.model(p, m) === true && !p.local; return h('option', { value: m.id, 'data-free': free ? '1' : null, 'data-tools': m.tools === false ? '0' : null }, text + (free ? ' · ' + T('ui.ai.cloud.tier_free') : '')); };
      top.forEach((m) => model.append(opt(m, m.name + (m.note ? ` (${m.note})` : ''))));
      const rest = list.filter((m) => !top.includes(m));
      if (rest.length) model.append(h('optgroup', { label: T('ui.ai.cloud.more_models') }, rest.map((m) => opt(m, m.name))));
      if (ps.model && ![...model.options].some((x) => x.value === ps.model)) model.prepend(h('option', { value: ps.model }, ps.modelName || ps.model));
      if (ps.model) model.value = ps.model;
      C.pick.models(model, p, { tools: o.tools ? o.tools() : true });
      model.disabled = !model.options.length;
      estimate();
    }
    function estimate() {
      const pr = C.price(p, model.value, (fetched.get(p.id) || []).find((m) => m.id === model.value)), n = Number(cap.value) || 0;
      est.textContent = n && pr ? ' ' + T('ui.ai.cloud.est', { amount: C.meter.money2((n * (pr.input * 0.8 + pr.output * 0.2)) / 1e6) }) : n ? ' ' + T('ui.ai.cloud.est_unknown') : '';
    }
    // show() reads the key store, so it finishes later; Test connection, Forget key and Use wait for it first, or its
    // clearing of the message would land after theirs (choosing a provider right after the panel opens runs it twice)
    let shown = Promise.resolve();
    const reshow = () => (shown = shown.then(show, show));
    async function show() {
      say('');
      const ps = (C.keys.settings().providers || {})[p.id] || {};
      sel.value = p.id; pp.sync(); base.value = ps.base || p.base || ''; base.placeholder = p.base || T('ui.ai.cloud.base_ph');
      fl = C.pick.fields(p, ps.fields); fieldBox.replaceChildren(fl.node); C.localUI.show(diag, null);
      signRow.hidden = !p.signin; signBtn.disabled = false;
      if (p.signin) { signBtn.textContent = T('ui.ai.cloud.or_signin', { name: p.short }); signNote.replaceChildren(...linked('ui.ai.cloud.or_note', p.signin.manage, { name: p.short }), ' ' + T('ui.ai.cloud.or_privacy', { name: p.short })); }
      baseRow.hidden = !p.editBase; finder.hidden = !p.editBase; keyRow.hidden = remRow.hidden = hint.hidden = forget.hidden = !(p.needsKey || p.keyOptional);
      for (const n of chatOnly) n.hidden = !p.chat;
      key.value = ''; key.placeholder = p.keyHint || T('ui.ai.cloud.key_ph');
      const rem = await C.keys.remembered(kid()), has = !!(await C.keys.get(kid()));
      remember.checked = rem;
      if (has) key.placeholder = T(remember.checked ? 'ui.ai.cloud.key_saved' : 'ui.ai.cloud.key_tab');
      forget.disabled = !has;
      use.textContent = p.chat ? T('ui.ai.cloud.use_name', { name: p.short }) : T('ui.ai.cloud.save_key');
      help.textContent = '';
      const free = !p.local && C.free.tier(p);
      if (p.needsKey) {   // "Get a key at <link>. …": the sentence's words around the link come from one key
        const [a, b] = T('ui.ai.cloud.get_key', { link: '\u0000' }).split('\u0000');
        help.append(a, h('a', { href: p.keyUrl, target: '_blank', rel: 'noopener' }, p.where || p.keyUrl), b || '', ' ', free ? `${C.free.label(p)}: ${free.note}` : T('ui.ai.cloud.charges', { who: p.who }));
      } else if (p.local) help.append(T('ui.ai.cloud.uses_local', { name: p.short }));
      else help.append(p.notes || T('ui.ai.cloud.any_server'));
      if (!p.chat) help.append(' ' + T('ui.ai.cloud.makes_pictures'));
      if (p.signin) help.append(' ', ...linked('ui.ai.cloud.or_manage', p.signin.manage, { name: p.short }));
      if (p.docs) help.append(' ', h('a', { href: p.docs, target: '_blank', rel: 'noopener' }, T('ui.ai.cloud.docs')));
      local.textContent = ''; local.hidden = !p.editBase;
      if (p.editBase) local.append(h('summary', null, p.local ? T('ui.ai.cloud.how_name', { name: p.short }) : T('ui.ai.cloud.how_local')), ...C.localHelp(p).map((t) => h('p', { class: 'sap-dim' }, t)));
      fillModels();
    }
    const cfgBase = () => (p.editBase ? base.value.trim() : C.resolve(p, fl.values()).url);
    /** What is missing or wrong in the address before anything is sent: '' when it is fine. */
    const addressProblem = () => (p.editBase ? C.checkBase(cfgBase()) : fl.missing().length ? T('ui.ai.cloud.fill_in', { fields: window.SlopI18n ? SlopI18n.list(fl.missing()) : fl.missing().join(', ') }) : '');
    async function engineNow() {
      const bad = addressProblem(); if (bad) throw new C.CloudError('request', bad);
      const typed = key.value.trim();
      const e = new K.CloudEngine({ provider: p, model: model.value || (p.models[0] || {}).id || 'model', base: cfgBase(), key: async () => typed || C.keys.get(kid()) });
      return e;
    }

    sel.addEventListener('change', () => { p = C.byId(sel.value); reshow(); });
    cap.addEventListener('input', estimate); model.addEventListener('change', estimate);
    /** Test connection; before: words put in front of its result (the sign-in's). */
    async function testNow(before = '') {
      await shown;
      test.disabled = true; say(T('ui.ai.cloud.testing'));
      const pre = (t) => (before ? before + ' ' + t : t);
      try {
        if (p.editBase && !addressProblem()) {   // a server: say which part failed, and its fix
          const r = await C.local.diagnose(p, cfgBase(), { key: key.value.trim() || (await C.keys.get(kid())) });
          if (r.models.length) fetched.set(p.id, r.models);
          fillModels(); C.localUI.show(diag, r); say(r.message, !r.ok);
          return;
        }
        const list = await (await engineNow()).test();
        if (list.length) fetched.set(p.id, list);
        fillModels();
        say(pre(p.modelsEndpoint === false && !p.test ? T('ui.ai.cloud.no_list', { name: p.short }) : list.length ? T('ui.ai.cloud.connected_n', { name: p.short, n: list.length }) : T('ui.ai.cloud.connected', { name: p.short })));
      } catch (e) { say(pre(C.redact(e.message, key.value.trim())), true); } finally { test.disabled = false; }
    }
    test.addEventListener('click', () => testNow());
    signBtn.addEventListener('click', async () => {
      await shown;
      signBtn.disabled = true; say(T('ui.ai.cloud.or_going', { name: p.short }));
      try { await C.signin.start(p, { remember: remember.checked }); } catch (e) { signBtn.disabled = false; say(e.message, true); }
    });
    /** Back from the provider's consent page (cloud/signin.js captured the code): the key, then Test connection. */
    async function signedIn() {
      p = C.byId(C.signin.returned()) || p; await reshow();
      say(T('ui.ai.cloud.or_finishing', { name: p.short }));
      try { if (!(await C.signin.finish())) { say(''); return; } } catch (e) { say(e.message, true); return; }
      await reshow();
      await testNow(T('ui.ai.cloud.or_done', { name: p.short }));
      if (model.options.length) model.focus();
    }
    forget.addEventListener('click', async () => {
      await C.keys.forget(kid());
      const st = C.keys.settings(); if (st.active === p.id) { st.active = ''; C.keys.save(st); }
      await reshow(); say(T('ui.ai.cloud.forgotten', { name: p.short }));
      if (o.onForget) o.onForget(p);
    });
    use.addEventListener('click', async () => {
      await shown;
      try {
        const typed = key.value.trim();
        if (p.needsKey && !typed && !(await C.keys.get(kid()))) { say(T('ui.ai.cloud.paste_key'), true); key.focus(); return; }
        if (!p.chat) { await C.keys.set(kid(), typed || (await C.keys.get(kid())), { remember: remember.checked }); key.value = ''; await show(); say(T('ui.ai.cloud.saved_pictures', { name: p.short })); return; }
        { const bad = addressProblem(); if (bad) { say(bad, true); return; } }
        if (!model.value) { say(T('ui.ai.cloud.press_test'), true); return; }
        if (typed) await C.keys.set(p.id, typed, { remember: remember.checked });
        else if (await C.keys.get(p.id)) await C.keys.set(p.id, await C.keys.get(p.id), { remember: remember.checked });
        const st = C.keys.settings(), f = (fetched.get(p.id) || []).find((m) => m.id === model.value);
        st.active = p.id; st.cap = Math.max(0, Math.round(Number(cap.value) || 0)); st.steps = Math.min(30, Math.max(1, Math.round(Number(steps.value) || 12)));
        st.providers = Object.assign({}, st.providers, { [p.id]: { model: model.value, modelName: f ? f.name : (p.models.find((m) => m.id === model.value) || {}).name, base: p.editBase ? cfgBase() : undefined, fields: p.fields ? fl.values() : undefined, price: f && f.price ? f.price : undefined } });
        C.pick.remember(p, model.value);
        if (o.appId) st.lastByApp = Object.assign({}, st.lastByApp, { [o.appId]: { provider: p.id, model: model.value } });
        C.keys.save(st);
        key.value = '';
        const eng = engineFor(p.id); await eng.load();
        say(T('ui.ai.cloud.using', { model: eng.info().name, name: p.short }));
        if (o.onReady) o.onReady(eng);
      } catch (e) { say(C.redact(e.message, key.value.trim()), true); }
    });

    const finder = C.localUI.finder({ onPick: (id, addr) => { p = C.byId(id); const st = C.keys.settings(); st.providers = Object.assign({}, st.providers, { [id]: Object.assign({}, st.providers && st.providers[id], { base: addr }) }); C.keys.save(st); show(); } });
    const modelRow = h('label', { class: 'sap-cloud-f' }, T('ui.ai.cloud.model'), model), capRow = h('label', { class: 'sap-cloud-f' }, T('ui.ai.cloud.cap'), cap), stepRow = h('label', { class: 'sap-cloud-f' }, T('ui.ai.cloud.steps'), steps);
    const chatOnly = [modelRow, capRow, est, stepRow], hint = h('p', { class: 'sap-dim sap-cloud-hint' }, T('ui.ai.cloud.remember_off'));
    cap.value = s.cap || ''; steps.value = s.steps || 12;
    const choose = (id) => { sel.value = id; sel.dispatchEvent(new Event('change')); return shown; };
    const guide = C.freeGuide.render({ onChoose: (id) => choose(id).then(() => key.focus()), onSignin: (id) => choose(id).then(() => signBtn.click()) });
    const wrap = h('details', { class: 'sap-cloud', open: o.open || !!s.active || !!C.signin.returned() || null },
      h('summary', null, h('b', null, T('ui.ai.cloud.own_title')), h('span', { class: 'sap-dim' }, ' ' + T('ui.ai.cloud.own_sub', { n: C.providers.length - 4 }))),
      h('p', { class: 'sap-dim' }, T('ui.ai.cloud.own_intro')),
      guide, h('div', { class: 'sap-cloud-f' }, h('span', null, T('ui.ai.cloud.provider')), sel, pp.node), finder, baseRow, fieldBox, signRow, keyRow, help, remRow,
      hint,
      h('div', { class: 'sap-acts' }, test, forget), msg, diag, modelRow, capRow, est, stepRow,
      h('div', { class: 'sap-acts' }, use), local);
    if (C.signin.returned()) signedIn(); else reshow();
    return { wrap, sel, key };
  }

  C.connect = { render, restore, engineFor, fetched };
})();
