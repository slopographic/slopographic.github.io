/* SlopCut: the selection rules of the timeline, pure (no DOM): what a click, a tap or a selection box does to the set of
   selected clips. timeline/input.js applies them; tests/node/slopcut-pick.test.mjs checks them.
   A click (or tap) on a clip, with its linked clips as one group:
     plain        the group alone, except when the press starts a drag of a selection that already holds it (then the
                  whole selection moves, and a press that did not move selects the group alone when it lifts)
     Shift        adds the group (extends the selection)
     Ctrl / Cmd   toggles the group (and in Select mode, the phone's multi-select, a plain tap toggles too)
   A selection box takes every clip it touches, across tracks; with Shift (or in Select mode) it adds to the selection. */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis, SE = G.SE = G.SE || {};
  const P = SE.pick = {};

  /** How a press on a clip changes the selection: 'add' | 'toggle' | 'only'. mods: { shift, ctrl, multi }. */
  P.mode = (mods = {}) => (mods.ctrl ? 'toggle' : mods.shift ? 'add' : mods.multi ? 'toggle' : 'only');

  /** The selection after a click on a group of ids (an array of ids), as an array. */
  P.click = function (sel, group, mods = {}) {
    const mode = P.mode(mods), out = new Set(mode === 'only' ? [] : sel);
    if (mode === 'toggle' && group.every((id) => out.has(id))) group.forEach((id) => out.delete(id));
    else group.forEach((id) => out.add(id));
    return [...out];
  };

  /** Does a press on this group keep the selection as it is until the pointer lifts (a drag moves them all)? */
  P.keepsForDrag = (sel, group, mods = {}) => P.mode(mods) === 'only' && group.some((id) => sel.includes(id));

  /** The box between two points: { x, y, w, h }. */
  P.box = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

  /** The ids of the rects ({ id, x, y, w, h }) a box touches (an overlap, not only those inside it). */
  P.inBox = (rects, b) => rects.filter((r) => r && r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y).map((r) => r.id);

  /** The selection a box makes: base (kept when adding) plus what the box touches. */
  P.marquee = (base, rects, b) => [...new Set([...base, ...P.inBox(rects, b)])];

  if (typeof module === 'object' && module.exports) module.exports = P;
})();
