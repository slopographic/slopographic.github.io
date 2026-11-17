/* Slop Recorder: the settings in the right panel (source, sound, webcam corner, countdown, save as), kept in this browser
 * (localStorage 'slop.recorder.settings'). The controls are the page's own (#rc-settings, index.html); the panel adopts them
 * (layout.js). Classic script: SlopRec.settings.
 *   init(onChange)   wires the controls and restores the last settings
 *   get()            the settings, checked (core/plan.js clean)
 *   set(patch)       changes some (the assistant, the tests), redraws the controls, saves, calls onChange
 *   lock(on)         greys the controls out while recording
 *   redraw()         draws the controls again (a language change: the source note) */
(function (g) {
  'use strict';
  const R = (g.SlopRec = g.SlopRec || {}), KEY = 'slop.recorder.settings';
  const $ = (id) => document.getElementById(id);
  let cur = null, changed = () => {};
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  // the note under the source buttons: recorder.set.note_screen, _camera, _pip, _mic

  function load() { try { return JSON.parse(g.localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save() { try { g.localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* private mode: not kept */ } }

  function draw() {
    const P = R.plan;
    for (const b of document.querySelectorAll('#rc-source button')) b.setAttribute('aria-pressed', String(b.dataset.v === cur.source));
    $('rc-sys').checked = cur.systemAudio;
    $('rc-mic').checked = cur.mic;
    $('rc-corner').value = cur.corner;
    $('rc-size').value = String(cur.pipSize);
    $('rc-size-out').textContent = cur.pipSize + '%';
    $('rc-countdown').value = String(cur.countdown);
    const fmt = $('rc-format'), allowed = P.formatsFor(cur.source);
    for (const o of fmt.options) o.hidden = o.disabled = !allowed.includes(o.value);
    fmt.value = cur.format;
    $('rc-gif-w').value = String(cur.gifWidth);
    $('rc-gif-fps').value = String(cur.gifFps);
    const display = cur.source === 'screen' || cur.source === 'pip';
    $('rc-sys-row').hidden = !display;
    $('rc-mic-row').hidden = cur.source === 'mic';
    $('rc-pip').hidden = cur.source !== 'pip';
    $('rc-gif').hidden = cur.format !== 'gif';
    $('rc-sound-group').hidden = cur.source === 'mic';
    $('rc-source-note').textContent = t(`recorder.set.note_${cur.source}`);
    // a panel section whose settings are all hidden goes too (its heading would stand alone)
    for (const gr of document.querySelectorAll('.rc-group')) { const sec = gr.closest('.sf-sec'); if (sec) sec.hidden = gr.hidden; }
  }
  function set(patch) {
    cur = R.plan.clean(Object.assign({}, cur, patch));
    draw(); save(); changed(cur);
    return cur;
  }
  function init(onChange) {
    changed = onChange || changed;
    cur = R.plan.clean(load());
    for (const b of document.querySelectorAll('#rc-source button')) b.addEventListener('click', () => set({ source: b.dataset.v }));
    $('rc-sys').addEventListener('change', (e) => set({ systemAudio: e.target.checked }));
    $('rc-mic').addEventListener('change', (e) => set({ mic: e.target.checked }));
    $('rc-corner').addEventListener('change', (e) => set({ corner: e.target.value }));
    $('rc-size').addEventListener('input', (e) => set({ pipSize: e.target.value }));
    $('rc-countdown').addEventListener('change', (e) => set({ countdown: e.target.value }));
    $('rc-format').addEventListener('change', (e) => set({ format: e.target.value }));
    $('rc-gif-w').addEventListener('change', (e) => set({ gifWidth: e.target.value }));
    $('rc-gif-fps').addEventListener('change', (e) => set({ gifFps: e.target.value }));
    draw();
  }
  function lock(on) {
    for (const n of document.querySelectorAll('.rc-group button, .rc-group input, .rc-group select')) {
      if (n.closest('#rc-save-group')) continue;   // the format can still change while recording
      n.disabled = !!on;
    }
  }
  /** While a recording is reviewed, its own kind decides the formats (a sound-only recording saves as WebM or WAV). */
  function formatsFor(audioOnly) {
    const fmt = $('rc-format'), allowed = R.plan.formatsFor(audioOnly ? 'mic' : 'screen');
    for (const o of fmt.options) o.hidden = o.disabled = !allowed.includes(o.value);
    if (!allowed.includes(fmt.value)) fmt.value = allowed[0];
    return fmt.value;
  }
  R.settings = { init, get: () => cur, set, redraw: () => cur && draw(), lock, formatsFor, format: () => $('rc-format').value };
})(typeof window !== 'undefined' ? window : globalThis);
