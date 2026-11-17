/* Slop PDF — zoom about a pointer, as plain arithmetic (no DOM), so the page view and the node tests share it.
   A document point is in layout units (Ed.zoom scales them to CSS pixels). A zoom keeps the document point that
   is under the pointer in place: the origin (top-left corner on the screen) moves so that point stays put. */
(function (root) {
  'use strict';
  var Z = {};
  /** z clamped to [min, max]. */
  Z.clamp = function (z, min, max) { return Math.min(max, Math.max(min, z)); };
  /** The document point under a client point, for an origin (client coordinates of the page's top-left) and zoom z. */
  Z.docPoint = function (pointer, origin, z) { return { x: (pointer.x - origin.x) / z, y: (pointer.y - origin.y) / z }; };
  /** The origin that puts document point doc under the pointer at zoom z. */
  Z.originFor = function (pointer, doc, z) { return { x: pointer.x - doc.x * z, y: pointer.y - doc.y * z }; };
  /** The origin after a zoom from z0 to z1 (both already clamped) that keeps the point under the pointer in place. */
  Z.zoomAbout = function (pointer, origin, z0, z1) { return Z.originFor(pointer, Z.docPoint(pointer, origin, z0), z1); };
  /** The centre of a scroll viewer's visible area: its border box (rect) less the border and the scrollbar gutters
      (box = clientLeft/clientTop/clientWidth/clientHeight). A zoom about the border-box centre drifts by half a gutter. */
  Z.viewerCentre = function (rect, box) { return { x: rect.left + box.left + box.width / 2, y: rect.top + box.top + box.height / 2 }; };
  Z.ZOOM_MIN_PCT = 25; Z.ZOOM_MAX_PCT = 800;
  /** Layout zoom for a percentage on the status bar (1 is 75%). */
  Z.fromPercent = function (pct) { return pct / 100 * 96 / 72; };
  /** The status bar percentage for a layout zoom. */
  Z.percent = function (z) { return Math.round(z * 72 / 96 * 100); };
  root.SlopPdfZoom = Z;
})(typeof window !== 'undefined' ? window : globalThis);
