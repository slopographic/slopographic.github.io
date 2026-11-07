/* SlopCut: inspector sections for keyframes ("Animation": animate-in presets, keys at the playhead, one key track
   per property under the clip, and the selected key's editor) and for the random effect layer ("Random effect").
   Both register with I.track so they refresh with the model; the key track does not redraw while a key is dragged. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, F = SE.fields, I = SE.inspector, AN = SE.anim, FX = SE.fx;
  const SV = window.SlopVideo;
  const h = U.h, pl = (prop, P) => U.w('prop', prop, P.label);   // a property's name in the chosen language

  I.animSection = function (c) {
    const id = c.id;
    let sel = null, dragging = false;
    const box = h('div', { class: 'anim' });
    const cur = () => M.clip(SE.doc, id);
    const fps = () => SE.doc.fps;

    /** One track: diamonds for the keys of one property along the clip. Click the empty lane to move the playhead. */
    function lane(clip, prop, dur) {
      const P = AN.PROPS[prop], L = h('div', { class: 'anim-lane', title: U.t('slopedit.insp.click_to_move_the_playhead') });
      L.addEventListener('pointerdown', (e) => {
        if (e.target !== L || e.button !== 0) return;
        const r = L.getBoundingClientRect(), t = clip.start + ((e.clientX - r.left) / r.width) * dur;
        SE.player.seek(U.snapFrame(U.clamp(t, clip.start, clip.start + dur), fps()));
      });
      ((clip.anim && clip.anim[prop]) || []).forEach((k, idx) => {
        const on = sel && sel.prop === prop && sel.idx === idx;
        const b = h('button', { type: 'button', class: 'anim-key' + (on ? ' on' : ''), style: { left: (k.t / dur) * 100 + '%' }, title: U.t('slopedit.insp.key_at_drag', { what: pl(prop, P), t: U.round(k.t, 2) }), 'aria-label': U.t('slopedit.insp.key_at', { what: pl(prop, P), t: U.round(k.t, 2) }) });
        b.addEventListener('pointerdown', (e) => keyDown(e, b, prop, idx, dur, L));
        L.append(b);
      });
      return h('div', { class: 'anim-row' }, h('span', { class: 'anim-name' }, pl(prop, P)), L);
    }
    function keyDown(e, b, prop, idx, dur, L) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      sel = { prop, idx };
      box.querySelectorAll('.anim-key.on').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      const r = L.getBoundingClientRect(), x0 = e.clientX, t0 = cur().anim[prop][idx].t, step = 1 / fps();
      let last = t0;
      dragging = true;
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event: no active pointer */ } // touch-ok: .anim-key has touch-action: none and a 44 px hit area (css/anim.css)
      const move = (ev) => {
        const t = Math.round((t0 + ((ev.clientX - x0) / r.width) * dur) / step) * step;
        if (Math.abs(t - last) < 1e-9) return;
        last = t;
        SE.change(U.t('slopedit.insp.move_key'), (p) => AN.moveKey(M.clip(p, id), prop, idx, t), { key: 'anim:move:' + id + prop + idx });
      };
      const up = () => {
        b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up);
        dragging = false; SE.history.breakCoalescing(); paint();
      };
      b.addEventListener('pointermove', move); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
    /** The editor of the selected key: value, time, ease, delete. */
    function editor(clip) {
      if (!sel) return h('p', { class: 'ins-note' }, U.t('slopedit.insp.click_a_key_to_edit'));
      const { prop, idx } = sel, k = clip.anim[prop][idx], P = AN.PROPS[prop];
      const pct = prop === 'scale' || prop === 'opacity';
      const commit = (label, fn, key) => { SE.change(label, (p) => fn(M.clip(p, id)), { key }); SE.history.breakCoalescing(); };
      const val = h('input', { class: 'inp', type: 'number', step: 1, 'aria-label': U.t('slopedit.insp.key_value_of', { what: pl(prop, P) }), value: String(U.round(pct ? k.value * 100 : k.value, 2)) });
      val.addEventListener('change', () => {
        if (val.value === '' || !isFinite(+val.value)) return;
        const v = U.clamp(+val.value, pct ? 0 : -1e6, pct ? (prop === 'scale' ? SE.fit.SCALE.max * 100 : 100) : 1e6);
        commit(U.t('slopedit.insp.key_value'), (c) => AN.setValue(c, prop, idx, pct ? v / 100 : v), 'anim:val:' + id + prop + idx);
      });
      const time = h('input', { class: 'inp', type: 'number', min: 0, max: U.round(clip.dur, 3), step: 1 / fps(), 'aria-label': U.t('slopedit.insp.key_time_s_from_clip'), value: String(U.round(k.t, 3)) });
      time.addEventListener('change', () => {
        if (time.value === '' || !isFinite(+time.value)) return;
        commit(U.t('slopedit.insp.key_time'), (c) => { sel.idx = AN.moveKey(c, prop, idx, +time.value); });
      });
      const ease = h('select', { class: 'inp', 'aria-label': U.t('slopedit.insp.easing_from_this_key') }, U.wl('ease', AN.EASES).map(([v, l]) => h('option', { value: v }, l)));
      ease.value = k.ease || 'linear';
      ease.addEventListener('change', () => commit(U.t('slopedit.insp.easing'), (c) => AN.setEase(c, prop, idx, ease.value)));
      const del = h('button', { type: 'button', class: 'btn sm' }, SE.icon('trash'), U.t('slopedit.insp.delete_key')); // i18n-ignore: class names
      del.addEventListener('click', () => { sel = null; commit(U.t('slopedit.insp.delete_key'), (c) => AN.removeKey(c, prop, idx)); });
      return h('div', { class: 'anim-edit' },
        h('div', { class: 'ins-row' }, h('span', null, pl(prop, P) + ' ' + (pct ? '(%)' : P.unit ? '(' + P.unit + ')' : '')), val),
        h('div', { class: 'ins-row' }, h('span', null, U.t('slopedit.insp.time_s')), time),
        h('div', { class: 'ins-row' }, h('span', null, U.t('slopedit.insp.easing')), ease),
        h('div', { class: 'ins-actions' }, del));
    }
    function paint() {
      const clip = cur();
      if (!clip) { box.replaceChildren(); return; }
      if (sel && !(clip.anim && clip.anim[sel.prop] && clip.anim[sel.prop][sel.idx])) sel = null;
      const dur = Math.max(1e-3, clip.dur), n = AN.KEYS.reduce((s, k) => s + ((clip.anim && clip.anim[k]) || []).length, 0);
      box.replaceChildren(
        h('div', { class: 'anim-presets' }, AN.PRESETS.map(([pid, en]) => { const label = U.w('anim', pid, en); return h('button', { type: 'button', class: 'btn sm', title: U.t('slopedit.insp.writes_keys_over_the_first'), onclick: () => SE.change(label, (p) => AN.applyPreset(M.clip(p, id), pid, p.w, p.h)) }, label); })), // i18n-ignore: class names
        h('div', { class: 'ins-actions' },
          h('button', { type: 'button', class: 'btn sm', onclick: () => SE.cmd.run('clip.keyPlayhead') }, SE.icon('marker'), U.t('slopedit.insp.key_at_playhead')), // i18n-ignore: class names
          h('button', { type: 'button', class: 'btn sm', disabled: n ? null : 'disabled', onclick: () => { sel = null; SE.act.resetKeys([id]); } }, U.t('slopedit.cmd.reset_keyframes'))), // i18n-ignore: class names
        h('div', { class: 'anim-tracks' }, AN.KEYS.map((prop) => lane(clip, prop, dur))),
        h('div', { class: 'anim-axis' }, h('span', null, '0 s'), h('span', null, U.timecode(dur, fps()))),
        editor(clip),
        h('p', { class: 'ins-note' }, n + ' keys. X, Y and rotation add to the transform above; scale and opacity multiply it. Keys hold their end value before and after.'));
    }
    paint();
    I.track({ sync: () => { if (!dragging) paint(); } });
    return F.section(U.t('slopedit.insp.animation'), 'sparkle', box);
  };

  /** The random effect layer: effect types, intensity, how often the effect changes, seed, reset. */
  I.effectSection = function (c) {
    const id = c.id, t = I.track;
    const fx = () => ((M.clip(SE.doc, id) || {}).fx) || M.fxDefault();
    const setFx = (label, fn, key) => SE.change(label, (p) => { const cc = M.clip(p, id); if (cc) { cc.fx = cc.fx || M.fxDefault(); fn(cc.fx); } }, key ? { key: 'fx:' + id + key } : undefined);
    const after = () => SE.history.breakCoalescing();
    const seedTxt = h('input', { class: 'inp', type: 'text', maxlength: '8', 'aria-label': U.t('slopedit.insp.seed_hex'), spellcheck: 'false' });
    seedTxt.addEventListener('change', () => { const s = SV.seed.parse(seedTxt.value); setFx(U.t('slopedit.insp.seed'), (f) => { f.seed = s; }); after(); });
    const seedRow = { el: h('label', { class: 'ins-row' }, h('span', { title: U.t('slopedit.insp.the_same_seed_and_settings') }, U.t('slopedit.insp.seed')), seedTxt), sync: () => { if (document.activeElement !== seedTxt) seedTxt.value = SV.seed.hex(fx().seed); } };
    return F.section(U.t('slopedit.fx.random_effect'), 'sparkle',
      t(F.chips(U.t('slopedit.app.effects'), FX.TYPES, () => fx().types, (v) => {
        setFx(U.t('slopedit.insp.effect_types'), (f) => { f.types = f.types.includes(v) ? f.types.filter((x) => x !== v) : FX.TYPES.map(([k]) => k).filter((k) => k === v || f.types.includes(k)); });
        after();
      })),
      t(F.slider(U.t('slopedit.insp.intensity'), () => fx().intensity, (v) => setFx(U.t('slopedit.insp.effect_intensity'), (f) => { f.intensity = U.round(v, 3); }, 'int'), { min: 0, max: 100, step: 1, scale: 100, unit: '%', reset: 0.6, hardMin: 0, hardMax: 100 })),
      t(F.select(U.t('slopedit.insp.change_every'), U.wl('every', FX.EVERY).map(([v, l]) => [String(v), l]), () => String(fx().every), (v) => { setFx(U.t('slopedit.insp.change_every'), (f) => { f.every = +v; }); after(); })),
      t(seedRow),
      h('p', { class: 'ins-note' }, U.t('slopedit.insp.one_effect_is_drawn_per')),
      h('div', { class: 'ins-actions' },
        h('button', { type: 'button', class: 'btn sm', onclick: () => setFx(U.t('slopedit.insp.new_seed'), (f) => { f.seed = SV.seed.make(); }) }, SE.icon('sparkle'), U.t('slopedit.insp.new_seed')), // i18n-ignore: class names
        h('button', { type: 'button', class: 'btn sm', onclick: () => SE.act.resetEffect([id]) }, U.t('slopedit.insp.reset_effect')))); // i18n-ignore: class names
  };
})();
