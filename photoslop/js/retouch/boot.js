/* PhotoSlop Auto retouch: what is there from the start. The retouch code itself (js/retouch/*.js, shared/retouch/*.js and
 * css/retouch.css) loads on first use (psRetouch()). Here:
 *   the menu entries: Filter ▸ Auto Retouch… (and Image ▸ Auto Retouch…, Image ▸ Straighten…), Filter ▸ Repair ▸ Remove
 *   Object Tool;
 *   the SlopCmd commands with argument schemas (psRetouchCommands(), registered by wireCommands in app/commands.js), so the
 *   Slop AI panel, Ctrl+K, macros, WebMCP and the Claude Code plugin all get the same five: ps.retouch.auto-enhance,
 *   ps.retouch.portrait, ps.retouch.remove-object, ps.retouch.straighten and ps.retouch.detect-tilt. Each change is one
 *   history step; the results are new layers above the picture (with masks), so the original stays as it was.
 * Runs on this device; no key is needed. Only "Edit with AI" (remove-object with engine 'ai') uses the person's own key,
 * through the shared Edit with AI dialog (js/app/imagegen.js). Loads after ui/menus.js and before app/commands.js. */
'use strict';

const RT_FILES = ['../shared/retouch/horizon.js', '../shared/retouch/portrait.js', 'js/retouch/source.js', 'js/retouch/enhance.js',
  'js/retouch/portrait.js', 'js/retouch/remove.js', 'js/retouch/dialog-view.js', 'js/retouch/dialog.js'];
let rtLoading = null;
/** Loads the retouch code once (in order), and its styles. */
function psRetouch() {
  if (rtLoading) return rtLoading;
  const add = (src) => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src + ' (offline?)'));
    document.head.append(s);
  });
  if (!document.querySelector('link[data-retouch]')) document.head.append(h('link', { rel: 'stylesheet', href: 'css/retouch.css', 'data-retouch': '' }));
  rtLoading = RT_FILES.reduce((p, src) => p.then(() => add(src)), Promise.resolve()).catch((e) => { rtLoading = null; throw e; });
  return rtLoading;
}
const psRetouchDialog = (tab) => psRetouch().then(() => rtOpenDialog(tab)).catch((e) => toast(e.message));
const rtT = (k, v) => tr('photoslop.retouch.' + k, v);

