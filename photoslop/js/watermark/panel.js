/* PhotoSlop watermark panel: the site's one watermark panel (shared/watermark/panel.js) on the open document's watermark,
 * with PhotoSlop's on switch and its device default. Every change is live: the page preview repaints at once and the next
 * export uses the same watermark. */
'use strict';

function buildWatermarkPanel() {
  const host = h('div', { class: 'ps-wm' });
  const panel = SlopWatermarkPanel.mount(host, {
    value: wmState().spec,
    intake: 'photoslop.logo',   // the logo part: SlopIntake.pick({ to: 'photoslop.logo' })
    onChange: (spec) => wmSetSpec(spec),
    toggle: { get: wmOn, set: wmSetOn, label: 'photoslop.wm.on', note: (on) => tr(on ? 'photoslop.wm.on_note' : 'photoslop.wm.off_note') },
    actions: [
      { label: 'photoslop.wm.save_default', title: 'photoslop.wm.save_default_tip', act: () => wmSaveDefaults() },
      { label: 'photoslop.wm.reset_default', title: 'photoslop.wm.reset_default_tip', act: () => wmResetStyle() },
    ],
  });
  // the document's watermark: after an undo, a tab switch or opening a file. Only when it is another spec: 'doc' comes
  // with every edit of the picture, and redrawing the panel each time made every stroke and drag slow.
  let shown = wmState().spec, shownOn = wmOn();
  listeners.add((w) => {
    if (w !== 'watermark' && w !== 'doc' && w !== 'docname') return;
    const spec = wmState().spec, on = wmOn();
    if (spec !== shown) panel.set(spec);
    else if (on !== shownOn) panel.sync();   // the switch (Layer › Watermark on, a tab with it on)
    shown = spec; shownOn = on;
  });
  return host;
}
