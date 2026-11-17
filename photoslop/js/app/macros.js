/* PhotoSlop macros (shared/macros): record what you do, play it again, run it on many files in Slop Workflows.
 * The steps are PhotoSlop's commands with args (app/ai-commands.js, the ones the Slop AI panel uses). What the menus and
 * dialogs do is reported as the same command: a filter dialog's OK is ps.ai.filter with its settings (ui/filter-dialog.js),
 * Image Size and Canvas Size are ps.ai.image-size and ps.ai.canvas-size (ui/size-dialogs.js), and the menu items below
 * (rotate, flip, crop, select, layers, undo) are their commands. Brush strokes and hand-drawn selections are not steps.
 * With ?macro-host=1 this page is the hidden copy Slop Workflows runs a macro in (shared/macros/frame.js): it then keeps
 * nothing (no autosave, recovery, view state or welcome) and opens, replays and writes one file at a time.
 * Loads after the menus, io/save.js, app/tabs.js, app/view-state.js and app/welcome.js, before app/main.js. */
'use strict';

const PS_RATIOS = ['1:1', '4:5', '3:2', '4:3', '16:9', '9:16'];
/** Crop the whole image to a ratio (width:height) around its centre: the largest such box that fits. */
function psCropRatio(ratio) {
  const [a, b] = String(ratio || '1:1').split(':').map(Number), r = a > 0 && b > 0 ? a / b : 1;
  let w = D.w, hh = Math.round(D.w / r);
  if (hh > D.h) { hh = D.h; w = Math.round(D.h * r); }
  cropTo({ x: Math.round((D.w - w) / 2), y: Math.round((D.h - hh) / 2), w, h: hh }, true);
  fitView();
  return `Cropped to ${w} × ${hh} px (${ratio}).`;   // i18n-ignore: the result told to the assistant (API)
}

(function () {
  const SM = window.SlopMacros;
  if (!SM) return;

  /* ---------- menu items that are commands (found by group and the items' k, menus.js) ---------- */
  const rot = (target) => ({ rotate_180: ['ps.ai.rotate', { angle: '180', target }], rotate_90_clockwise: ['ps.ai.rotate', { angle: '90', target }],
    rotate_90_counter_clockwise: ['ps.ai.rotate', { angle: '-90', target }], flip_horizontal: ['ps.ai.flip', { direction: 'horizontal', target }],
    flip_vertical: ['ps.ai.flip', { direction: 'vertical', target }] });
  const under = (path, map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [path + '/' + k, v]));
  const SAME = Object.assign({
    'Edit/undo': ['ps.ai.undo', { steps: 1 }],
    'Edit/fill_with_foreground': () => ['ps.ai.fill', { color: C.fg, opacity: 100 }],
    'Edit/fill_with_background': () => ['ps.ai.fill', { color: C.bg, opacity: 100 }],
    'Image/crop_to_selection': ['ps.ai.crop-to-selection', {}],
    'Layer/new_layer': ['ps.ai.new-layer', {}], 'Layer/duplicate_layer': ['ps.ai.duplicate-layer', {}], 'Layer/delete/delete_layer': ['ps.ai.delete-layer', {}],
    'Select/all': ['ps.ai.select-all', {}], 'Select/deselect': ['ps.ai.deselect', {}], 'Select/inverse': ['ps.ai.invert-selection', {}], 'Select/subject': ['ps.ai.select-subject', {}],
  }, under('Image', rot('image')), under('Edit/transform', rot('layer')), under('Layer/rotate_and_flip', rot('layer')));   // i18n-ignore: ids, class names, key names or text for agents
  for (const r of PS_RATIOS) SAME['Image/crop_to_ratio/' + r.replace(':', '_')] = ['ps.ai.crop', { ratio: r }];

  /* ---------- the menu entries ---------- */
  const image = MENUS.find(([n]) => n === 'Image')[1], edit = MENUS.find(([n]) => n === 'Edit')[1];   // i18n-ignore: ids, class names, key names or text for agents
  const at = image.findIndex((it) => it && it.k === 'crop_to_selection');
  image.splice(at + 1, 0, ...labelMenu([{ k: 'crop_to_ratio', sub: PS_RATIOS.map((r) => ({ k: r.replace(':', '_'), label: r, act: () => psCropRatio(r), need: 'layer' })) }]));
  edit.push('-', ...labelMenu([{ k: 'macros', sub: [
    { k: 'record_a_macro', cmdId: 'macro.record', act: () => SM.record(), en: () => !SM.recording },
    { k: 'stop_recording_and_save', cmdId: 'macro.stop', act: () => SM.stop(), en: () => SM.recording },
    { k: 'cancel_recording', cmdId: 'macro.cancel', act: () => SM.cancel(), en: () => SM.recording },
    { k: 'macros', t: 'macros_dots', cmdId: 'macro.panel', act: () => SM.openPanel() },
  ] }]));

  // each menu item that is a command reports it after it runs (keys, menus, the context menu and the palette all call act)
  const walk = (items, path, names) => {
    for (const it of items) {
      if (!it || it === '-') continue;
      const p = path.concat(it.k || it.label), n = names.concat(it);
      if (it.sub) { walk(it.sub, p, n); continue; }
      const same = SAME[p.join('/')];
      if (!same || !it.act) continue;
      const act = it.act;
      it.act = (...a) => { const [cmd, args] = typeof same === 'function' ? same() : same; const r = act(...a); SM.note(cmd, args, n.map((x) => x.label).join(' › ')); return r; };
    }
  };
  for (const [name, items] of MENUS) if (Array.isArray(items)) walk(items, [name], []);

  /* ---------- the hidden copy for Slop Workflows ---------- */
  const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  const host = {
    ready: () => new Promise((res) => { const t = () => (document.body && document.body.classList.contains('ready') ? res() : setTimeout(t, 30)); t(); }),
    async open(file) {
      const doc = await readAnyFile(file);
      openDocument(doc.w, doc.h, doc.layers, (file.name || 'Untitled').replace(/\.[^.]+$/, '') || 'Untitled');   // i18n-ignore: the file name Slop Workflows writes
      if (doc.guides) adoptGuides(doc.guides);
      if (doc.wm) adoptWatermark(doc.wm);
    },
    async save({ format = 'png', quality = 0.9 } = {}) {
      if (typeof aiSettle === 'function') await aiSettle();
      const mime = MIME[format] || MIME.png;
      const c = await renderExport(mime, 1, mime === MIME.png ? null : '#ffffff');
      const blob = await canvasToBlob(c, mime, quality);
      if (!blob) throw new Error('The picture could not be written.');
      return { blob, kind: blob.type === mime ? format : 'png' };
    },
  };
  if (SM.isHost) {
    // this copy works on its own files only: it must not touch the person's recovery data, tabs, view or Slop Hub launch
    autosave = async () => {}; scheduleAutosave = () => {}; flushAutosave = () => {}; saveTabsIndex = () => {};
    loadAutosave = async () => false; hubBoot = async () => false; restoreView = async () => {}; showWelcome = () => {};
    docIsDirty = () => false;   // nothing to lose here: no "leave the page?" when the run is over
    document.documentElement.dataset.macroHost = '1';
  }
  SM.init({ app: 'photoslop', label: 'PhotoSlop', host });   // i18n-ignore: ids, class names, key names or text for agents
  if (!SM.isHost) {
    const mount = () => { const b = document.getElementById('macrosBtn'); if (b && window.SlopMacrosPanel) { b.hidden = false; SlopMacrosPanel.button(SM, b); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
  }
})();
