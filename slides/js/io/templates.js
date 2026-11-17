/* Slop Slides: template helpers and the welcome templates (pitch deck, photo album, lesson, quarterly report).
   Each template is built from the layouts and themes, so it stays editable like any deck. */
(function () {
  'use strict';
  var SS = window.SS, M = SS.model, O = SS.objects, U = SS.util;
  var TP = SS.templates = {};

  function ph(slide, type) { return slide.objects.filter(function (o) { return o.placeholder === type; })[0]; }
  /** Fills a placeholder: string, array of lines, or [{t, level}] for bullets. */
  TP.fill = function (slide, type, content) {
    var o = ph(slide, type); if (!o || content == null) return o;
    if (o.type === 'image') { o.media = content; return o; }
    var bullet = o.text.paras[0].bullet;
    var lines = Array.isArray(content) ? content : [content];
    o.text.paras = lines.map(function (l) {
      var p = typeof l === 'string' ? { runs: [{ t: l }] } : { runs: l.runs || [{ t: l.t, b: l.b, color: l.color }], level: l.level || 0 };
      p.bullet = typeof l === 'object' && l.bullet ? l.bullet : (Array.isArray(content) ? bullet : 'none');
      return p;
    });
    return o;
  };
  /** Adds a slide from a spec: { layout, title, subtitle, body, body2, number, quote, attribution, pic, objects, notes,
      transition: {name, duration}, anims: { placeholderOrObjectName: [{ preset, trigger, at, timeScale }] }, section, background } */
  TP.slide = function (deck, s) {
    var slide = M.addSlide(deck, s.layout || 'title-content');
    ['title', 'subtitle', 'body', 'body2', 'number', 'quote', 'attribution', 'pic'].forEach(function (k) { if (s[k] != null) TP.fill(slide, k, s[k]); });
    (s.objects || []).forEach(function (o) { slide.objects.push(o.type ? o : O.make(o.kind, o.props)); });
    if (s.notes) slide.notes = s.notes;
    if (s.transition) slide.transition = { name: s.transition.name, duration: SS.anim.clampDuration(s.transition.duration) };
    if (s.section) slide.section = s.section;
    if (s.background) slide.background = s.background;
    Object.keys(s.anims || {}).forEach(function (key) {
      slide.objects.filter(function (o) { return o.placeholder === key || o.name === key; }).forEach(function (o) {
        o.anims = (o.anims || []).concat(s.anims[key].map(function (a) {
          return Object.assign(SS.anim.make(a.preset, a.trigger), { at: a.at || 0, timeScale: a.timeScale || 1 });
        }));
      });
    });
    if (s.hidden) slide.hidden = true;
    return slide;
  };
  TP.make = function (themeId, title, size) { var d = M.newDeck({ theme: themeId, title: title, size: size, empty: true }); return d; };

  /** A generated "photo" (a landscape) as a JPEG data URL, so templates need no image files. */
  TP.photo = function (seed, w, h) {
    w = w || 960; h = h || 640;
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var c = cv.getContext('2d'), rnd = (function (s) { return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })(seed * 7919 + 13);
    var skies = [['#ffb88c', '#de6262'], ['#83a4d4', '#b6fbff'], ['#2c3e50', '#fd746c'], ['#0f2027', '#2c5364'], ['#f6d365', '#fda085'], ['#a1c4fd', '#c2e9fb']];
    var sky = skies[seed % skies.length], g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,250,230,.85)'; c.beginPath(); c.arc(w * (0.2 + rnd() * 0.6), h * (0.2 + rnd() * 0.2), h * 0.07, 0, 7); c.fill();
    for (var L = 0; L < 4; L++) {
      var base = h * (0.5 + L * 0.13), amp = h * (0.12 - L * 0.02);
      c.fillStyle = U.mix(sky[1], '#10161c', 0.35 + L * 0.18);
      c.beginPath(); c.moveTo(0, h);
      for (var x = 0; x <= w; x += w / 24) c.lineTo(x, base - Math.abs(Math.sin(x / w * (3 + L) + seed + L * 2)) * amp - rnd() * amp * 0.25);
      c.lineTo(w, h); c.fill();
    }
    return cv.toDataURL('image/jpeg', 0.85);
  };
  TP.list = [];
  TP.register = function (t) { TP.list.push(t); };
  TP.byId = function (id) { return TP.list.filter(function (t) { return t.id === id; })[0]; };
})();
