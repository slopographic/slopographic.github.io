/* Reel Remix: the page. Wires the bin (drop or pick clips and photos, drag them onto the stage), the controls (target
   length, pace, export preset, fill, layout, Random, seed), Remix and Reshuffle, the preview with Play, Export and
   Send to SlopCut, the Layout lane (click or drag to scrub) and the cut list (per-cut fill, drop targets). Everything
   here is the DOM side; the plan, the state and the manifest are in core.js. */
(function () {
  'use strict';
  const RM = window.RM, SV = window.SlopVideo, $ = (id) => document.getElementById(id), S = SV.seed, tx = RM.t;
  const fmt = (s) => { const t = Math.max(0, s), m = Math.floor(t / 60), r = (t - m * 60).toFixed(1); return m + ':' + (r.length < 4 ? '0' : '') + r; };
  const LOCK_SVG = '<svg class="rm-lock" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 0 0-4 0v2z" fill="currentColor"/></svg>';
  const FILL_LABELS = () => ['auto', 'cover', 'fit', 'stretch', 'blur'].map((v) => [v, tx('remix.fill.' + v)]);

  function status(msg) { $('rm-status').textContent = msg; }
  /** Fill a select from [value, label] pairs, keeping the value when it is still there. */
  function fill(sel, list, value) {
    sel.replaceChildren(...list.map(([v, l]) => new Option(l, v)));
    if (list.some(([v]) => v === value)) sel.value = value;
  }
  function renderBin() {
    const ul = $('rm-bin'), st = RM.state;
    $('rm-count').textContent = tx('remix.ui.items_n', { n: st.items.length });
    ul.replaceChildren(...st.items.map((it) => {
      const li = document.createElement('li');
      li.dataset.id = it.id;
      li.draggable = !it.missing; li.title = it.missing ? tx('remix.ui.missing_tip') : tx('remix.ui.drag_tip');
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData(RM.ITEM_MIME, it.id); e.dataTransfer.setData('text/plain', it.name);
        e.dataTransfer.effectAllowed = 'copy';
      });
      const name = document.createElement('span');
      name.className = 'rm-name'; name.textContent = (it.missing ? tx('remix.ui.missing') + ' · ' : '') + it.name + ' · ' + (it.kind === 'video' ? fmt(it.dur) : tx('remix.ui.photo')) + (it.w && it.h ? ' · ' + tx('remix.orient.' + SV.orient.classify(it.w / it.h)) : '');
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'rm-x'; rm.textContent = '×'; rm.title = tx('remix.ui.remove', { name: it.name }); rm.setAttribute('aria-label', rm.title);
      rm.onclick = () => { RM.removeItem(it.id); renderBin(); status(tx('remix.ui.removed', { name: it.name })); };
      li.append(name, rm);
      return li;
    }));
    if (!st.items.length) ul.append(Object.assign(document.createElement('li'), { className: 'rm-empty', textContent: tx('remix.ui.empty') }));
    if (dropZone) dropZone.empty(!st.items.length); // the preview and the sample are for an empty bin
  }
  /** One cut in the cut list: its items (each a drop target for a clip) and its fill. */
  function cutItem(beat, i, st) {
    const li = document.createElement('li');
    const locked = beat.every((x) => SV.locks.has(st.locks, i, x.slot));
    if (locked) li.classList.add('locked');
    const lk = document.createElement('button');
    lk.type = 'button'; lk.className = 'rm-lockbtn'; lk.innerHTML = LOCK_SVG;
    lk.title = locked ? tx('remix.ui.unlock_cut', { n: i + 1 }) : tx('remix.ui.lock_cut', { n: i + 1 });
    lk.setAttribute('aria-label', lk.title); lk.setAttribute('aria-pressed', String(locked));
    lk.onclick = () => { RM.toggleCutLock(i); renderPlan(); status(tx(locked ? 'remix.ui.cut_unlocked' : 'remix.ui.cut_locked', { n: i + 1 })); };
    li.draggable = true; li.dataset.cut = String(i);
    li.addEventListener('dragstart', (e) => RM.moves.cutDragStart(e, i, li));
    li.addEventListener('dragover', (e) => RM.moves.cutDragOver(e, li));
    li.addEventListener('dragleave', () => { delete li.dataset.drop; });
    li.addEventListener('drop', (e) => { delete li.dataset.drop; RM.moves.cutDrop(e, i); }); // intake-ok: a cut moved in the list
    li.append(lk, ' ' + (i + 1) + '. ');
    beat.forEach((x, k) => {
      if (k) li.append(' | ');
      const m = st.items.find((q) => q.id === x.media);
      const span = document.createElement('span');
      span.className = 'rm-cut-item';
      span.textContent = (m ? m.name : '?') + ' (' + tx('remix.ui.slot_n', { n: x.slot + 1 }) + (st.timing !== 'same' || (m && m.kind === 'video' && st.video === 'random') ? ', ' + fmt(x.start) + '–' + fmt(x.start + x.dur) : '') + ')';
      RM.dnd.cutTargets(span, i, x.slot);
      li.append(span);
    });
    const fx = st.plan && st.plan.effect ? SV.effects.at(st.plan.effect, i) : null;
    if (fx) li.append(' · fx ' + SV.effects.name(fx.kind));
    const sel = document.createElement('select');
    sel.className = 'rm-cutfill'; sel.setAttribute('aria-label', tx('remix.ui.fill_for', { n: i + 1 }));
    fill(sel, FILL_LABELS(), beat[0].fill || 'auto');
    sel.addEventListener('change', () => { RM.setCutFill(i, sel.value); renderPlan(); status(tx('remix.ui.cut_fill', { n: i + 1, fill: sel.options[sel.selectedIndex].text })); });
    li.append(' · ' + fmt(beat[0].start) + ' ', sel);
    if (locked) li.append(' ', Object.assign(document.createElement('span'), { className: 'rm-lockbadge', textContent: tx('remix.ui.locked') }));
    return li;
  }
  /** Show the plan: the cut list, the total, the lane and the scrubber range. */
  function renderPlan() {
    const st = RM.state, plan = st.plan;
    const cuts = $('rm-cuts');
    $('rm-scrub').max = String(plan ? plan.total : 0);
    $('rm-total').textContent = plan ? tx('remix.ui.total', { total: fmt(plan.total), target: fmt(st.target), layouts: tx('remix.ui.layouts_n', { n: plan.segments.length }), seed: plan.seedHex }) : tx('remix.ui.nothing');
    cuts.replaceChildren(...(plan ? plan.cuts.map((beat, i) => cutItem(beat, i, st)) : []), RM.panel.effectRow());
    RM.lane.update({ duration: plan ? plan.total : st.target, switches: st.lane, layouts: RM.layoutChoices, playhead: st.playhead });
    RM.preview.setPlan();
    RM.preview.seek(Math.min(st.playhead, plan ? plan.total : 0));
    slotsCut = -2; renderSlots();
    RM.panel.renderKeys();
  }
  function readControls() {
    const st = RM.state;
    st.target = Math.min(600, Math.max(1, +$('rm-target').value || 30));
    st.pace = $('rm-pace').value;
    st.preset = $('rm-preset').value;
    st.custom = { w: +$('rm-cw').value || 1080, h: +$('rm-ch').value || 1920 };
    st.base = $('rm-base').value;
    st.fill = $('rm-fill').value;
    st.timing = $('rm-timing').value; st.video = $('rm-vtiming').value;
    st.min = +$('rm-lmin').value || 1; st.max = +$('rm-lmax').value || 3;
    st.stagger = $('rm-stagger').value === '' ? 1 : Math.max(0, +$('rm-stagger').value || 0);
    st.audioMode = $('rm-audio').value; st.audioTrack = $('rm-track').value || 'random';
    st.photo = { show: $('rm-pshow').value, sec: +$('rm-psec').value || 3, min: +$('rm-pmin').value || 2, max: +$('rm-pmax').value || 4,
      from: Math.max(0, +$('rm-pfrom').value || 0), to: Math.max(0, +$('rm-pto').value || 0), enter: $('rm-penter').value, exit: $('rm-pexit').value };
    st.clipVideo = { mode: $('rm-vmode').value, start: Math.max(0, +$('rm-vstart').value || 0), stop: Math.max(0, +$('rm-vstop').value || 0), speed: +$('rm-vspeed').value || 1 };
    st.random = $('rm-random').checked;
    st.grids = RM.GRIDS.filter((g) => $('rm-g-' + g).checked);
    const seed = S.parse($('rm-seed').value);
    st.seed = seed;
    $('rm-seed').value = S.hex(seed);
    $('rm-custom').hidden = st.preset !== SV.presets.CUSTOM;
    $('rm-size').textContent = RM.size().w + '×' + RM.size().h + ' · ' + RM.aspect(RM.size());
  }
  /** Remix: plan a new edit with the current options (the seed shown is used). */
  function remix(fresh) {
    readControls();
    if (fresh) { RM.state.seed = S.make(); $('rm-seed').value = S.hex(RM.state.seed); }
    const plan = RM.remix();
    if (!plan) { status(tx(RM.media().length ? 'remix.ui.unusable' : 'remix.ui.add_first')); RM.state.plan = null; renderPlan(); return null; }
    RM.lane.update({ switches: RM.state.lane });
    $('rm-seed').value = S.hex(RM.state.seed);
    renderPlan();
    status(tx('remix.ui.remixed', { total: fmt(plan.total), n: plan.cuts.length, seed: plan.seedHex }));
    return plan;
  }
  RM.remixNow = remix;
  RM.reshuffleNow = function () { readControls(); RM.reshuffle(); $('rm-seed').value = S.hex(RM.state.seed); renderPlan(); status(tx('remix.ui.reshuffled', { seed: S.hex(RM.state.seed) })); return RM.state.plan; };

  // The way in is the intake (js/intake.js); this is what a batch and the music file do here, and the zone's look.
  let dropZone = null;
  function batchDone(sum, missingBefore) {
    if (RM.auto) RM.auto.batchDone(sum); // the batch's clips are in the bin now: pending for auto remix
    const filled = missingBefore - RM.state.items.filter((x) => x.missing).length;
    renderBin();
    if (filled > 0) { remix(); status(tx('remix.ui.filled', { n: filled })); }
    else if (sum.added.length) status(tx('remix.ui.added', { n: sum.added.length }));
  }
  function wireDrop() {
    RM.intake.register({ done: batchDone, music: (f) => { RM.setMusic(f); $('rm-audio').value = 'music'; readControls(); renderTracks(); RM.audioChanged(); status(tx('remix.ui.music', { name: f.name })); } });
    dropZone = SlopDrop.attach($('rm-drop'), {
      intake: 'remix',
      targets: [$('rm-bin'), $('rm-stage')],
      preview: { picture: { src: '../assets/shots/remix.jpg', alt: 'remix.ui.shot_alt' }, steps: STEPS },
      sample: { label: 'remix.ui.sample', files: async () => { const S = window.SlopSamples; status(tx('remix.ui.sample_making')); // painted in the page (shared/samples)
        return (await Promise.all([S.media.clip(4, { scene: 'hills', width: 480, height: 640 }), S.media.clip(4, { scene: 'sea', width: 480, height: 640 }), S.photos(3, { width: 900, height: 1200 })])).flat(); } },
      reveal: (sum) => document.querySelector('#rm-bin li[data-id="' + sum.added[sum.added.length - 1].value + '"]'),
    });
    // the zone's own words follow a language change through data-i18n (SlopI18n.apply)
    document.querySelectorAll('#rm-drop .sd-steps li').forEach((li, i) => { li.dataset.i18n = STEPS[i]; }); const smp = document.querySelector('#rm-drop .sd-sample'); if (smp) smp.dataset.i18n = 'remix.ui.sample';
  }
  const STEPS = ['remix.ui.step_drop', 'remix.ui.step_remix', 'remix.ui.step_play'];
  /** After a config import: the controls show the state, and the bin, the plan and the lane are drawn again. */
  RM.syncUI = function () {
    const st = RM.state;
    $('rm-target').value = String(st.target);
    $('rm-pace').value = st.pace; $('rm-preset').value = st.preset; $('rm-fill').value = st.fill;
    $('rm-timing').value = st.timing; $('rm-vtiming').value = st.video;
    $('rm-lmin').value = String(st.min); $('rm-lmax').value = String(st.max); $('rm-stagger').value = String(st.stagger);
    $('rm-audio').value = st.audioMode; renderTracks();
    $('rm-cw').value = String(st.custom.w); $('rm-ch').value = String(st.custom.h);
    $('rm-base').value = st.base; $('rm-random').checked = st.random; gridBoxes();
    $('rm-seed').value = S.hex(st.seed);
    if (RM.lane) RM.lane.update({ switches: st.lane });
    renderBin(); renderPlan();
  };
  function gridBoxes() {
    const wrap = $('rm-grids');
    wrap.replaceChildren(...RM.GRIDS.map((g) => {
      const l = document.createElement('label');
      l.className = 'rm-chk';
      const cb = Object.assign(document.createElement('input'), { type: 'checkbox', id: 'rm-g-' + g, checked: true });
      cb.addEventListener('change', readControls);
      l.append(cb, ' ' + tx('remix.ui.grid_cells', { name: SV.templates.get(g).name, n: SV.templates.get(g).slots.length }));
      return l;
    }));
  }
  /** The audio track choices: random (seeded), each bin video's sound, and the picked music file. */
  function renderTracks() {
    const st = RM.state, list = [['random', tx('remix.ui.track_random')]]
      .concat(st.items.filter((m) => m.kind === 'video').map((m) => [m.id, m.name]))
      .concat(st.music ? [['file', tx('remix.ui.track_file', { name: st.music.name })]] : []);
    fill($('rm-track'), list, st.audioTrack);
    $('rm-music-name').textContent = st.music ? st.music.name : '';
  }
  /** Lock toggles for the slots of the cut at the playhead, under the preview. */
  let slotsCut = -2, keysCut = -2;
  function renderSlots() {
    const st = RM.state, plan = st.plan, t = RM.preview.t;
    let ci = -1;
    if (plan) plan.cuts.forEach((beat, i) => { if (beat.length && t >= beat[0].start && t < beat[0].start + beat[0].dur + 1e-6) ci = i; });
    if (ci === slotsCut) return;
    slotsCut = ci;
    const row = $('rm-slots');
    if (ci < 0) { row.replaceChildren(); return; }
    const btn = (label, title, fn, cls) => Object.assign(document.createElement('button'), { type: 'button', className: 'rm-btn rm-slotlock' + (cls || ''), innerHTML: label, title, onclick: fn });
    const head = Object.assign(document.createElement('span'), { className: 'rm-size', textContent: tx('remix.ui.cut_head', { n: ci + 1 }) });
    const reset = btn(tx('remix.ui.reset_pos'), tx('remix.ui.reset_pos_tip'), () => { RM.resetPan(ci); renderPlan(); status(tx('remix.ui.pos_reset', { n: ci + 1 })); });
    const out = [head, reset];
    for (const x of plan.cuts[ci]) {
      const on = SV.locks.has(st.locks, ci, x.slot), m = st.items.find((q) => q.id === x.media);
      const kind = m && m.kind === 'image' ? 'photo' : 'video', nm = m ? m.name : '?', kw = tx(kind === 'photo' ? 'remix.ui.kind_photo' : 'remix.ui.kind_video');
      out.push(btn(LOCK_SVG + ' ' + tx('remix.ui.slot_btn', { n: x.slot + 1 }), tx(on ? 'remix.ui.unlock_slot' : 'remix.ui.lock_slot', { slot: x.slot + 1, cut: ci + 1 }), () => {
        RM.toggleLock(ci, x.slot); slotsCut = -2; renderSlots(); renderPlan(); status(tx(on ? 'remix.ui.slot_unlocked' : 'remix.ui.slot_locked', { slot: x.slot + 1, cut: ci + 1 }));
      }, on ? ' on' : ''));
      const setFor = (key, what) => { RM.setOverride(key, kind); slotsCut = -2; renderSlots(); status(tx('remix.ui.uses_settings', { what, kind: kw })); };
      out.push(btn(tx('remix.ui.set_slot', { n: x.slot + 1 }), tx('remix.ui.set_slot_tip', { n: x.slot + 1, kind: kw }), () => setFor('s:' + x.slot, tx('remix.ui.slot_btn', { n: x.slot + 1 }))));
      if (m) out.push(btn(tx('remix.ui.set_clip', { name: nm }), tx('remix.ui.set_clip_tip', { name: nm, kind: kw }), () => setFor('m:' + m.id, nm)));
    }
    out.push(btn(tx('remix.ui.clear'), tx('remix.ui.clear_tip'), () => {
      for (const x of plan.cuts[ci]) { RM.clearOverride('s:' + x.slot); const m = st.items.find((q) => q.id === x.media); if (m) RM.clearOverride('m:' + m.id); }
      slotsCut = -2; renderSlots(); status(tx('remix.ui.cleared', { n: ci + 1 }));
    }));
    row.replaceChildren(...out);
  }
  function lists() { // the option lists, in the chosen language (again after a language change)
    const st = RM.state; // the shared lists carry their labels (ui.video.*), read again here
    fill($('rm-pace'), SV.random.PACES, st.pace);
    fill($('rm-preset'), SV.presets.choices(), st.preset);
    fill($('rm-fill'), FILL_LABELS(), st.fill);
    fill($('rm-timing'), SV.timing.MODES, st.timing);
    fill($('rm-vtiming'), SV.timing.VIDEO, st.video);
    fill($('rm-audio'), SV.audio.MODES, st.audioMode);
    fill($('rm-pshow'), SV.clipset.SHOW, st.photo.show);
    fill($('rm-penter'), SV.clipset.EDGE, st.photo.enter);
    fill($('rm-pexit'), SV.clipset.EDGE, st.photo.exit);
    fill($('rm-vmode'), SV.clipset.VMODE, st.clipVideo.mode);
    fill($('rm-base'), [['none', tx('remix.ui.base_none')], ['random', tx('remix.ui.base_random')]].concat(RM.layoutChoices()), st.base);
  }
  function init() {
    const st = RM.state;
    $('rm-target').value = String(st.target); lists();
    $('rm-lmin').value = String(st.min); $('rm-lmax').value = String(st.max); $('rm-stagger').value = String(st.stagger);
    renderTracks();
    $('rm-psec').value = String(st.photo.sec); $('rm-pmin').value = String(st.photo.min); $('rm-pmax').value = String(st.photo.max);
    $('rm-pfrom').value = String(st.photo.from); $('rm-pto').value = String(st.photo.to);
    $('rm-vstart').value = String(st.clipVideo.start); $('rm-vstop').value = String(st.clipVideo.stop); $('rm-vspeed').value = String(st.clipVideo.speed);
    $('rm-cw').value = String(st.custom.w); $('rm-ch').value = String(st.custom.h);
    $('rm-random').checked = st.random;
    gridBoxes();
    $('rm-seed').value = S.hex(st.seed);
    RM.preview.attach($('rm-canvas'));
    RM.lane = SV.laneView.mount($('rm-lanehost'), {
      label: () => tx('remix.ui.lane'),
      onCommit: (list) => {
        st.lane = list; RM.lane.update({ switches: list }); renderPlan();
        status(tx(st.random ? 'remix.ui.lane_random' : 'remix.ui.lane_changed'));
      },
      onSeek: scrubTo, onScrub: scrubTo
    });
    RM.preview.onTick = syncTime;
    readControls();
    renderBin();
    renderPlan();
    wire();
    RM.say = status; RM.renderPlan = renderPlan;
    RM.panel.init();
    RM.onLang(() => { lists(); renderTracks(); gridBoxes(); renderBin(); renderPlan(); syncTime(); });
    if (window.SlopHub) { try { SlopHub.register('remix'); } catch (e) { /* bus unavailable */ } }
    SlopIntake.launch({ to: 'remix' }); // ?drive=<id> (Open in Reel Remix) and a PWA launch
    RM.ready = true;
  }
  /** Move the playhead to t and paint that frame (scrubbing; works while paused). */
  function scrubTo(t) { RM.preview.pause(); RM.state.playhead = t; RM.preview.seek(t); syncTime(); }
  function syncTime() {
    const t = RM.preview.t;
    renderSlots();
    const kc = RM.keys.cutAt(t);
    if (kc !== keysCut) { keysCut = kc; RM.panel.renderKeys(); }
    $('rm-scrub').value = String(t);
    $('rm-time').textContent = fmt(t) + ' / ' + fmt(RM.preview.total());
    $('rm-play').textContent = tx(RM.preview.playing ? 'remix.ui.pause' : 'remix.ui.play');
    RM.state.playhead = t;
    if (RM.lane) RM.lane.update({ playhead: t });
  }
  function wire() {
    ['rm-pshow', 'rm-psec', 'rm-pmin', 'rm-pmax', 'rm-pfrom', 'rm-pto', 'rm-penter', 'rm-pexit', 'rm-vmode', 'rm-vstart', 'rm-vstop', 'rm-vspeed'].forEach((id) => $(id).addEventListener('change', () => { readControls(); status(tx('remix.ui.clip_settings')); }));
    ['rm-timing', 'rm-vtiming', 'rm-lmin', 'rm-lmax', 'rm-stagger'].forEach((id) => $(id).addEventListener('change', () => { readControls(); status(tx('remix.ui.timing_changed')); }));
    const audioChanged = RM.audioChanged = () => { readControls(); renderTracks(); const p = RM.state.plan; if (p) p.audio = SV.audio.choose({ mode: RM.state.audioMode, track: RM.state.audioTrack }, p.seed, RM.media()); status(tx('remix.ui.audio', { mode: $('rm-audio').options[$('rm-audio').selectedIndex].text })); };
    $('rm-audio').addEventListener('change', audioChanged);
    $('rm-track').addEventListener('change', audioChanged);
    $('rm-music').addEventListener('click', RM.intake.pickMusic);
    $('rm-fill').addEventListener('change', () => { readControls(); if (RM.state.plan) { RM.state.plan.fill = RM.state.fill; renderPlan(); } status(tx('remix.ui.fill', { fill: $('rm-fill').options[$('rm-fill').selectedIndex].text })); });
    const ctl = ['rm-target', 'rm-pace', 'rm-preset', 'rm-cw', 'rm-ch', 'rm-base', 'rm-random', 'rm-seed'];
    ctl.forEach((id) => $(id).addEventListener('change', () => { readControls(); if (id === 'rm-preset' || id === 'rm-cw' || id === 'rm-ch') status(tx('remix.ui.frame_size', { w: String(RM.size().w), h: String(RM.size().h) })); }));
    $('rm-seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); remix(false); } });
    $('rm-remix').addEventListener('click', () => remix(false));
    $('rm-reshuffle').addEventListener('click', () => RM.reshuffleNow());
    $('rm-play').addEventListener('click', () => (RM.preview.playing ? RM.preview.pause() : RM.preview.play()));
    $('rm-export').addEventListener('click', () => RM.exporter.run({ say: status }));
    $('rm-scrub').addEventListener('input', (e) => scrubTo(+e.target.value));
    wireDrop();
    RM.moves.install({ redraw: () => renderPlan(), say: status });
    RM.dnd.install({
      stage: $('rm-stage'), say: status,
      redraw: () => { renderPlan(); renderBin(); }
    });
    const send = () => RM.sendToSlopCut && RM.sendToSlopCut();
    $('rm-send').addEventListener('click', send);
    $('rm-send-stage').addEventListener('click', send);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
