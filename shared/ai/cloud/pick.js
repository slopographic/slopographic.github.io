/* SlopAIKit cloud pick: the searchable provider picker of "Use your own AI account" (connect.js), the provider's own
 * fields (endpoint id, account id, resource…), and the searchable model list with recently used models first. Classic
 * script; adds SlopAIKit.cloud.pick = { providers(select, { onPick }), fields(p, saved), models(select, p), remember(p, id),
 * recent(p) }.
 *   providers(select): a button naming the chosen provider; it opens a search box and the catalog's groups (Main open,
 *     the others collapsible), each row with badges (tools, vision, images, "Sign in" when it needs no key to paste:
 *     cloud/signin.js) and "browser OK" / "needs a proxy". Rows the
 *     browser cannot use are greyed, say why, and cannot be chosen. Picking sets the (hidden) select and fires change,
 *     so the form keeps one value. Search covers names, aliases, the company and model names (providers.js search).
 *   fields(p, saved): { node, values(), missing() } inputs for the {fields} of p's address template.
 *     A "Free" chip shows only the providers with a free tier, trial or free models (cloud/free.js), which carry a badge.
 *   models(select, p, { tools }): a search box over the model select when the list is long, "Recently used" on top, and
 *     "Show only free models" when some options are free (connect.js marks them data-free="1"; with tools on, free models
 *     that cannot use tools, data-tools="0", are left out too). */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = K.cloud;
  const h = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); return n; };
  const CSS = `
.sap-pp-btn { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 34px; padding: 4px 8px; border-radius: var(--p-radius); border: 1px solid var(--p-line); background: var(--p-input); color: var(--p-fg); font: 13px var(--p-font); text-align: start; cursor: pointer; }
.sap-pp-btn > b { flex: 1; min-width: 0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sap-pp-btn::after { content: '▾'; color: var(--p-dim); }
.sap-pp { display: grid; gap: 6px; padding: 6px; border: 1px solid var(--p-line); border-radius: var(--p-radius); background: var(--p-bg); max-height: min(60vh, 460px); overflow: auto; }
.sap-pp[hidden], .sap-pp-row[hidden], .sap-pp-g[hidden], .sap-pp-none[hidden], .sap-cloud-model-q[hidden] { display: none; }
.sap-pp-q, .sap-cloud-model-q { height: 32px; padding: 0 8px; border-radius: var(--p-radius); border: 1px solid var(--p-line); background: var(--p-input); color: var(--p-fg); font: 13px var(--p-font); width: 100%; min-width: 0; }
.sap-pp-g > summary { cursor: pointer; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--p-dim); padding: 4px 2px; }
.sap-pp-row { display: grid; gap: 2px; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: none; color: var(--p-fg); font: 13px var(--p-font); text-align: start; cursor: pointer; }
.sap-pp-row:hover, .sap-pp-row:focus-visible { background: var(--p-bg2); outline: none; }
.sap-pp-row[aria-checked="true"] { background: color-mix(in srgb, var(--p-accent) 14%, transparent); }
.sap-pp-row.off { cursor: default; opacity: .55; }
.sap-pp-n { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.sap-pp-n > b { font-weight: 500; margin-inline-end: 2px; }
.sap-pp-b { font-size: 10.5px; line-height: 16px; padding: 0 5px; border-radius: 4px; border: 1px solid var(--p-line); color: var(--p-dim); white-space: nowrap; }
.sap-pp-b.ok { color: var(--p-fg); border-color: color-mix(in srgb, var(--p-accent) 50%, var(--p-line)); }
.sap-pp-b.free { background: var(--p-accent); color: var(--p-ink); border-color: transparent; font-weight: 600; }
.sap-pp-top { display: flex; gap: 6px; align-items: center; } .sap-pp-top > .sap-pp-q { flex: 1; }
.sap-pp-chip { flex: none; height: 32px; padding: 0 10px; border-radius: 99px; border: 1px solid var(--p-line); background: var(--p-input); color: var(--p-fg); font: 12.5px var(--p-font); cursor: pointer; }
.sap-pp-chip[aria-pressed="true"] { background: var(--p-accent); color: var(--p-ink); border-color: transparent; font-weight: 600; }
.sap-cloud-free-only { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--p-fg); }
.sap-cloud-free-only[hidden] { display: none; } .sap-cloud-free-only input { margin: 0; width: auto; height: auto; }
.sap-pp-b.no { color: #ff8a98; border-color: color-mix(in srgb, #ff8a98 45%, var(--p-line)); }
.sap-pp-d { font-size: 11.5px; color: var(--p-dim); }
.sap-pp-none { margin: 4px; color: var(--p-dim); font-size: 12px; }`;
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  function style() {
    if (document.getElementById('sap-pp-style')) return;
    document.head.append(h('style', { id: 'sap-pp-style' }, CSS));
  }

  /** The small marks on a row: what it can do and whether this browser may call it. */
  function badges(p) {
    const out = [], free = C.free ? C.free.label(p) : '';
    if (free) out.push(h('span', { class: 'sap-pp-b free', title: p.free.note || '' }, free));
    // no key yet: "Sign in" says there is a one-click way (cloud/signin.js), in the list only
    if (p.signin) out.push(h('span', { class: 'sap-pp-b ok', 'data-cap': 'signin', title: T('ui.ai.cloud.or_badge_t', { name: p.short }) }, T('ui.ai.cloud.or_badge')));
    // data-cap: what it can do (the list shows those; the chosen provider's button leaves them out for room)
    if (p.caps.tools) out.push(h('span', { class: 'sap-pp-b', 'data-cap': 'tools', title: T('ui.ai.cloud.cap_tools_t') }, T('ui.ai.cloud.cap_tools')));
    if (p.caps.vision) out.push(h('span', { class: 'sap-pp-b', 'data-cap': 'vision', title: T('ui.ai.cloud.cap_vision_t') }, T('ui.ai.cloud.cap_vision')));
    if (p.caps.images || !p.chat) out.push(h('span', { class: 'sap-pp-b', 'data-cap': 'images', title: T('ui.ai.cloud.cap_images_t') }, T('ui.ai.cloud.cap_images')));
    if (p.cors === 'needs-proxy') out.push(h('span', { class: 'sap-pp-b no' }, T('ui.ai.cloud.needs_proxy')));
    else if (p.local) out.push(h('span', { class: 'sap-pp-b ok' }, T('ui.ai.cloud.on_computer')));
    else if (p.cors === 'verified') out.push(h('span', { class: 'sap-pp-b ok', title: T('ui.ai.cloud.browser_ok_t') }, T('ui.ai.cloud.browser_ok')));
    else out.push(h('span', { class: 'sap-pp-b' }, T('ui.ai.cloud.not_checked')));
    return out;
  }
  const blurb = (p) => (p.cors === 'needs-proxy' ? T('ui.ai.cloud.no_browser', { why: p.corsNote || T('ui.ai.cloud.no_browser_why') }) : !p.chat ? T('ui.ai.cloud.pictures_only') : p.notes || '');

  function providers(select, o = {}) {
    style();
    const label = h('b'), marks = h('span', { class: 'sap-pp-n' });
    const btn = h('button', { type: 'button', class: 'sap-pp-btn', 'aria-expanded': 'false', 'aria-haspopup': 'listbox' }, label, marks);
    const q = h('input', { type: 'search', class: 'sap-pp-q', placeholder: T('ui.ai.cloud.search_providers_n', { n: C.providers.length }), 'aria-label': T('ui.ai.cloud.search_providers'), autocomplete: 'off', spellcheck: 'false' });
    const none = h('p', { class: 'sap-pp-none', hidden: true }, T('ui.ai.cloud.no_match'));
    const chip = h('button', { type: 'button', class: 'sap-pp-chip', 'aria-pressed': 'false', title: T('ui.ai.cloud.free_only_t') }, T('ui.ai.cloud.tier_free'));
    chip.addEventListener('click', () => { chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')); filter(); });
    const panel = h('div', { class: 'sap-pp', hidden: true, role: 'listbox', 'aria-label': T('ui.ai.cloud.providers') }, h('div', { class: 'sap-pp-top' }, q, chip));
    const rows = new Map(), groups = new Map();
    for (const g of C.GROUPS) {
      const list = C.providers.filter((p) => p.group === g.id);
      if (!list.length) continue;
      const det = h('details', { class: 'sap-pp-g', 'data-group': g.id, open: g.id === 'main' || null }, h('summary', null, T('ui.ai.cloud.group_n', { name: g.name, n: list.length })));
      for (const p of list) {
        const off = !p.usable;
        const row = h('button', { type: 'button', role: 'option', class: 'sap-pp-row' + (off ? ' off' : ''), 'data-id': p.id, 'aria-disabled': off ? 'true' : null, 'aria-checked': 'false' },
          h('span', { class: 'sap-pp-n' }, h('b', null, p.name), badges(p)), blurb(p) ? h('span', { class: 'sap-pp-d' }, blurb(p)) : null);
        row.addEventListener('click', () => { if (!off) choose(p.id); });
        rows.set(p.id, row); det.append(row);
      }
      groups.set(g.id, det); panel.append(det);
    }
    panel.append(none);
    const opened = new Set(['main']);   // the groups open before a search, put back when it is cleared
    function filter() {
      const text = q.value.trim(), hits = new Set(C.search(text).map((p) => p.id)), free = chip.getAttribute('aria-pressed') === 'true';
      for (const [id, row] of rows) row.hidden = (!!text && !hits.has(id)) || (free && !(C.free && C.free.tier(C.byId(id))));
      for (const [id, det] of groups) {
        const any = [...det.querySelectorAll('.sap-pp-row')].some((r) => !r.hidden);
        det.hidden = !any;
        det.open = text || free ? any : opened.has(id);
      }
      none.hidden = !(text || free) || [...rows.values()].some((r) => !r.hidden);
    }
    // what the person opened or closed (a click on the heading), not what a search opened
    for (const [id, det] of groups) det.querySelector('summary').addEventListener('click', () => setTimeout(() => { if (!q.value.trim()) { if (det.open) opened.add(id); else opened.delete(id); } }));
    function sync() {
      const p = C.byId(select.value);
      label.textContent = p ? p.name : T('ui.ai.cloud.choose_provider');
      marks.textContent = ''; if (p) marks.append(...badges(p).filter((b) => !b.dataset.cap));   // the list shows those; the name needs the room
      for (const [id, row] of rows) row.setAttribute('aria-checked', String(id === select.value));
    }
    function show(open) {
      panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      if (open) { q.value = ''; filter(); q.focus(); }
    }
    function choose(id) {
      select.value = id; select.dispatchEvent(new Event('change')); sync(); show(false); btn.focus();
      if (o.onPick) o.onPick(id);
    }
    btn.addEventListener('click', () => show(panel.hidden));
    q.addEventListener('input', filter);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); show(false); btn.focus(); }
      if (e.key === 'Enter') { e.preventDefault(); const first = [...rows.values()].find((r) => !r.hidden && !r.classList.contains('off')); if (first) choose(first.dataset.id); }
    });
    select.addEventListener('change', sync);
    sync();
    return { node: h('div', { class: 'sap-pp-wrap' }, btn, panel), sync, open: () => show(true), close: () => show(false), panel };
  }

  /** The inputs for the {fields} in p's address (RunPod's endpoint id, Cloudflare's account id, Azure's resource). */
  function fields(p, saved = {}) {
    const list = p.fields || [], inputs = {};
    const node = h('div', { class: 'sap-cloud-fields' }, list.map((f) => {
      const inp = h('input', { class: 'sap-cloud-field', 'data-field': f.id, type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: f.placeholder || '', 'aria-label': f.label });
      inp.value = (saved && saved[f.id]) || f.default || '';
      inputs[f.id] = inp;
      return h('label', { class: 'sap-cloud-f' }, f.label, inp, f.help ? h('span', { class: 'sap-dim' }, f.help) : null);
    }));
    const values = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]));
    return { node, values, missing: () => C.resolve(p, values()).missing };
  }

  const RECENT = 'slop-ai.cloud.recent';
  const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT) || '{}') || {}; } catch (e) { return {}; } };
  const recent = (p) => (readRecent()[p.id || p] || []).slice(0, 5);
  function remember(p, id) {
    if (!id) return;
    const all = readRecent(), pid = p.id || p;
    all[pid] = [id, ...(all[pid] || []).filter((x) => x !== id)].slice(0, 5);
    try { localStorage.setItem(RECENT, JSON.stringify(all)); } catch (e) { /* storage blocked: not remembered */ }
  }

  /** The model select: "Recently used" first, and a search box over it once there are more than 8 models. */
  function models(select, p, o = {}) {
    style();
    const field = select.closest('label') || select;   // the toggle goes above the Model field, not inside its label
    let q = select.parentNode && select.parentNode.querySelector('.sap-cloud-model-q'), fo = field.parentNode && field.parentNode.querySelector(':scope > .sap-cloud-free-only');
    if (!q) {
      q = h('input', { type: 'search', class: 'sap-cloud-model-q', placeholder: T('ui.ai.cloud.search_models'), 'aria-label': T('ui.ai.cloud.search_models'), autocomplete: 'off', spellcheck: 'false' });
      fo = h('label', { class: 'sap-cloud-free-only' }, h('input', { type: 'checkbox' }), h('span', null, T('ui.ai.cloud.free_models_only')));
      select.before(q); field.before(fo);
      const again = () => filter(select, q.value, { free: fo.firstChild.checked, tools: select.dataset.tools === '1' });
      q.addEventListener('input', again); fo.firstChild.addEventListener('change', again);
    }
    select.dataset.tools = o.tools ? '1' : '';
    const anyFree = !!select.querySelector('option[data-free="1"]');
    fo.hidden = !anyFree; if (!anyFree) fo.firstChild.checked = false;
    fo.lastChild.textContent = T(o.tools && select.querySelector('option[data-free="1"][data-tools="0"]') ? 'ui.ai.cloud.free_tools_only' : 'ui.ai.cloud.free_models_only');
    const opts = [...select.querySelectorAll('option')], ids = new Set(opts.map((x) => x.value));
    const rec = recent(p).filter((id) => ids.has(id));
    if (rec.length) {
      const was = select.value;
      select.prepend(h('optgroup', { label: T('ui.ai.cloud.recent'), 'data-recent': '1' }, rec.map((id) => opts.find((x) => x.value === id).cloneNode(true))));
      select.value = was;
    }
    q.value = ''; q.hidden = ids.size <= 8;
    if (fo.firstChild.checked) filter(select, '', { free: true, tools: !!o.tools });
  }
  /** Hides the options that do not match. The chosen one stays, unless "only free" leaves it out: then the first free
   * model is chosen (and change fires). */
  function filter(select, text, o = {}) {
    const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
    const out = (x) => o.free && (x.dataset.free !== '1' || (o.tools && x.dataset.tools === '0'));
    const cur = select.selectedOptions[0];
    if (cur && out(cur)) { const first = [...select.options].find((x) => !out(x)); if (first) { select.value = first.value; select.dispatchEvent(new Event('change')); } }
    for (const x of select.querySelectorAll('option')) x.hidden = out(x) || (!!words.length && x.value !== select.value && !words.every((w) => (x.value + ' ' + x.textContent).toLowerCase().includes(w)));
    for (const g of select.querySelectorAll('optgroup')) g.hidden = ![...g.children].some((x) => !x.hidden);
  }

  C.pick = { providers, fields, models, remember, recent, filter, badges };
})();