/* ---------- the commands ---------- */
function psRetouchCommands() {
  const N = (name, min, max, def, description, extra) => Object.assign({ name, type: 'number', min, max, default: def, description }, extra);
  const E = (name, values, def, description) => ({ name, type: 'enum', values, default: def, description });
  const B = (name, def, description) => ({ name, type: 'boolean', default: def, description });
  const hasLayer = () => !!activeLayer();
  const go = (fn, args) => (a) => psRetouch().then(() => fn(a || (window.SlopCmdArgs ? SlopCmdArgs.defaults(args) : {})));
  const kw = ['retouch', 'auto', 'photo', 'fix', 'enhance', 'on device']; // i18n-ignore: search keywords
  // the argument docs and descriptions are read by the assistant (API): they stay English (i18n-ignore)
  const enhanceArgs = [N('strength', 0, 100, 100, '% of the automatic correction'), B('levels', true, 'auto levels and contrast'), // i18n-ignore: API
    B('white_balance', true, 'neutralise a colour cast'), B('exposure', true, 'brighten or darken towards mid-grey'), // i18n-ignore: API
    B('shadows_highlights', true, 'lift shadows, recover highlights'), B('vibrance', true, 'more colour where there is little, skin protected'), // i18n-ignore: API
    N('sharpen', 0, 100, 25, 'gentle sharpening, %'), E('denoise', ['none', 'light', 'medium', 'strong'], 'none', 'edge-keeping noise reduction'), // i18n-ignore: API
    B('straighten', false, 'level a tilted horizon (rotates and crops the image)')]; // i18n-ignore: API
  const portraitArgs = [N('smoothing', 0, 100, 45, 'skin smoothing strength, %; pores and edges are kept'), B('blemishes', true, 'heal small spots on the skin'), // i18n-ignore: API
    N('blemish_size', 0, 40, 0, 'largest spot radius in px; 0 = from the image size'), B('red_eye', true, 'fix red pupils (needs face detection)'), // i18n-ignore: API
    N('teeth', 0, 100, 0, 'teeth whitening, %'), N('eyes', 0, 100, 0, 'whites of the eyes, %'), // i18n-ignore: API
    E('faces', ['auto', 'off'], 'auto', 'auto uses on-device face detection when it is turned on in Profile'), B('subject', false, 'limit the skin to the person (the on-device portrait model, about 26 MB on first use)')]; // i18n-ignore: API
  const removeArgs = [N('x', -16384, 16384, undefined, 'left edge, px (omit to use the selection)'), N('y', -16384, 16384, undefined, 'top edge, px'), // i18n-ignore: API
    N('width', 1, 16384, undefined, 'px'), N('height', 1, 16384, undefined, 'px'), E('shape', ['ellipse', 'rect'], 'ellipse', 'the area given by x, y, width, height'), // i18n-ignore: API
    E('engine', ['device', 'ai'], 'device', 'device: fill from the surroundings on this device; ai: open Edit with AI (your own key) for the area')];
  return [
    { id: 'ps.retouch.auto-enhance', tool: 'auto_enhance', title: rtT('cmd_auto_enhance'), group: tr('photoslop.menu.bar_filter'), keywords: kw.concat(['levels', 'white balance', 'exposure', 'vibrance', 'sharpen']), // i18n-ignore: keywords
      when: hasLayer, args: enhanceArgs, run: go((a) => rtAutoEnhance(a), enhanceArgs),
      description: 'One-click photo fix on this device: levels, white balance, exposure, shadows and highlights, vibrance, gentle sharpening, optional denoise and straighten. Adds an “Auto Enhance” layer above the picture.' }, // i18n-ignore: for the assistant (API)
    { id: 'ps.retouch.portrait', tool: 'portrait_retouch', title: rtT('cmd_portrait'), group: tr('photoslop.menu.bar_filter'), keywords: kw.concat(['skin', 'smooth', 'blemish', 'face', 'teeth', 'red eye']), // i18n-ignore: keywords
      when: hasLayer, args: portraitArgs, run: go((a) => rtPortrait(a), portraitArgs),
      description: 'Portrait retouch on this device: skin smoothing (frequency separation, skin only), blemish healing, red-eye, optional teeth and eye whitening, each on its own masked layer.' }, // i18n-ignore: for the assistant (API)
    { id: 'ps.retouch.remove-object', tool: 'remove_object', title: rtT('cmd_remove_object'), group: tr('photoslop.menu.bar_filter'), keywords: kw.concat(['remove', 'erase', 'content aware', 'inpaint', 'object']), // i18n-ignore: keywords
      when: hasLayer, args: removeArgs, run: go((a) => rtRemoveObjectCmd(a), removeArgs),
      description: 'Remove an object: the selection (or the given area) is filled with texture from its surroundings on this device, on a new layer. engine ai opens Edit with AI for it instead (the person’s own key).' }, // i18n-ignore: for the assistant (API)
    { id: 'ps.retouch.straighten', tool: 'straighten', title: rtT('cmd_straighten'), group: tr('photoslop.menu.bar_image'), keywords: kw.concat(['horizon', 'level', 'tilt', 'rotate']), destructive: true,
      when: hasLayer, args: [N('angle', -45, 45, undefined, 'tilt in degrees (positive falls to the right); omit to detect it'), B('crop', true, 'crop away the empty corners')], // i18n-ignore: API
      run: go((a) => rtStraightenCmd(a), []), description: 'Level a tilted picture: detects the horizon (or the verticals) and rotates the whole image, cropping the corners.' }, // i18n-ignore: for the assistant (API)
    { id: 'ps.retouch.detect-tilt', tool: 'detect_tilt', title: rtT('cmd_detect_tilt'), group: tr('photoslop.menu.bar_image'), hidden: true, readOnly: true, when: hasLayer, args: [],
      run: go(() => rtDetectTilt(), []), description: 'Measure how far the picture is tilted (degrees), without changing it.' }, // i18n-ignore: for the assistant (API)
  ];
}

/* ---------- the menus ---------- */
(function () {
  const menu = (n) => MENUS.find(([m]) => m === n)[1];
  const filter = menu('Filter'), image = menu('Image'); // i18n-ignore: menu group ids
  // menu items by their key (k, the menu contract in ui/menus.js): the label is photoslop.menu.<k>
  const auto = filter.findIndex((it) => it && it.k === 'auto_enhance');
  filter.splice(auto + 1, 0, ...labelMenu([{ k: 'auto_retouch', cmdId: 'ps.retouch.dialog', act: () => psRetouchDialog(), need: 'layer' }]));
  const repair = filter.find((it) => it && it.k === 'repair');
  repair.sub.splice(3, 0, ...labelMenu([{ k: 'remove_object_tool', act: () => selectTool('remove') }]));
  const adj = image.findIndex((it) => it && it.k === 'adjustments');
  image.splice(adj + 1, 0, ...labelMenu([{ k: 'auto_retouch', act: () => psRetouchDialog(), need: 'layer' },
    { k: 'straighten', act: () => psRetouch().then(() => rtStraightenAsk()).catch((e) => toast(e.message)), need: 'layer' }]));
})();
