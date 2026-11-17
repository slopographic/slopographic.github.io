/* Slop Slides: DOM helpers. D.el(tag, attrs, ...children) builds a node (functions become listeners, true becomes a
   bare attribute, null/false are skipped). D.toast routes to the shared SlopUI toast when it is present. */
(function () {
  'use strict';
  var SS = window.SS;
  var D = SS.dom = {};
  D.el = function (tag, attrs) {
    var n = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    });
    kids.flat().forEach(function (c) { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  };
  D.$ = function (id) { return document.getElementById(id); };
  D.option = function (value, label, cur) { return D.el('option', { value: value, selected: String(value) === String(cur) }, label); };
  D.toast = function (msg, ms) { if (window.SlopUI) SlopUI.toast(msg, ms); };
})();
