/* Slop Paint, part 04: tool and cursor icons, the TOOLS list.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;

/* =====================================================================
 * Icons (inline SVG, 16x16, drawn crisp)
 * ===================================================================== */
const svg = inner => `<svg viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">${inner}</svg>`;
const ICONS = {
  freesel: svg('<path d="M5.5 1.5l4 1 1 3 3 1-1 4 1 3-4-1-3 2-2-3-3-1 2-3-1-3z" fill="none" stroke="#000" stroke-dasharray="1 1"/>'),
  select: svg('<rect x="1.5" y="2.5" width="13" height="11" fill="none" stroke="#000" stroke-dasharray="1 1"/>'),
  eraser: svg('<path d="M6.5 3.5h8l-4 5h-8z" fill="#fff" stroke="#000"/><path d="M2.5 8.5h8v4h-8z" fill="#ffb7cf" stroke="#000"/><path d="M10.5 8.5l4-5v4l-4 5z" fill="#c8668a" stroke="#000"/>'),
  fill: svg('<path d="M1.5 7.5l5-5 6 6-5 5z" fill="#c0c0c0" stroke="#000"/><path d="M3.5 7.5l3-3 3 3z" fill="#fff"/><path d="M6.5 2.5c-2-2-4-1-4 1" fill="none" stroke="#000"/><path d="M12.5 8.5c1 1 2 2.5 2 4.5 0 1-1 1-1 0v-3" fill="#9fcc00" stroke="#2c3d00"/>'),
  picker: svg('<path d="M10.5 1.5l1-1 4 4-1 1-1-0.2-3.8-3.8z" fill="#000"/><path d="M9.5 3.5l3 3-7 7h-2l-1 1-1-1 1-1v-2z" fill="#fff" stroke="#000"/><path d="M4 12l6-6" stroke="#9ab" />'),
  zoom: svg('<circle cx="6" cy="6" r="4.5" fill="#cfe7ff" stroke="#000"/><path d="M4 4.5q1-1.5 2.5-1" fill="none" stroke="#fff"/><path d="M9 9l5 5" stroke="#000" stroke-width="2.6" stroke-linecap="square"/>'),
  pencil: svg('<path d="M1.5 14.5l1-4 8.5-8.5 3 3-8.5 8.5z" fill="#ffd400" stroke="#000"/><path d="M1.5 14.5l1-4 3 3z" fill="#f2cf9a" stroke="#000"/><path d="M1 15l1-2.5 1.5 1.5z" fill="#000"/><path d="M11 2l1.5-1.5 3 3L14 5z" fill="#ff8fb0" stroke="#000"/><path d="M4 11l7-7" stroke="#b08a00"/>'),
  brush: svg('<path d="M15 1l-5.5 5.5" stroke="#8b4a1a" stroke-width="2.6"/><path d="M9.5 4.5l2 2-2 2-2-2z" fill="#c0c0c0" stroke="#000"/><path d="M6.5 7.5c-2 0-2.8 1.5-3.2 3.2-.4 1.5-1.2 2.6-2.3 3.8 3 0 5.4-.8 6.6-2.7.8-1.4.6-2.8-1.1-4.3z" fill="#000"/>'),
  airbrush: svg('<rect x="8.5" y="6.5" width="5" height="8" fill="#c0c0c0" stroke="#000"/><path d="M9.5 7.5v6" stroke="#fff"/><rect x="9.5" y="4.5" width="3" height="2" fill="#808080" stroke="#000"/><rect x="10" y="2" width="2" height="2" fill="#000"/><g fill="#000"><rect x="7" y="1" width="1" height="1"/><rect x="5" y="2" width="1" height="1"/><rect x="7" y="3" width="1" height="1"/><rect x="3" y="1" width="1" height="1"/><rect x="4" y="4" width="1" height="1"/><rect x="2" y="3" width="1" height="1"/><rect x="6" y="5" width="1" height="1"/><rect x="1" y="5" width="1" height="1"/><rect x="3" y="6" width="1" height="1"/></g>'),
  text: svg('<path d="M2.5 14l4.2-12h2.6l4.2 12h-2.4l-1-3H5.9l-1 3zM6.6 9h2.8L8 4.6z" fill="#000" fill-rule="evenodd"/>'),
  line: svg('<path d="M2.5 13.5l11-11" stroke="#000" fill="none"/>'),
  curve: svg('<path d="M1.5 13.5C2.5 4 6 3 8 8s5.5 4 6.5-6" fill="none" stroke="#000"/>'),
  rect: svg('<rect x="2.5" y="3.5" width="11" height="9" fill="#808080" stroke="#000"/>'),
  poly: svg('<path d="M2.5 2.5h7l-2 4.5h6.5v6.5h-11.5z" fill="#808080" stroke="#000"/>'),
  ellipse: svg('<ellipse cx="8" cy="8" rx="6.5" ry="4.5" fill="#808080" stroke="#000"/>'),
  rrect: svg('<rect x="2.5" y="3.5" width="11" height="9" rx="3" fill="#808080" stroke="#000"/>'),
  slop: svg('<path d="M1.5 3.5h13v3c0 1-1 1-1 2v2c0 1.6-2 1.6-2 0V8.2c0-.9-1.5-.9-1.5 0v5c0 1.7-2.2 1.7-2.2 0V8.6c0-.9-1.5-.9-1.5 0v1.2c0 1.5-2 1.5-2 0V7.4c0-.6-.6-.8-.8-1.3z" fill="#9fcc00" stroke="#2c3d00"/><path d="M3 5h6" stroke="#eaff9a"/><rect x="8" y="10" width="1" height="2" fill="#eaff9a"/>'),
  stamp: svg('<rect x="6" y="1" width="4" height="4" rx="2" fill="#8b4a1a" stroke="#000"/><rect x="7" y="5" width="2" height="3" fill="#8b4a1a" stroke="#000" stroke-width=".8"/><rect x="2.5" y="8.5" width="11" height="3" fill="#c0c0c0" stroke="#000"/><rect x="2.5" y="11.5" width="11" height="2" fill="#d4ff3a" stroke="#000"/><path d="M13 1l.6 1.4L15 3l-1.4.6L13 5l-.6-1.4L11 3l1.4-.6z" fill="#ffd400"/>'),
};
const CURSORS = (() => {
  const cur = (inner, x, y, fb = 'crosshair') => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16" shape-rendering="crispEdges">${inner}</svg>`)}") ${x} ${y}, ${fb}`;
  return {
    pencil: cur('<path d="M1.5 14.5l1-4 8.5-8.5 3 3-8.5 8.5z" fill="#ffd400" stroke="#000"/><path d="M1.5 14.5l1-4 3 3z" fill="#f2cf9a" stroke="#000"/><path d="M1 15l1-2.5 1.5 1.5z" fill="#000"/>', 1, 23),
    fill: cur('<path d="M1.5 7.5l5-5 6 6-5 5z" fill="#c0c0c0" stroke="#000"/><path d="M12.5 8.5c1 1 2 2.5 2 4.5 0 1-1 1-1 0v-3" fill="#000" stroke="#000"/>', 21, 22),
    picker: cur('<path d="M10.5 1.5l1-1 4 4-1 1z" fill="#000"/><path d="M9.5 3.5l3 3-7 7h-2l-1 1-1-1 1-1v-2z" fill="#fff" stroke="#000"/>', 1, 23),
    zoom: cur('<circle cx="6" cy="6" r="4.5" fill="none" stroke="#000"/><circle cx="6" cy="6" r="3.5" fill="none" stroke="#fff"/><path d="M9 9l5 5" stroke="#000" stroke-width="2.6"/>', 9, 9, 'zoom-in'),
    airbrush: cur('<rect x="8.5" y="6.5" width="5" height="8" fill="#c0c0c0" stroke="#000"/><rect x="9.5" y="4.5" width="3" height="2" fill="#808080" stroke="#000"/><rect x="10" y="2" width="2" height="2" fill="#000"/>', 16, 3),
  };
})();

// [id, name key, tip key]: the words are in i18n/<lang>/menus.js (t(name), t(tip))
const TOOLS = [
  ['freesel', 'paint-classic.tool.freesel', 'paint-classic.tool.freesel_tip'],
  ['select', 'paint-classic.tool.select', 'paint-classic.tool.select_tip'],
  ['eraser', 'paint-classic.tool.eraser', 'paint-classic.tool.eraser_tip'],
  ['fill', 'paint-classic.tool.fill', 'paint-classic.tool.fill_tip'],
  ['picker', 'paint-classic.tool.picker', 'paint-classic.tool.picker_tip'],
  ['zoom', 'paint-classic.tool.zoom', 'paint-classic.tool.zoom_tip'],
  ['pencil', 'paint-classic.tool.pencil', 'paint-classic.tool.pencil_tip'],
  ['brush', 'paint-classic.tool.brush', 'paint-classic.tool.brush_tip'],
  ['airbrush', 'paint-classic.tool.airbrush', 'paint-classic.tool.airbrush_tip'],
  ['text', 'paint-classic.tool.text', 'paint-classic.tool.text_tip'],
  ['line', 'paint-classic.tool.line', 'paint-classic.tool.line_tip'],
  ['curve', 'paint-classic.tool.curve', 'paint-classic.tool.curve_tip'],
  ['rect', 'paint-classic.tool.rect', 'paint-classic.tool.rect_tip'],
  ['poly', 'paint-classic.tool.poly', 'paint-classic.tool.poly_tip'],
  ['ellipse', 'paint-classic.tool.ellipse', 'paint-classic.tool.ellipse_tip'],
  ['rrect', 'paint-classic.tool.rrect', 'paint-classic.tool.rrect_tip'],
  ['slop', 'paint-classic.tool.slop', 'paint-classic.tool.slop_tip'],
  ['stamp', 'paint-classic.tool.stamp', 'paint-classic.tool.stamp_tip'],
];
const TOOL_INFO = Object.fromEntries(TOOLS.map(t => [t[0], t]));

Object.assign(P, { CURSORS, ICONS, TOOLS });
})();
