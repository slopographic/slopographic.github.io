/* One icon per app: a Sloppo badge (a rounded lime tile, the Sloppo colour) holding a line-art glyph on a 48 × 48 grid.
 * Classic script. Exposes two globals:
 *   window.SLOP_ICONS                   { <app id>: <glyph markup> }: the glyph only, as <path>, <rect>, <circle> with no fill or stroke.
 *   window.SLOP_ICON_BADGE(glyph, colour?)  builds the full 48 × 48 badge SVG inner markup from a glyph. Every tile uses it.
 * The homepage (home/catalog.js) draws SLOP_ICON_BADGE(SLOP_ICONS[id]) inside <svg viewBox="0 0 48 48" class="shot-icon">.
 * Keyed by the id in shared/apps.js. tests/node/app-icons.test.mjs fails if any app id has no entry.
 * Add an app's icon:
 *   1. Draw a glyph on the 48 × 48 grid, inside about 6 to 42, stroke only (no fill, no colour).
 *   2. Add one entry to SLOP_ICONS, keyed by the app id. Keep it distinct: no entry may repeat another's markup.
 *   3. Reuse an existing glyph only when the app is the same kind of tool; otherwise draw a new one.
 *   4. Run `node tests/run.mjs app-icons` (the node test). An app with no entry falls back to its `icon` name, then to no icon.
 * Glyphs never set their own colour: the badge sets the ink, so every app reads as Sloppo with a tool. */
