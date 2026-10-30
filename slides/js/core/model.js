/* Slop Slides: the deck model and its operations (slides, sections, size, theme, media, z-order, alignment).
   deck = { version: 2, title, size {w,h,preset}, theme {…full theme…}, master {footer, showNumber},
            slides: [{ id, layout, hidden, section, background, objects, notes, transition: {name, duration} }], media: { id: {mime, data, name} } }
   Objects may carry anims: [{ id, preset, trigger, at, timeScale }] (see anim/object.js). */
(function () {
  'use strict';
  var SS = window.SS, U = SS.util, O = SS.objects;
  var M = SS.model = {};
  M.SIZES = { '16:9': { w: 960, h: 540 }, '4:3': { w: 720, h: 540 }, '16:10': { w: 864, h: 540 }, 'A4': { w: 842, h: 595 } };

  M.newDeck = function (opts) {
    opts = opts || {};
    var sz = M.SIZES[opts.size || '16:9'] || M.SIZES['16:9'];
    var deck = { version: 2, title: opts.title || 'Untitled presentation', size: { w: sz.w, h: sz.h, preset: opts.size || '16:9' }, // i18n-ignore
      theme: U.clone(SS.themes.byId(opts.theme || 'slop')), master: { footer: '', showNumber: false }, slides: [], media: {} };
    if (opts.empty !== true) M.addSlide(deck, 'title');
    return deck;
  };
  M.newSlide = function (deck, layoutId) {
    var s = { id: U.uid('s'), layout: layoutId || 'title-content', hidden: false, section: null, background: null, objects: [], notes: '', transition: { name: 'none', duration: 0.6 } };
    return SS.layouts.apply(deck, s, s.layout);
  };
  M.addSlide = function (deck, layoutId, at) {
    var s = M.newSlide(deck, layoutId);
    deck.slides.splice(at == null ? deck.slides.length : at, 0, s);
    return s;
  };
  M.index = function (deck, id) { for (var i = 0; i < deck.slides.length; i++) if (deck.slides[i].id === id) return i; return -1; };
  M.slide = function (deck, id) { return deck.slides[M.index(deck, id)] || null; };
  M.duplicateSlide = function (deck, id) {
    var i = M.index(deck, id), s = U.clone(deck.slides[i]);
    s.id = U.uid('s'); s.section = null;
    O.walk(s.objects, function (o) { o.id = U.uid(o.type[0]); });
    deck.slides.splice(i + 1, 0, s);
    return s;
  };
  M.deleteSlides = function (deck, ids) {
    var keep = deck.slides.filter(function (s) { return ids.indexOf(s.id) < 0; });
    if (!keep.length) keep = [M.newSlide(deck, 'title')];
    // a deleted section start hands its section name to the next surviving slide
    deck.slides.forEach(function (s, i) {
      if (ids.indexOf(s.id) >= 0 && s.section) {
        for (var j = i + 1; j < deck.slides.length; j++) if (ids.indexOf(deck.slides[j].id) < 0) { if (!deck.slides[j].section) deck.slides[j].section = s.section; break; }
      }
    });
    deck.slides = keep;
  };
  /** Moves the slides with `ids` (keeping their order) so they land before index `to` of the current list. */
  M.moveSlides = function (deck, ids, to) {
    var moving = deck.slides.filter(function (s) { return ids.indexOf(s.id) >= 0; });
    var before = deck.slides.slice(0, to).filter(function (s) { return ids.indexOf(s.id) < 0; }).length;
    var rest = deck.slides.filter(function (s) { return ids.indexOf(s.id) < 0; });
    rest.splice.apply(rest, [before, 0].concat(moving));
    deck.slides = rest;
  };
  M.toggleHidden = function (deck, ids) {
    var to = !deck.slides.filter(function (s) { return ids.indexOf(s.id) >= 0; }).every(function (s) { return s.hidden; });
    deck.slides.forEach(function (s) { if (ids.indexOf(s.id) >= 0) s.hidden = to; });
  };
  /** Sections: a slide with `section` set starts a named section that runs until the next one. */
  M.sections = function (deck) {
    var out = [], cur = null;
    deck.slides.forEach(function (s, i) {
      if (s.section || !cur) { cur = { name: s.section || '', start: i, slides: [] }; out.push(cur); }
      cur.slides.push(s);
    });
    return out;
  };
  M.visibleSlides = function (deck) { return deck.slides.filter(function (s) { return !s.hidden; }); };

  /** Changes the slide size; objects are scaled to fit (uniformly, centred) so nothing falls off. */
  M.setSize = function (deck, w, h, preset) {
    var ow = deck.size.w, oh = deck.size.h, k = Math.min(w / ow, h / oh), dx = (w - ow * k) / 2, dy = (h - oh * k) / 2;
    deck.slides.forEach(function (s) {
      s.objects.forEach(function (o) {
        o.x = o.x * k + dx; o.y = o.y * k + dy; o.w *= k; o.h *= k;
        scaleText(o, k);
      });
    });
    deck.size = { w: w, h: h, preset: preset || 'custom' };
  };
  function scaleText(o, k) {
    if (o.style && o.style.size) o.style.size = U.round(o.style.size * k, 1);
    if (o.stroke && o.stroke.width) o.stroke.width = U.round(o.stroke.width * k, 2);
    if (o.text) o.text.paras.forEach(function (p) { p.runs.forEach(function (r) { if (r.size) r.size = U.round(r.size * k, 1); }); });
    if (o.type === 'table') { o.colW = o.colW.map(function (v) { return v * k; }); o.rowH = o.rowH.map(function (v) { return v * k; }); }
    if (o.children) o.children.forEach(function (c) { scaleText(c, 1); });
  }
  M.setTheme = function (deck, themeId) { deck.theme = U.clone(SS.themes.byId(themeId)); };

  /* ---------- media ---------- */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i += Math.max(1, (s.length / 4096) | 0)) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); }
  M.addMedia = function (deck, dataUrl, name) {
    deck.media = deck.media || {};
    var id = 'm' + hash(dataUrl);
    if (!deck.media[id]) deck.media[id] = { mime: U.dataUrlMime(dataUrl), data: dataUrl, name: name || '' };
    return id;
  };
  M.mediaUsed = function (deck) {
    var used = {};
    deck.slides.forEach(function (s) {
      O.walk(s.objects, function (o) { if (o.media) used[o.media] = 1; if (o.poster) used[o.poster] = 1; });
      if (s.background && s.background.media) used[s.background.media] = 1;
    });
    return used;
  };
  M.gcMedia = function (deck) { var used = M.mediaUsed(deck); Object.keys(deck.media || {}).forEach(function (k) { if (!used[k]) delete deck.media[k]; }); };

  /* ---------- z-order ---------- */
  M.zorder = function (list, objs, how) {
    var sel = list.filter(function (o) { return objs.indexOf(o) >= 0; }), rest = list.filter(function (o) { return objs.indexOf(o) < 0; });
    var out;
    if (how === 'front') out = rest.concat(sel);
    else if (how === 'back') out = sel.concat(rest);
    else {
      out = list.slice();
      var step = how === 'forward' ? 1 : -1, order = how === 'forward' ? out.slice().reverse() : out.slice();
      order.forEach(function (o) {
        if (objs.indexOf(o) < 0) return;
        var i = out.indexOf(o), j = i + step;
        if (j < 0 || j >= out.length || objs.indexOf(out[j]) >= 0) return;
        out[i] = out[j]; out[j] = o;
      });
    }
    list.length = 0; Array.prototype.push.apply(list, out);
  };

  /* ---------- alignment & distribution (by rotated bounds) ---------- */
  M.align = function (objs, how, frame) {
    var u = frame || O.union(objs);
    objs.forEach(function (o) {
      var b = O.bounds(o);
      if (how === 'left') o.x += u.x - b.x;
      else if (how === 'right') o.x += u.x + u.w - (b.x + b.w);
      else if (how === 'hcenter') o.x += u.x + u.w / 2 - (b.x + b.w / 2);
      else if (how === 'top') o.y += u.y - b.y;
      else if (how === 'bottom') o.y += u.y + u.h - (b.y + b.h);
      else if (how === 'vmiddle') o.y += u.y + u.h / 2 - (b.y + b.h / 2);
    });
  };
  M.distribute = function (objs, axis) {
    if (objs.length < 3) return;
    var X = axis === 'h' ? 'x' : 'y', W = axis === 'h' ? 'w' : 'h';
    var items = objs.map(function (o) { return { o: o, b: O.bounds(o) }; }).sort(function (a, b) { return a.b[X] - b.b[X]; });
    var first = items[0].b, last = items[items.length - 1].b;
    var total = items.reduce(function (s, it) { return s + it.b[W]; }, 0);
    var gap = (last[X] + last[W] - first[X] - total) / (items.length - 1), pos = first[X];
    items.forEach(function (it) { it.o[X] += pos - it.b[X]; pos += it.b[W] + gap; });
  };

})();
