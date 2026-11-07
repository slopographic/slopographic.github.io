/* SlopGuides panel: a floating, themable (--sui-*) GuideGuide-style panel.
 * Needs engine.js, notation.js, presets.js and panel-tabs.js. Styles: guides.css.
 *
 *   const p = SlopGuides.openPanel({
 *     title: 'Guides',
 *     targets: [{ id: 'canvas', label: 'Canvas', rect: () => ({ x, y, w, h }) }, …],  // rect() → null = unavailable
 *     dpi: () => 72,
 *     preview(guides | null) {},          // draw a live preview; null = stop
 *     apply(guides, { mode }) {},         // mode 'add' | 'replace'; the host commits one history step
 *     clear() {},                         // remove every guide (one history step)
 *     onClose() {}, stateKey: 'slopguides.state.myapp',
 *   });
 *   p.close(); p.refresh(); p.guides(); p.set(patch)
 * The panel is not a modal dialog, so the app's shortcuts (undo, zoom…) keep working while it is open.
 * Words: shared/i18n/ui/<code>/guides.js (keys ui.guides.*); a language switch relabels the open panel (SlopI18n.on). */
(function (root) {
  'use strict';
  const SG = root.SlopGuides = root.SlopGuides || {};
  const tr = SG.tr = (k, v) => (root.SlopI18n ? root.SlopI18n.t(k, v) : k);

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }
  SG.el = el;

  const DEFAULT_STATE = () => ({
    tab: 'form', target: 'canvas', unit: 'px', snap: 'off', live: true,
    form: { margins: { top: '', right: '', bottom: '', left: '' }, link: false, cols: { count: '', width: '', gutter: '' }, rows: { count: '', height: '', gutter: '' }, colMid: false, rowMid: false, midV: false, midH: false, edges: false, baseline: { on: false, step: '', offset: '' } },
    notation: '| ~ | ~ | ~ | ( v )',
    intervals: { x: { on: true, step: '100', origin: '0' }, y: { on: true, step: '100', origin: '0' } },
  });
  function loadState(key) {
    const s = DEFAULT_STATE();
    try { const v = key && JSON.parse(localStorage.getItem(key) || 'null'); if (v) deepAssign(s, v); } catch (e) { /* storage blocked */ }
    return s;
  }
  function deepAssign(a, b) { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepAssign(a[k], b[k]); else if (b[k] !== undefined) a[k] = b[k]; } return a; }

  /** Guides for the current state in rect (pure: used by the panel and by tests). */
  function stateGuides(st, rect, dpi = 72) {
    if (!rect) return { guides: [], errors: [{ line: 0, msg: tr('ui.guides.no_target') }] };
    const o = { unit: st.unit, dpi, snap: st.snap };
    if (st.tab === 'notation') return SG.notation(st.notation, rect, o);
    if (st.tab === 'intervals') {
      const iv = st.intervals;
      return { guides: SG.intervals(rect, Object.assign(o, { x: iv.x.on ? iv.x : null, y: iv.y.on ? iv.y : null })), errors: [] };
    }
    const f = st.form;
    return { guides: SG.compute(rect, Object.assign(o, f, { baseline: f.baseline && f.baseline.on ? f.baseline : null })), errors: [] };
  }
  SG.stateGuides = stateGuides;
  SG.defaultPanelState = DEFAULT_STATE;

  let current = null;
  function openPanel(opts) {
    if (current) { current.close(); }
    const key = opts.stateKey || 'slopguides.state';
    const st = loadState(key);
    const targets = opts.targets || [];
    if (!targets.some((t) => t.id === st.target) && targets[0]) st.target = targets[0].id;
    const save = () => { try { localStorage.setItem(key, JSON.stringify(st)); } catch (e) { /* ignore */ } };
    const rectOf = () => { const t = targets.find((x) => x.id === st.target) || targets[0]; return t ? t.rect() : null; };
    const dpi = () => (opts.dpi ? opts.dpi() : 72) || 72;

    const close = el('button', { type: 'button', class: 'sgd-x' }, '×'), title = el('span', { class: 'sgd-title' });
    const head = el('div', { class: 'sgd-head' }, title, close);
    const target = el('select', { class: 'sgd-in' });
    const unit = el('select', { class: 'sgd-in sgd-unit' }, SG.UNITS.map((u) => el('option', { value: u }, u)));
    const preset = el('select', { class: 'sgd-in sgd-preset' });
    const presetMenu = el('button', { type: 'button', class: 'sgd-btn sgd-icon' }, '⋯');
    const tabs = el('div', { class: 'sgd-tabs', role: 'tablist' });
    const bodies = {};
    const status = el('div', { class: 'sgd-status', 'aria-live': 'polite' });
    const snap = el('select', { class: 'sgd-in' }, ['off', 'round', 'distribute'].map((v) => el('option', { value: v })));
    const live = el('input', { type: 'checkbox' });
    const btnClear = el('button', { type: 'button', class: 'sgd-btn' });
    const btnReplace = el('button', { type: 'button', class: 'sgd-btn' });
    const btnApply = el('button', { type: 'button', class: 'sgd-btn sgd-primary' });
    const lIn = el('span'), lUnit = el('span'), lPixels = el('span'), lLive = el('span');
    const box = el('div', { class: 'sgd-panel', role: 'dialog', 'aria-modal': 'false' }, head,
      el('div', { class: 'sgd-body' },
        el('div', { class: 'sgd-row2' }, el('label', { class: 'sgd-f' }, lIn, target), el('label', { class: 'sgd-f' }, lUnit, unit)),
        el('div', { class: 'sgd-presets' }, preset, presetMenu),
        tabs, el('div', { class: 'sgd-tabbody' })),
      el('div', { class: 'sgd-foot' },
        el('div', { class: 'sgd-row2' }, el('label', { class: 'sgd-f' }, lPixels, snap), el('label', { class: 'sgd-chk' }, live, lLive)),
        status, el('div', { class: 'sgd-btns' }, btnClear, btnReplace, btnApply)));
    const tabBody = box.querySelector('.sgd-tabbody');
    /** The words built once, in the chosen language (again after a switch). */
    function words() {
      const name = opts.title || tr('ui.guides.title'), at = (n, map) => { for (const k in map) n.setAttribute(k, map[k]); };
      title.textContent = name; box.setAttribute('aria-label', name);
      at(close, { 'aria-label': tr('ui.guides.close_aria'), title: tr('ui.guides.close_tip') });
      target.setAttribute('aria-label', tr('ui.guides.target_aria')); unit.setAttribute('aria-label', tr('ui.guides.unit'));
      preset.setAttribute('aria-label', tr('ui.guides.presets'));
      at(presetMenu, { title: tr('ui.guides.preset_menu_tip'), 'aria-label': tr('ui.guides.preset_menu') });
      snap.setAttribute('aria-label', tr('ui.guides.snap_aria'));
      [...snap.options].forEach((o) => { o.textContent = tr('ui.guides.snap_' + o.value); });
      live.setAttribute('aria-label', tr('ui.guides.live'));
      btnClear.textContent = tr('ui.guides.clear'); btnClear.title = tr('ui.guides.clear_tip');
      btnReplace.textContent = tr('ui.guides.replace'); btnReplace.title = tr('ui.guides.replace_tip');
      btnApply.textContent = tr('ui.apply'); btnApply.title = tr('ui.guides.apply_tip');
      lIn.textContent = tr('ui.guides.in'); lUnit.textContent = tr('ui.guides.unit'); lPixels.textContent = tr('ui.guides.pixels'); lLive.textContent = tr('ui.guides.live');
    }
    words();

    let raf = 0, last = { guides: [], errors: [] };
    function update() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        save();
        last = stateGuides(st, rectOf(), dpi());
        const n = last.guides.length, v = last.guides.filter((g) => g.o === 'v').length;
        status.textContent = last.errors.length ? last.errors.map((e) => (e.line ? tr('ui.guides.line_err', { n: String(e.line), msg: e.msg }) : e.msg)).join(' · ') : tr('ui.guides.count', { n, v, h: n - v });
        status.classList.toggle('sgd-err', !!last.errors.length);
        btnApply.disabled = btnReplace.disabled = !n;
        if (opts.preview) opts.preview(st.live && n ? last.guides : null);
      });
    }
    const compute = () => stateGuides(st, rectOf(), dpi());

    function fillTargets() {
      target.textContent = '';
      for (const t of targets) { const r = t.rect(); target.append(el('option', { value: t.id, disabled: !r }, r ? t.label : tr('ui.guides.target_none', { name: t.label }))); }
      if (!rectOf()) { const ok = targets.find((t) => t.rect()); if (ok) st.target = ok.id; }
      target.value = st.target;
    }
    function fillPresets() {
      preset.textContent = '';
      preset.append(el('option', { value: '' }, tr('ui.guides.presets_dots')));
      const custom = SG.loadCustom(), og1 = el('optgroup', { label: tr('ui.guides.builtin') }), og2 = el('optgroup', { label: tr('ui.guides.saved') });
      SG.PRESETS.forEach((p, i) => og1.append(el('option', { value: 'b' + i }, p.name)));
      custom.forEach((p, i) => og2.append(el('option', { value: 'c' + i }, p.name)));
      preset.append(og1); if (custom.length) preset.append(og2);
    }
    function loadPreset(p) {
      if (p.unit) st.unit = p.unit;
      if (p.snap) st.snap = p.snap;
      st.tab = p.tab;
      if (p.form) { const f = DEFAULT_STATE().form; st.form = deepAssign(f, JSON.parse(JSON.stringify(p.form))); }
      if (p.notation != null) st.notation = p.notation;
      if (p.intervals) st.intervals = deepAssign(DEFAULT_STATE().intervals, JSON.parse(JSON.stringify(p.intervals)));
      render();
    }
    preset.addEventListener('change', () => {
      const v = preset.value; if (!v) return;
      const p = v[0] === 'b' ? SG.PRESETS[+v.slice(1)] : SG.loadCustom()[+v.slice(1)];
      if (p) loadPreset(p);
      preset.value = '';
    });
    presetMenu.addEventListener('click', () => SG.presetActions(presetMenu, st, { fillPresets, loadPreset, toast: opts.toast }));

    function render() {
      tabs.textContent = ''; tabBody.textContent = '';
      for (const id of ['form', 'notation', 'intervals']) {
        const b = el('button', { type: 'button', role: 'tab', class: 'sgd-tab' + (st.tab === id ? ' sgd-on' : ''), 'aria-selected': String(st.tab === id), 'data-tab': id }, tr('ui.guides.tab_' + id));
        b.addEventListener('click', () => { if (id === 'notation' && st.tab === 'form' && opts.formToNotation !== false && SG.formHasGrid(st.form)) st.notation = SG.formToNotation(Object.assign({ unit: st.unit, snap: st.snap }, st.form)); st.tab = id; render(); });
        tabs.append(b);
      }
      bodies[st.tab] = SG.buildTab(st.tab, st, update, el);
      tabBody.append(bodies[st.tab]);
      unit.value = st.unit; snap.value = st.snap; live.checked = st.live;
      fillTargets();
      update();
    }
    target.addEventListener('change', () => { st.target = target.value; update(); });
    unit.addEventListener('change', () => { st.unit = unit.value; update(); });
    snap.addEventListener('change', () => { st.snap = snap.value; update(); });
    live.addEventListener('change', () => { st.live = live.checked; update(); });
    btnApply.addEventListener('click', () => { const r = compute(); if (r.guides.length) opts.apply(r.guides, { mode: 'add' }); });
    btnReplace.addEventListener('click', () => { const r = compute(); if (r.guides.length) opts.apply(r.guides, { mode: 'replace' }); });
    btnClear.addEventListener('click', () => { if (opts.clear) opts.clear(); });
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); api.close(); }
      else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !btnApply.disabled) { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); btnApply.click(); }
    });
    close.addEventListener('click', () => api.close());
    dragBy(head, box);

    document.body.append(box);
    fillPresets(); render();
    const offLang = root.SlopI18n && root.SlopI18n.on ? root.SlopI18n.on(() => { words(); fillPresets(); render(); }) : null;
    const api = {
      el: box, state: st,
      refresh() { fillTargets(); update(); },
      guides: () => compute().guides,
      set(patch) { deepAssign(st, patch); render(); },
      close() { if (!box.isConnected) return; cancelAnimationFrame(raf); if (offLang) offLang(); box.remove(); current = null; if (opts.preview) opts.preview(null); if (opts.onClose) opts.onClose(); },
    };
    current = api;
    requestAnimationFrame(() => { const f = box.querySelector('.sgd-tabbody input, .sgd-tabbody textarea'); if (f && root.innerWidth > 700) f.focus({ preventScroll: true }); });
    return api;
  }
  /** touch-ok: the panel's head has touch-action: none (guides.css .sgd-head), so a finger moves the panel. */
  function dragBy(handle, box) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = box.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      const mv = (ev) => { box.classList.add('sgd-moved'); box.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - sx)) + 'px'; box.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - sy)) + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto'; };
      handle.addEventListener('pointermove', mv);
      const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
      handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  }
  SG.formHasGrid = (f) => !!(f && (+f.cols.count || +f.rows.count || ['top', 'right', 'bottom', 'left'].some((k) => parseFloat(f.margins[k]))));
  SG.openPanel = openPanel;
  Object.defineProperty(SG, 'panel', { get: () => current, configurable: true });
})(window);
