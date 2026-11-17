/* SlopCut: the Watermark tab of the bin (the project panel): the site's one watermark panel (shared/watermark/panel.js)
   on the open project's watermark, with SlopCut's on switch, the time range of each layer, and the device default.
   Each change is one undoable step on the project, and the monitor shows it at once (watermark/state.js draws it, the
   same pixels as the export). The panel is built once and then only synced, so a slider drag is not interrupted by the
   bin's re-renders. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, WM = SE.watermark, h = U.h;
  const P = WM.panel = {};
  let root = null, panel = null;

  function build() {
    root = h('div', { class: 'wm-panel' }, h('div', { class: 'ins-title' }, SE.icon('sparkle'), h('b', null, U.t('slopedit.bin.watermark'))));
    panel = SlopWatermarkPanel.mount(root, {
      value: WM.settings().spec,
      media: { pages: false, time: true },
      onChange: (spec, how) => WM.set({ spec }, how.label || U.t('slopedit.bin.watermark'), how.key || 'spec'),
      toggle: { get: () => WM.settings().on, set: (on) => WM.set({ on }, on ? U.t('slopedit.wm.watermark_on') : U.t('slopedit.wm.watermark_off'), 'on'), label: 'slopedit.bin.watermark',
        note: (on) => (on ? U.t('slopedit.wm.on_shows_in_the_monitor') : U.t('slopedit.wm.off_no_watermark_in_the')) },
      actions: [
        { label: 'slopedit.wm.save_as_device_default', title: 'slopedit.wm.new_projects_on_this_device', act: () => { WM.saveDefaults(); SlopUI.toast(U.t('slopedit.wm.saved_as_this_device_s')); } },
        { label: 'slopedit.wm.use_device_default', title: 'slopedit.wm.copy_this_device_s_default', act: () => WM.useDefaults() },
      ],
    });
    return root;
  }

  /** Renders into the bin's list element. Rebuilt only when another tab has replaced the list's content. */
  P.render = function (list) {
    if (!root || root.parentNode !== list) list.replaceChildren(build());
    panel.set(WM.settings().spec);
  };
  SE.act = SE.act || {};
  SE.act.openWatermark = function () { if (SE.bin) SE.bin.show('watermark'); };
})();