(function () {
  'use strict';
  /* Sloppo's lime and ink (see shared/buddy/look.js). */
  const SLOPPO_LIME = '#d4ff3a';
  const SLOPPO_INK = '#0b1300';
  /** The badge: a rounded Sloppo-coloured tile with a small shine, and the glyph drawn in ink on top. */
  function badge(glyph, colour = SLOPPO_LIME) {
    return '<rect x="2" y="2" width="44" height="44" rx="12" fill="' + colour + '"/>' +
      '<ellipse cx="16" cy="13" rx="7" ry="3.5" transform="rotate(-30 16 13)" fill="#fff" opacity=".55"/>' +
      '<g transform="translate(24 24) scale(.78) translate(-24 -24)" fill="none" stroke="' + SLOPPO_INK + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + glyph + '</g>';
  }
  window.SLOP_ICON_BADGE = badge;
  window.SLOP_ICONS = Object.freeze({
    photoslop: '<path d="M14 34c4 0 7-3 7-7l-4-4c-4 0-7 3-7 7 0 2-1 3-3 4 2 0 5 0 7 0z"/><path d="M19 25 36 8l4 4-17 17"/>',
    vector: '<path d="M8 38C14 14 34 34 40 10"/><circle cx="8" cy="38" r="3"/><circle cx="40" cy="10" r="3"/><circle cx="24" cy="24" r="3"/>',
    pdf: '<path d="M12 6h17l9 9v27H12z"/><path d="M29 6v9h9"/><path d="M16 32h4a3 3 0 0 0 0-6h-4v10M26 26h3a4 4 0 0 1 0 8h-3zM34 36v-10h4"/>',
    label: '<path d="M6 8h18l18 18-16 16L8 24z"/><circle cx="15" cy="16" r="3"/>',
    cutout: '<rect x="6" y="6" width="36" height="36" rx="3" stroke-dasharray="4 3"/><circle cx="24" cy="18" r="5"/><path d="M15 38c0-6 4-10 9-10s9 4 9 10"/>',
    ocr: '<rect x="9" y="6" width="30" height="36" rx="3"/><path d="M15 15h11M15 21h18M15 27h7"/><path d="M31 25v12M28 25h6M28 37h6"/>',
    clean: '<path d="M24 6 8 12v12c0 10 7 17 16 18 9-1 16-8 16-18V12z"/><path d="m17 24 5 5 9-10"/>',
    ai: '<path d="M24 6l4 12 12 4-12 4-4 12-4-12-12-4 12-4z"/><path d="M38 6v6M35 9h6"/>',
    docs: '<path d="M12 6h17l9 9v27H12z"/><path d="M29 6v9h9M17 24h14M17 30h14M17 36h9"/>',
    tables: '<rect x="6" y="8" width="36" height="32" rx="2"/><path d="M6 17h36M6 26h36M6 33h36M17 8v32M29 8v32"/>',
    slides: '<rect x="6" y="8" width="36" height="24" rx="2"/><path d="M24 32v8M16 42h16M13 16h14M13 22h20"/>',
    press: '<rect x="6" y="8" width="36" height="32" rx="2"/><path d="M12 14h10v8H12zM26 14h10M26 20h10M26 26h10M12 28h24M12 34h24"/>',
    remix: '<path d="M10 20a14 14 0 0 1 26-6M38 28a14 14 0 0 1-26 6"/><path d="M36 8v6h-6M12 40v-6h6"/>',
    slopedit: '<rect x="6" y="10" width="36" height="28" rx="3"/><path d="M6 17h36M6 31h36M13 10v7M21 10v7M29 10v7M37 10v7M13 31v7M21 31v7M29 31v7M37 31v7"/><path d="m21 21 7 3-7 3z"/>',
    contacts: '<rect x="6" y="10" width="36" height="28" rx="3"/><circle cx="18" cy="22" r="4"/><path d="M11 33c1-4 4-6 7-6s6 2 7 6M29 19h8M29 25h8M29 31h5"/>',
    inventory: '<path d="M6 16 24 8l18 8v18L24 42 6 34z"/><path d="M6 16l18 8 18-8M24 24v18"/>',
    orders: '<rect x="10" y="8" width="28" height="34" rx="2"/><path d="M18 8V5h12v3M17 22l4 4 8-8M17 34h14"/>',
    invoices: '<path d="M12 6h24v36l-4-3-4 3-4-3-4 3-4-3-4 3z"/><path d="M18 16h12M18 22h12M18 28h6"/>',
    quotes: '<path d="M10 6h22l6 6v30H10z"/><path d="M32 6v6h6M16 18h10M16 24h16"/><path d="M17 32c2-3 4-3 5 0s3 3 5 0"/>',
    purchases: '<path d="M8 10h4l5 20h20l4-14H15"/><circle cx="19" cy="37" r="3"/><circle cx="34" cy="37" r="3"/><path d="M24 14v8M20 18h8"/>',
    timesheets: '<circle cx="24" cy="26" r="15"/><path d="M24 18v8l6 4M20 6h8M24 6v5"/>',
    expenses: '<path d="M12 6h24v36l-4-3-4 3-4-3-4 3-4-3-4 3z"/><path d="M18 14h12M24 19v13M19 27l5 5 5-5"/>',
    notes: '<path d="M10 6h28v36H10z"/><path d="M16 16h16M16 22h16M16 28h10"/><path d="M32 40l8-8-3-3-8 8z"/>',
    paste: '<rect x="10" y="10" width="28" height="34" rx="2"/><path d="M18 10V7h12v3M16 22h16M16 28h16M16 34h10"/>',
    convert: '<path d="M8 16h28l-6-6M40 32H12l6 6"/>',
    workflows: '<rect x="5" y="8" width="11" height="9" rx="2"/><rect x="32" y="8" width="11" height="9" rx="2"/><rect x="18.5" y="31" width="11" height="9" rx="2"/><path d="M16 12.5h16M37.5 17v5.5H24V31"/>',
    crm: '<circle cx="17" cy="16" r="5"/><circle cx="31" cy="16" r="5"/><path d="M6 38c1-7 5-10 11-10s10 3 11 10M24 38c1-7 5-10 11-10s8 3 7 10"/>',
    ledger: '<path d="M10 6h26v36H10z"/><path d="M10 6v36M20 12v24M28 12v24M16 16h-2M16 22h-2"/><path d="M24 15h9M24 21h9M24 27h9M24 33h9"/>',
    admin: '<circle cx="24" cy="24" r="6"/><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4"/><circle cx="24" cy="24" r="14"/>',
    drive: '<path d="M6 12h13l4 5h19v21H6z"/><path d="M6 20h36"/>',
    code: '<path d="M16 14 6 24l10 10M32 14l10 10-10 10M27 10l-6 28"/>',
    gallery: '<rect x="12" y="6" width="30" height="26" rx="2"/><path d="M6 14v26h30"/><path d="M14 26l7-8 6 6 4-4 9 9"/><circle cx="32" cy="14" r="2"/>',
    sorter: '<rect x="13" y="8" width="22" height="30" rx="3"/><path d="M8 12v24M40 12v24M19 30l4-5 3 3 3-3 3 5"/><path d="M24 17l1.5 1.5L28 16"/>',
    '3d': '<path d="M24 6l16 9v18l-16 9-16-9V15z"/><path d="M8 15l16 9 16-9M24 24v18"/>',
    music: '<path d="M18 34V10l20-4v24"/><circle cx="13" cy="34" r="5"/><circle cx="33" cy="30" r="5"/>',
    authenticator: '<rect x="14" y="6" width="20" height="36" rx="3"/><path d="M22 36h4M20 14h8"/><path d="M19 24l3 3 6-6"/>',
    'paint-classic': '<path d="M24 6c-10 0-18 7-18 16 0 7 6 8 9 6 3-2 1 6 6 6 9 0 15-6 15-14 0-7-6-14-12-14z"/><circle cx="16" cy="18" r="2.5"/><circle cx="24" cy="14" r="2.5"/><circle cx="32" cy="18" r="2.5"/>',
    aitools: '<rect x="6" y="16" width="36" height="24" rx="3"/><path d="M17 16v-5h14v5M6 26h36M22 22h4"/>',
    resize: '<path d="M6 18V6h12M42 30v12H30"/><rect x="16" y="16" width="16" height="16" rx="1"/>',
    upscale: '<path d="M24 40V8M14 18l10-10 10 10M8 42h32"/>',
    effects: '<path d="M18 14v20l16-10z"/><path d="M6 14h7M6 24h7M6 34h7"/>',
    hex: '<path d="M16 8h-6v32h6M32 8h6v32h-6"/><path d="M18 24h2M23 24h2M28 24h2"/>',
    eml: '<rect x="6" y="11" width="36" height="26" rx="3"/><path d="M7 14l17 13 17-13"/><path d="M10 33h8M30 33h8"/>',
    checksum: '<path d="M17 7 13 41M35 7 31 41M7 18h34M6 30h34"/>',
    diff: '<rect x="6" y="8" width="15" height="32" rx="2"/><rect x="27" y="8" width="15" height="32" rx="2"/><path d="M10 15h7M10 21h4M10 27h7M31 15h7M31 21h7M31 27h3"/><path d="M21 24h6"/>',
    nodes: '<circle cx="12" cy="14" r="3"/><circle cx="36" cy="14" r="3"/><circle cx="24" cy="34" r="3"/><path d="M15 14h18M13 17l9 14M35 17l-9 14"/>',
    signature: '<rect x="6" y="10" width="36" height="28" rx="3"/><path d="M6 13l18 13 18-13"/><path d="M14 33c3-5 5-5 6-2s3 3 5-1 4-3 5 0 3 2 6-1"/>',
    transcribe: '<rect x="18" y="6" width="12" height="22" rx="6"/><path d="M12 22a12 12 0 0 0 24 0M24 34v6M17 40h14"/>',
    recorder: '<rect x="5" y="9" width="38" height="26" rx="3"/><path d="M17 41h14M24 35v6"/><circle cx="24" cy="22" r="6"/>',
    serials: '<path d="M8 10v28M13 10v28M17 10v28M23 10v28M27 10v28M33 10v28M38 10v28M42 10v28"/>',
    qr: '<rect x="6" y="6" width="14" height="14" rx="1.5"/><rect x="11" y="11" width="4" height="4"/><rect x="28" y="6" width="14" height="14" rx="1.5"/><rect x="33" y="11" width="4" height="4"/><rect x="6" y="28" width="14" height="14" rx="1.5"/><rect x="11" y="33" width="4" height="4"/><path d="M28 28h4v4h-4zM36 28h6M28 36v6h4M36 36h6v6h-6z"/>',
    colors: '<path d="M24 6c-10 0-18 7.5-18 17 0 8 6 13 12 13h3a3 3 0 0 1 2.2 5A2 2 0 0 0 24 44c10 0 18-8 18-19S34 6 24 6z"/><circle cx="15" cy="20" r="3"/><circle cx="23" cy="14" r="3"/><circle cx="32" cy="17" r="3"/><circle cx="34" cy="27" r="3"/>',
    fontcreator: '<path d="M6 41 18 8h4l12 33M11 29h18"/><path d="M31 13h11M36.5 7.5v11"/><circle cx="36.5" cy="13" r="2.5"/>',
    scan: '<path d="M6 14V8a2 2 0 0 1 2-2h6M34 6h6a2 2 0 0 1 2 2v6M42 34v6a2 2 0 0 1-2 2h-6M14 42H8a2 2 0 0 1-2-2v-6"/><path d="M15 11h14l5 5v21H15z"/><path d="M19 22h11M19 27h11M19 32h7"/>',
    calculator: '<rect x="10" y="6" width="28" height="36" rx="3"/><rect x="15" y="11" width="18" height="7" rx="1"/><path d="M15 26h3M22 26h3M29 26h3M15 33h3M22 33h3M29 33h3"/>',
    time: '<circle cx="24" cy="24" r="16"/><path d="M24 14v10l7 5"/>',
    calendar: '<rect x="7" y="10" width="34" height="31" rx="3"/><path d="M7 19h34M16 6v8M32 6v8M15 26h3M22 26h3M29 26h3M15 33h3M22 33h3"/>',
    todo: '<rect x="9" y="8" width="30" height="34" rx="3"/><path d="M15 21l3 3 5-6M15 33l3 3 5-6M27 21h6M27 33h6"/>',
    projects: '<rect x="6" y="8" width="36" height="32" rx="3"/><path d="M18 8v32M30 8v32M10 15h5M22 15h5M22 21h5M34 15h5"/>',
    reminders: '<path d="M13 34V22a11 11 0 0 1 22 0v12l3 4H10z"/><path d="M20 42h8"/><circle cx="24" cy="8" r="2"/>',
    sheetview: '<rect x="6" y="6" width="22" height="22" rx="2"/><path d="M6 14h22M6 22h22M14 6v22M22 6v22"/><circle cx="33" cy="33" r="6"/><path d="M37.5 37.5 41 41"/>',
    img3d: '<rect x="8" y="8" width="32" height="32" rx="3"/><path d="M8 32l10-10 6 6 6-8 10 12"/><circle cx="32" cy="16" r="3"/>',
    html2pdf: '<path d="M12 6h17l9 9v27H12z"/><path d="M29 6v9h9"/><path d="M24 20v13M19 28l5 5 5-5"/><rect x="30" y="33" width="4" height="4"/>',
    reports: '<path d="M6 40h22"/><path d="M10 40V28M17 40V18M24 40V24"/><circle cx="34" cy="17" r="6"/><path d="M38.5 21.5 42 25"/>',
    watermark: '<rect x="6" y="8" width="36" height="32" rx="3"/><path d="M6 32l11-10 8 7 6-5 11 9"/><path d="M14 16l-4 4M24 16l-4 4M34 16l-4 4"/>',
  });
})();
