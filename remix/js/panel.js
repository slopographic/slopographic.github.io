/* Reel Remix: the DOM for the keyframe row (under the preview, for the selected slot), the effect layer's options and
   Reset all. The edits are in keys.js and core.js; this file draws them and wires the controls. Keys: a marker per key on
   the slot's window (drag it, or Left and Right keys; Delete removes the selected key). Exposes RM.panel. */
(function () {
  'use strict';
  const RM = window.RM, SV = window.SlopVideo, KF = SV.keys, FX = SV.effects, $ = (id) => document.getElementById(id), tx = RM.t;
  const P = (RM.panel = {});
  const say = (msg) => { if (RM.say) RM.say(msg); };

  /** After a key or effect edit: repaint the frame and, when asked, redraw the lists. */
  P.changed = function (redraw = true) {
    RM.preview.draw(RM.preview.t);
    if (redraw) { P.renderKeys(); if (RM.renderPlan) RM.renderPlan(); }
  };
  /** One marker per key on the track of the selected slot (its window is the track's width). */
  function markers(cur) {
    const track = $('rm-ktrack');
    track.replaceChildren(...cur.keys.map((k, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rm-kkey' + (i === RM.state.selKey ? ' on' : '');
      b.setAttribute('data-touch-hit', ''); // a 44 px grab area for a finger (shared/input/touch.css); touch-ok: .rm-kkey has touch-action: none
      b.style.left = (cur.span > 0 ? (k.t / cur.span) * 100 : 0) + '%';
      b.title = tx('remix.keys.key_tip', { n: i + 1, t: k.t.toFixed(2) });
      b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(i === RM.state.selKey));
      b.addEventListener('pointerdown', (e) => dragKey(e, i, cur));
      b.addEventListener('keydown', (e) => keyKey(e, i, cur));
      return b;
    }));
  }
  /** Drag a key along the track: the key moves between its neighbours; the frame repaints as it moves. */
  function dragKey(e, i, cur) {
    const b = e.currentTarget, track = $('rm-ktrack');
    RM.state.selKey = i; b.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = track.getBoundingClientRect();
      const t = Math.round((((ev.clientX - r.left) / Math.max(1, r.width)) * cur.span) * 100) / 100;
      RM.keys.move(i, t);
      const k = KF.get(RM.state.keys, cur.ci, cur.item.slot)[i];
      if (k) b.style.left = (k.t / cur.span) * 100 + '%';
      P.changed(false);
    };
    const up = () => { b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up); P.renderKeys(); };
    b.addEventListener('pointermove', move); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  function keyKey(e, i, cur) {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); RM.keys.remove(i); say(tx('remix.keys.key_n_deleted', { n: i + 1 })); P.changed(); return; }
    const step = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
    if (!step) return;
    e.preventDefault();
    RM.state.selKey = i; RM.keys.move(i, cur.keys[i].t + step); P.changed();
    const b = $('rm-ktrack').children[i]; if (b) b.focus();
  }
  /** The keyframe row: the slot selector, the markers, the selected key's ease and the buttons. */
  P.renderKeys = function () {
    const st = RM.state, plan = st.plan, cur = RM.keys.current();
    const ci = RM.keys.cutAt(RM.preview.t), beat = plan && ci >= 0 ? plan.cuts[ci] : [];
    const slots = $('rm-kslot');
    slots.replaceChildren(...beat.map((x) => new Option(tx('remix.ui.slot_btn', { n: x.slot + 1 }), String(x.slot))));
    if (cur) slots.value = String(cur.item.slot);
    const on = !!cur;
    // rm-ksave is made in the setup code below, so it may not exist yet when the first render runs.
    ['rm-kslot', 'rm-kease', 'rm-kadd', 'rm-kdel', 'rm-kpreset', 'rm-kanim', 'rm-kreset', 'rm-ksave'].forEach((id) => { const el = $(id); if (el) el.disabled = !on; });
    $('rm-ktrack').classList.toggle('off', !on);
    if (!on) { $('rm-ktrack').replaceChildren(); $('rm-kinfo').textContent = tx(plan ? 'remix.keys.outside' : 'remix.keys.plan_first'); return; }
    markers(cur);
    const sel = cur.keys[st.selKey];
    $('rm-kease').value = sel ? sel.ease : 'linear';
    $('rm-kinfo').textContent = tx('remix.keys.info', { cut: ci + 1, slot: cur.item.slot + 1, keys: tx('remix.keys.keys_n', { n: cur.keys.length }), span: cur.span.toFixed(2) }) +
      (sel ? ' · ' + tx('remix.keys.sel', { n: st.selKey + 1, t: sel.t.toFixed(2) }) : '');
  };
  /** The effect layer's controls, from the state. */
  P.effectControls = function () {
    const e = RM.state.effect;
    $('rm-fx').value = e.kind; $('rm-fxchange').value = e.change;
    $('rm-fxint').value = String(Math.round(e.intensity * 100)); $('rm-fxval').textContent = Math.round(e.intensity * 100) + '%';
    $('rm-fxchange').disabled = e.kind !== 'random';
  };
  /** The effect layer's row at the foot of the cut list (unnumbered, so the cuts keep their numbers). */
  P.effectRow = function () {
    const e = RM.state.effect, li = document.createElement('li');
    li.className = 'rm-fxrow';
    const when = e.kind === 'random' ? ', ' + tx(e.change === 'reel' ? 'remix.keys.fx_reel' : 'remix.keys.fx_cut') : '';
    li.textContent = tx('remix.keys.fx_row', { fx: FX.name(e.kind) }) + (e.kind === 'none' ? '' : ' · ' + Math.round(e.intensity * 100) + '%' + when);
    return li;
  };
  /** Sets the plan's option controls from the state (after Reset all). */
  P.sync = function () {
    const st = RM.state, set = (id, v) => { const el = $(id); if (el) el.value = String(v); };
    set('rm-target', st.target); set('rm-pace', st.pace); set('rm-fill', st.fill); set('rm-timing', st.timing); set('rm-vtiming', st.video);
    set('rm-lmin', st.min); set('rm-lmax', st.max); set('rm-stagger', st.stagger); set('rm-audio', st.audioMode); set('rm-base', st.base);
    $('rm-random').checked = st.random;
    RM.GRIDS.forEach((g) => { const cb = $('rm-g-' + g); if (cb) cb.checked = st.grids.includes(g); });
    P.effectControls();
  };
  /** Wires the keyframe row and the effect controls. Called once by ui.js. */
  P.init = function () {
    const lists = () => {   // again after a language change, keeping the choices
      const keep = ['rm-fx', 'rm-fxchange', 'rm-kease'].map((id) => $(id).value);
      $('rm-fx').replaceChildren(...FX.KINDS.map(([v, l]) => new Option(l, v)));
      $('rm-fxchange').replaceChildren(...FX.CHANGE.map(([v, l]) => new Option(l, v)));
      $('rm-kease').replaceChildren(...KF.EASES.map(([v, l]) => new Option(l, v)));
      ['rm-fx', 'rm-fxchange', 'rm-kease'].forEach((id, i) => { if (keep[i]) $(id).value = keep[i]; });
    };
    lists();
    /* Animate in choices: the shared motion library when it is on the page (refreshed when presets change), else the built-ins. */
    const presetOptions = () => (window.SlopPresets ? SlopPresets.list({ kind: 'motion', app: 'remix' }).map((p) => new Option(p.label, p.id)) : KF.ANIMATE.map(([v, l]) => new Option(l, v)));
    const fillPresets = () => $('rm-kpreset').replaceChildren(...presetOptions());
    fillPresets();
    window.addEventListener('slop-presets:change', fillPresets);
    if (window.SlopPresets) SlopPresets.useDrive().catch(() => null);
    const saveKeys = document.createElement('button');
    saveKeys.type = 'button'; saveKeys.id = 'rm-ksave'; saveKeys.className = 'rm-btn';
    saveKeys.title = tx('remix.keys.save_tip'); saveKeys.dataset.i18nAttr = 'title:remix.keys.save_tip';
    saveKeys.textContent = tx('remix.keys.save'); saveKeys.dataset.i18n = 'remix.keys.save';
    $('rm-kanim').after(saveKeys);
    saveKeys.addEventListener('click', () => {
      if (!window.SlopPresets) return;
      const cur = RM.keys.current();
      SlopPresets.openSave({ app: 'remix', apps: SlopPresets.MOTION_APPS, kinds: ['motion'], title: tx('remix.keys.save_title'), build: () => (cur ? RM.keys.motionParams(cur.keys) : null) });
    });
    $('rm-kslot').addEventListener('change', (e) => { RM.state.kslot = +e.target.value; RM.state.selKey = 0; P.renderKeys(); });
    $('rm-kease').addEventListener('change', (e) => { RM.keys.setEase(RM.state.selKey, e.target.value); P.changed(false); P.renderKeys(); say(tx('remix.keys.ease', { ease: e.target.options[e.target.selectedIndex].text })); });
    $('rm-kadd').addEventListener('click', () => { if (RM.keys.addAtPlayhead()) { P.changed(); say(tx('remix.keys.added')); } });
    $('rm-kdel').addEventListener('click', () => { if (RM.keys.remove(RM.state.selKey)) { P.changed(); say(tx('remix.keys.deleted')); } });
    $('rm-kanim').addEventListener('click', () => { const name = $('rm-kpreset').value; if (RM.keys.animateIn(name)) { P.changed(); say(tx('remix.keys.animated', { name: $('rm-kpreset').options[$('rm-kpreset').selectedIndex].text, s: KF.ANIM_SECONDS })); } });
    $('rm-kreset').addEventListener('click', () => { if (RM.keys.reset()) { P.changed(); say(tx('remix.keys.reset')); } });
    $('rm-fx').addEventListener('change', (e) => { RM.setEffect({ kind: e.target.value }); P.effectControls(); P.changed(); say(tx('remix.keys.effect', { fx: FX.name(RM.state.effect.kind) })); });
    $('rm-fxchange').addEventListener('change', (e) => { RM.setEffect({ change: e.target.value }); P.changed(); say(tx('remix.keys.fx_changes', { when: e.target.options[e.target.selectedIndex].text })); });
    $('rm-fxint').addEventListener('input', (e) => { RM.setEffect({ intensity: +e.target.value / 100 }); P.effectControls(); P.changed(false); });
    $('rm-fxint').addEventListener('change', (e) => { RM.setEffect({ intensity: +e.target.value / 100 }); P.effectControls(); P.changed(); });
    $('rm-fxreset').addEventListener('click', () => { RM.setEffect(FX.DEFAULT); P.effectControls(); P.changed(); say(tx('remix.keys.fx_reset')); });
    $('rm-resetall').addEventListener('click', () => { RM.resetAll(); P.sync(); if (RM.renderPlan) RM.renderPlan(); say(tx('remix.keys.reset_all')); });
    P.effectControls();
    P.renderKeys();
    RM.onLang(() => { lists(); fillPresets(); P.effectControls(); });
  };
})();
