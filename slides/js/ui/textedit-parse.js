/* Slop Slides: turns the text editor's plain lines back into model paragraphs. Each line keeps the bullet, level and
   alignment of the paragraph in the same position. An unchanged line keeps its runs (bold words, colours); a changed
   line keeps the formatting of a single-run paragraph and otherwise becomes one plain run. Exposes SS.textParse. */
(function () {
  'use strict';
  var SS = window.SS, O = SS.objects;
  var P = SS.textParse = {};

  P.apply = function (o, value) {
    var old = (o.text && o.text.paras) || [], lines = String(value).split('\n');
    var oldText = old.map(function (p) { return (p.runs || []).map(function (r) { return r.t; }).join(''); });
    var last = old[old.length - 1] || {};
    o.text = Object.assign({}, o.text || O.defaultText(''));
    o.text.paras = lines.map(function (line, i) {
      var src = old[i] || last, p = { bullet: src.bullet, level: src.level || 0, align: src.align };
      if (old[i] && oldText[i] === line) p.runs = old[i].runs;
      else if (old[i] && old[i].runs && old[i].runs.length === 1) p.runs = [Object.assign({}, old[i].runs[0], { t: line })];
      else p.runs = [{ t: line }];
      Object.keys(p).forEach(function (k) { if (p[k] === undefined) delete p[k]; });
      return p;
    });
    return o;
  };
})();
