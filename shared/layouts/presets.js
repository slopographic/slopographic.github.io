/* Workspace layouts: the presets are plain data. Classic script: sets window.SlopLayouts.CATEGORIES and .PRESETS.
 * A preset says which panels show, which side each sits on and how big it is (px; null = take the rest).
 *   side: left | center | right | top | bottom   (center takes the free space; top and bottom span the full width)
 *   size: px for left, right, top, bottom; null for center, or where the side should take the rest of the space
 * Panel ids are the names each app gives its panels in shared/layouts/HANDOFF.md. A panel an app does not have is ignored. */
(function (g) {
  'use strict';
  const NS = (g.SlopLayouts = g.SlopLayouts || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/templates.js; name and blurb are read each time

  NS.CATEGORIES = Object.freeze([
    { id: 'video', get name() { return say('ui.layout.cat.video'); }, get blurb() { return say('ui.layout.cat.video_blurb'); }, apps: ['slopcut'] },
    { id: 'image', get name() { return say('ui.layout.cat.image'); }, get blurb() { return say('ui.layout.cat.image_blurb'); }, apps: ['photoslop'] },
    { id: '3d', get name() { return say('ui.layout.cat.3d'); }, get blurb() { return say('ui.layout.cat.3d_blurb'); }, apps: ['3d'] },
    { id: 'business', get name() { return say('ui.layout.cat.business'); }, get blurb() { return say('ui.layout.cat.business_blurb'); }, apps: ['invoices', 'orders', 'quotes', 'purchases', 'crm'] },
    { id: 'writing', get name() { return say('ui.layout.cat.writing'); }, get blurb() { return say('ui.layout.cat.writing_blurb'); }, apps: [] },
  ]);

  NS.PRESETS = Object.freeze([
    { id: 'video-edit', category: 'video', get name() { return say('ui.layout.preset.video_edit'); }, apps: ['slopcut'],
      panels: {
        preview: { show: true, side: 'center', size: null },
        bin: { show: true, side: 'left', size: 280 },
        insp: { show: true, side: 'right', size: 300 },
        timeline: { show: true, side: 'bottom', size: 300 },
      } },
    { id: 'image-edit', category: 'image', get name() { return say('ui.layout.preset.image_edit'); }, apps: ['photoslop'],
      panels: {
        canvas: { show: true, side: 'center', size: null },
        tools: { show: true, side: 'left', size: 62 },
        panels: { show: true, side: 'right', size: 280 },
      } },
    { id: '3d-view', category: '3d', get name() { return say('ui.layout.preset.3d_view'); }, apps: ['3d'],
      panels: {
        viewport: { show: true, side: 'center', size: null },
        outliner: { show: true, side: 'left', size: 230 },
        inspector: { show: true, side: 'right', size: 270 },
      } },
    { id: 'business-document', category: 'business', get name() { return say('ui.layout.preset.business_document'); }, apps: ['invoices', 'orders', 'quotes', 'purchases'],
      panels: {
        list: { show: true, side: 'left', size: 340 },
        document: { show: true, side: 'right', size: null },
      } },
    { id: 'business-detail', category: 'business', get name() { return say('ui.layout.preset.business_detail'); }, apps: ['crm'],
      panels: {
        list: { show: true, side: 'left', size: 340 },
        detail: { show: true, side: 'right', size: null },
      } },
    { id: 'writing-document', category: 'writing', get name() { return say('ui.layout.preset.writing_document'); }, apps: [],
      panels: {
        outline: { show: true, side: 'left', size: 240 },
        document: { show: true, side: 'center', size: null },
      } },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
