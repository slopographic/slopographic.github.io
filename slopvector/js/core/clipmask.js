/* SlopVector: clipping masks, pure tree logic and SVG strings (no DOM, so Node tests can load it).
   A clipping mask is a group with `clip: true`. Its last child (the top of the stack) is the clip shape; the children
   before it are the clipped objects. Z-order is the array order: index 0 is the bottom, so the clip sits above what it
   clips. The group draws only the clipped objects inside the clip shape; the shape itself is not drawn. */
(function () {
  'use strict';
  var SV = window.SV = window.SV || {};
  var CM = SV.clipMask = {};

  /** Is o a clipping mask group? */
  CM.isClip = function (o) { return !!o && o.type === 'group' && o.clip === true && Array.isArray(o.children) && o.children.length >= 1; };
  /** The clip shape of a clipping mask (its top child). */
  CM.shape = function (g) { return g.children[g.children.length - 1]; };
  /** The clipped objects of a clipping mask (everything but the shape). */
  CM.content = function (g) { return g.children.slice(0, -1); };

  /** Which objects a clip shape would clip, given the sibling array arr (bottom to top) and the selected ids.
      With several selected siblings the topmost is the shape and the selected ones below it are clipped. With one
      selected object, every sibling below it is clipped. Returns { clip, content } (indices into arr, ascending)
      or null when nothing lies below the shape. */
  CM.plan = function (arr, ids) {
    var sel = [];
    arr.forEach(function (o, i) { if (ids.indexOf(o.id) >= 0) sel.push(i); });
    if (!sel.length) return null;
    var clip = sel[sel.length - 1], content = [];
    if (sel.length > 1) sel.forEach(function (i) { if (i < clip) content.push(i); });
    else for (var i = 0; i < clip; i++) content.push(i);
    return content.length ? { clip: clip, content: content } : null;
  };
  /** Apply a plan to arr in place: the members leave arr and one clipping mask takes the place of the lowest of them.
      mkGroup(children) makes the group object (SV.mk.group in the app). Returns the new group. */
  CM.apply = function (arr, plan, mkGroup) {
    var kids = plan.content.map(function (i) { return arr[i]; }).concat([arr[plan.clip]]);
    var g = mkGroup(kids);
    g.clip = true;
    var drop = plan.content.concat([plan.clip]).sort(function (a, b) { return b - a; });
    drop.forEach(function (i) { arr.splice(i, 1); });
    arr.splice(plan.content[0], 0, g);
    return g;
  };
  /** Release the clipping mask at arr[i]: its objects take its place, the shape on top as before. Returns them. */
  CM.release = function (arr, i) {
    var kids = arr[i].children.slice();
    arr.splice.apply(arr, [i, 1].concat(kids));
    return kids;
  };

  /** SVG for a clipping mask: the clipPath definition (for <defs>) and the group markup. shapeMarkup is the clip
      shape as an element (its fill and stroke are ignored by a clipPath). attrs: the group's own attributes. */
  CM.svg = function (id, shapeMarkup, contentMarkup, attrs) {
    return {
      def: '<clipPath id="' + id + '">' + shapeMarkup + '</clipPath>',
      markup: '<g' + (attrs || '') + '><g clip-path="url(#' + id + ')">' + contentMarkup + '</g></g>'
    };
  };
  /** PDF operators that clip the following content to a path (ops from the PDF path writer). An empty clip hides it. */
  CM.pdfClip = function (ops) { return (ops ? ops : '0 0 0 0 re') + ' W n'; };
})();
