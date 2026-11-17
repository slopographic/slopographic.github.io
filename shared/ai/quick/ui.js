/* Slop AI quick prompts in the panel (loaded with the kit by panel.js; adds SlopAIKit.quickUI). One tap sends a
 * ready-made request; a prompt with something to choose (a language, a tone, a goal) first shows a small form above
 * the message box, with the last values used. Three ways in:
 *   - the chips on an empty chat: recent first, then this app's own prompts (chips());
 *   - the prompts button beside the message box: the whole list, grouped (Recent, the app's, Understand, Write, …);
 *   - "/" at the start of the message box: the same list, filtered by what follows; ↑ ↓ choose, Enter runs, Esc closes.
 * A prompt whose condition is not met (no selection, Control <app> off) is shown disabled with the reason.
 * Without a model the request waits (P.pending) and is sent once one is chosen. The engine is quick/engine.js, the
 * context quick/context.js, the lists quick/shared.js and quick/apps/<app id>.js (loaded here, for this app only). */
(function () {
  'use strict';
  const K = window.SlopAIKit, P = K && K.panel;
  if (!P || !K.quick || K.quickUI) return;
  const h = P.h, T = P.T, I = () => window.SlopI18n;
  const Q = K.quick.create({ T, has: (k) => !!(I() && I().has && I().has(k)), lang: () => (I() ? I().get() : 'en'), langs: () => (I() ? I().LANGS : undefined) });
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';
  let box = null, btn = null, mode = null, shown = [], active = 0, bySlash = false, mounted = false, prepared = false;

  // this app's own list (quick/apps/<id>.js), for a page of the registry (an app, Paint Classic); the chips and an open list follow it
  const id = P.appId(), isApp = (window.SLOP_APPS || []).some((a) => a.id === id && a.path && !a.path.startsWith('#'));
  const appList = isApp ? K.load(['quick/apps/' + id]).catch(() => null) : Promise.resolve();
  // never P.render() here: it would redraw a model choice or a sign-in in progress (tests/ai/cloud-signin.test.html)
  appList.then(() => { if (mode === 'list') list(filterText()); const c = P.list && P.list.querySelector('.sap-q-chips'); if (c) c.replaceWith(chips()); });

  const ctx = () => K.quickContext.now(P);
  const env = () => ({ tools: !!(P.toolsBox && P.toolsBox.checked && window.SlopCmd) });
  const prompts = () => Q.all(id, K.quickLists);
  const filterText = () => (P.input && P.input.value.startsWith('/') ? P.input.value.slice(1) : '');
  const groupName = (g) => (g === 'app' ? P.appName() : g === 'recent' ? T('prompts.ui.recent') : T('prompts.group.' + g));
  /** The app's AI part (its context provider among it), once, when the prompts are first shown. */
  function prepare() { if (prepared) return; prepared = true; const C = window.SlopCmd; if (C && C.prepare) C.prepare().catch(() => {}); }

  function mount() {
    if (mounted || !P.input || !P.sendBtn) return;
    mounted = true;
    const comp = P.input.parentNode;
    btn = h('button', { type: 'button', class: 'sap-qbtn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', onclick: () => (mode ? close() : list('', true)) });
    btn.innerHTML = ICON;
    comp.insertBefore(btn, P.input);
    box = h('div', { class: 'sap-q', hidden: true, onkeydown: onBoxKey });
    comp.parentNode.insertBefore(box, comp);
    P.input.setAttribute('aria-autocomplete', 'list');
    P.input.addEventListener('keydown', onKey, true);   // before the panel's own (Enter sends, ↑ recalls)
    P.input.addEventListener('input', onInput);
    document.addEventListener('pointerdown', (e) => { if (mode === 'list' && !box.contains(e.target) && e.target !== P.input && !btn.contains(e.target)) close(); }, true);
    words();
  }
  function words() {
    if (!btn) return;
    btn.title = T('prompts.ui.open'); btn.setAttribute('aria-label', btn.title);
    if (mode === 'list') list(filterText(), !bySlash);
  }

  /** The list, grouped, filtered by q: Recent (without a query), then the groups in order. */
  function list(q, fromButton) {
    if (!box) return;
    prepare();
    bySlash = !fromButton; mode = 'list';
    const all = prompts(), c = ctx(), e = env(), rec = q ? [] : Q.order(all).filter((p) => Q.recent().includes(p.key));
    const found = q ? Q.filter(all, q) : all.filter((p) => !rec.includes(p));
    const groups = q ? [['', found]] : [['recent', rec], ['app', found.filter((p) => p.group === 'app')], ...Q.GROUPS.map((g) => [g, found.filter((p) => p.group === g)])];
    shown = []; box.textContent = '';
    const lb = h('div', { class: 'sap-q-list', role: 'listbox', id: 'sap-q-list', 'aria-label': T('prompts.ui.open') });
    for (const [g, ps] of groups) {
      if (!ps.length) continue;
      const grp = h('div', { class: 'sap-q-g', role: 'group', 'aria-label': g ? groupName(g) : T('prompts.ui.matches') });
      if (g) grp.append(h('div', { class: 'sap-q-h', 'aria-hidden': 'true' }, groupName(g)));
      for (const p of ps) {
        const st = Q.check(p, c, e), n = shown.length;
        const row = h('div', { class: 'sap-q-o', role: 'option', id: 'sap-q-o' + n, 'aria-disabled': st.ok ? null : 'true', 'aria-selected': 'false',
          onpointerdown: (ev) => ev.preventDefault(), onclick: () => pick(p) }, h('span', { class: 'sap-q-l' }, Q.name(p)), st.ok ? null : h('span', { class: 'sap-q-w' }, st.why));
        shown.push({ p, row, ok: st.ok });
        grp.append(row);
      }
      lb.append(grp);
    }
    if (!shown.length) lb.append(h('div', { class: 'sap-q-none' }, T('prompts.ui.none')));
    box.append(lb, h('div', { class: 'sap-q-foot' }, T('prompts.ui.keys')));
    box.hidden = false; btn.setAttribute('aria-expanded', 'true');
    P.input.setAttribute('aria-controls', 'sap-q-list'); P.input.setAttribute('aria-expanded', 'true');
    const first = shown.findIndex((x) => x.ok);
    move(first < 0 ? 0 : first, true);
  }
  function move(i, start) {
    if (!shown.length) { P.input.removeAttribute('aria-activedescendant'); return; }
    active = (i + shown.length) % shown.length;
    shown.forEach((x, j) => { x.row.classList.toggle('on', j === active); x.row.setAttribute('aria-selected', j === active ? 'true' : 'false'); });
    P.input.setAttribute('aria-activedescendant', shown[active].row.id);
    if (!start && shown[active].row.scrollIntoView) shown[active].row.scrollIntoView({ block: 'nearest' });
  }
  function close(keep) {
    if (!box) return;
    if (bySlash && mode === 'list' && !keep && P.input.value.startsWith('/')) P.input.value = '';
    mode = null; bySlash = false; box.hidden = true; box.textContent = ''; shown = [];
    btn.setAttribute('aria-expanded', 'false');
    for (const a of ['aria-controls', 'aria-expanded', 'aria-activedescendant']) P.input.removeAttribute(a);
  }

  /** A prompt chosen: its form when it asks for something, else sent at once. */
  function pick(p) {
    const st = Q.check(p, ctx(), env());
    if (!st.ok) return st;
    if (!Q.asks(p).length) return run(p, {});
    form(p);
    return { ok: true, form: true };
  }
  function field(v, p, val) {
    const fid = 'sap-qf-' + v.name, lab = h('label', { for: fid }, T(Q.varLabel(v, p)));
    let el;
    if (v.kind === 'choice') el = h('select', { id: fid, name: v.name }, ...Q.options(v, p).map((o) => h('option', { value: o.value, selected: o.value === val }, o.label)));
    else if (v.kind === 'number') el = h('input', { id: fid, name: v.name, type: 'number', inputmode: 'numeric', min: v.min, max: v.max, value: val });
    else el = h(v.long ? 'textarea' : 'input', { id: fid, name: v.name, type: v.long ? null : 'text', rows: v.long ? 3 : null, placeholder: v.hint ? T(`${p.ns}.${p.id}.${v.name}`) : null, autocomplete: 'off' });
    if (v.kind !== 'choice' && val != null && v.kind !== 'number') el.value = val;
    el.addEventListener('input', () => el.removeAttribute('aria-invalid'));
    return h('div', { class: 'sap-qf-f' }, lab, el);
  }
  function form(p) {
    prepare();
    mode = 'form'; box.textContent = '';
    const vals = Q.initial(p, ctx());
    const f = h('form', { class: 'sap-qf', 'aria-label': Q.name(p), novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(p, f); } },
      h('div', { class: 'sap-qf-t' }, Q.name(p)),
      ...Q.asks(p).map((v) => field(v, p, vals[v.name])),
      h('div', { class: 'sap-qf-b' }, h('button', { type: 'button', class: 'sap-btn', onclick: () => { close(); P.input.focus(); } }, T('prompts.ui.cancel')),
        h('button', { type: 'submit', class: 'sap-btn primary' }, T('prompts.ui.send'))));
    box.append(f); box.hidden = false; btn.setAttribute('aria-expanded', 'false');
    for (const a of ['aria-controls', 'aria-expanded', 'aria-activedescendant']) P.input.removeAttribute(a);
    const first = f.querySelector('input, select, textarea');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 0);
    return f;
  }
  function submit(p, f) {
    const values = {};
    for (const v of Q.asks(p)) { const el = f.elements[v.name]; values[v.name] = el ? (v.kind === 'text' ? el.value.trim() : el.value) : ''; }
    const r = run(p, values);
    if (r.missing && r.missing.length) {
      const el = f.elements[r.missing[0]];
      for (const n of r.missing) if (f.elements[n]) f.elements[n].setAttribute('aria-invalid', 'true');
      if (el) el.focus();
    }
    return r;
  }
  /** Fill and send (or wait for a model). A required value that is missing sends nothing: { missing }. */
  function run(p, values) {
    const r = Q.fill(p, values, ctx());
    if (!r.text) return r;
    Q.remember(p, values);
    close(true); P.input.value = '';
    if (P.busy) { P.input.value = r.text; P.input.focus(); return r; }   // a reply is coming: the request waits in the box
    if (!P.engine()) { P.pending = r.text; P.render(); return r; }   // sent once a model is chosen (panel.js runPending)
    window.SlopAIPanel.send(r.text);
    return r;
  }

  function onInput() {
    const v = P.input.value;
    if (v.startsWith('/') && !v.includes('\n')) list(v.slice(1));
    else if (mode === 'list' && bySlash) close(true);
  }
  function onKey(e) {
    if (mode !== 'list' || e.isComposing) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') move(active + (k === 'ArrowDown' ? 1 : -1));
    else if ((k === 'Enter' && !e.shiftKey) || k === 'Tab') { const x = shown[active]; if (!x || !x.ok) { if (k === 'Tab') return; } else pick(x.p); }
    else if (k === 'Escape') close();
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }
  function onBoxKey(e) {
    if (e.key === 'Escape' && mode === 'form') { e.preventDefault(); e.stopPropagation(); close(); P.input.focus(); }
    else if (e.key !== 'Escape') e.stopPropagation();   // typing in the form is the form's, never an app shortcut
  }

  /** The chips on an empty chat: recent first, then the app's own, those that can run now (at most 6), and "All prompts". */
  function chips() {
    prepare();
    const c = ctx(), e = env(), ok = Q.order(prompts()).filter((p) => Q.check(p, c, e).ok);
    const top = [...ok.filter((p) => Q.recent().includes(p.key)), ...ok.filter((p) => p.group === 'app' && !Q.recent().includes(p.key))];
    for (const p of ok) if (top.length < 6 && !top.includes(p)) top.push(p);
    return h('div', { class: 'sap-q-chips', role: 'group', 'aria-label': T('prompts.ui.open') },
      ...top.slice(0, 6).map((p) => h('button', { type: 'button', class: 'sap-q-chip', onclick: () => pick(p) }, Q.name(p))),
      h('button', { type: 'button', class: 'sap-q-chip more', onclick: () => { list('', true); if (window.matchMedia && matchMedia('(hover: hover)').matches) P.input.focus(); } }, T('prompts.ui.more')));
  }

  if (window.SlopI18n && SlopI18n.on) SlopI18n.on(() => { words(); if (mode === 'form') close(); });
  K.quickUI = { mount, chips, list, close, pick, run, form, engine: Q, get mode() { return mode; }, get shown() { return shown.map((x) => x.p.key); } };
  mount();
})();
