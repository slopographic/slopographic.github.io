/* Slop Slides: a deck from an outline, with the model's own functions (model.js, layouts.js, objects.js). Pure: no DOM, so
   the editor's "Build presentation from outline" command, the headless operation (shared/ops/create-slides.js) and the Node
   tests all build the same deck.
     outline = { title, subtitle, size: '16:9' | '4:3' | '16:10' | 'A4', theme: theme id, titleSlide: true,
                 slides: [{ title, subtitle, bullets: ['text' | { text, level }], right: [bullets for the right column],
                            notes, layout: layout id }] }
   A Markdown outline works too: "# Deck title", a line of text under it (the subtitle), "## Slide title" for each slide,
   "- bullet" (indent two spaces per level), and "> note" or "Notes: …" lines for the speaker notes.
     SS.outline.parse(input)              an outline from an object, JSON text or Markdown text (throws with a reason)
     SS.outline.build(outline)            → a new deck
     SS.outline.fill(deck, slide, spec)   puts title, subtitle, bullets and notes into a slide's placeholders
     SS.outline.layoutFor(spec)           the layout a slide spec gets when it names none
     SS.outline.bulletParas(list)         bullets as text paragraphs (level 0–4)
     SS.outline.summary(deck)             [{ slide, layout, title, text, notes, objects }] for the assistant */
(function () {
  'use strict';
  var SS = window.SS, M = SS.model, L = SS.layouts, O = SS.objects;
  var X = SS.outline = {};
  X.MAX_SLIDES = 80;
  X.MAX_BULLETS = 16;
  var str = function (v, n) { return v == null ? '' : String(v).slice(0, n || 2000); };

  X.bulletParas = function (list) {
    return [].concat(list || []).slice(0, X.MAX_BULLETS).map(function (b) {
      var t = typeof b === 'object' && b ? (b.text != null ? b.text : b.t) : b, lvl = typeof b === 'object' && b ? Number(b.level) || 0 : 0;
      var m = /^(\s*)/.exec(String(t == null ? '' : t));
      if (!lvl && m && m[1].length >= 2) lvl = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
      return { runs: [{ t: str(t, 600).trim() }], bullet: 'disc', level: Math.max(0, Math.min(4, lvl)) };
    }).filter(function (p) { return p.runs[0].t; });
  };

  X.layoutFor = function (s) {
    if (s.layout && L.list.some(function (l) { return l.id === s.layout; })) return s.layout;
    var hasBullets = s.bullets && [].concat(s.bullets).length;
    if (s.right && [].concat(s.right).length) return 'two-content';
    if (hasBullets) return 'title-content';
    if (s.subtitle) return 'section';
    return s.title ? 'title-only' : 'blank';
  };

  function ph(slide, type) { return slide.objects.filter(function (o) { return o.placeholder === type; })[0] || null; }
  function setText(o, text) { if (o && text != null && String(text) !== '') O.setPlain(o, str(text, 4000)); return o; }
  function setBullets(o, list) {
    var paras = X.bulletParas(list);
    if (o && paras.length) o.text = Object.assign({}, o.text || O.defaultText(''), { paras: paras });
    return paras.length;
  }

  /** The slide's placeholders get the spec's texts. Layouts without a body put the bullets into a text box of their own. */
  X.fill = function (deck, slide, s) {
    var lay = slide.layout;
    var titleSlot = lay === 'quote' ? 'quote' : lay === 'big-number' ? 'number' : 'title';
    var subSlot = lay === 'quote' ? 'attribution' : 'subtitle';
    if (s.title != null) setText(ph(slide, titleSlot), s.title);
    if (s.subtitle != null) setText(ph(slide, subSlot) || (lay === 'big-number' || lay === 'image-caption' ? ph(slide, 'body') : null), s.subtitle);
    if (s.bullets && [].concat(s.bullets).length) {
      var body = ph(slide, 'body');
      if (!body) {
        body = O.make('text', { x: deck.size.w * 0.07, y: deck.size.h * 0.3, w: deck.size.w * 0.86, h: deck.size.h * 0.6, name: 'Points', // i18n-ignore
          style: { font: 'body', size: Math.round(24 * deck.size.h / 540), color: 'text', bold: false, italic: false, align: 'l', lineHeight: 1.2 } });
        slide.objects.push(body);
      }
      setBullets(body, s.bullets);
    }
    if (s.right && [].concat(s.right).length) setBullets(ph(slide, 'body2'), s.right);
    if (s.notes != null) slide.notes = str([].concat(s.notes).join('\n'), 8000);
    return slide;
  };

  X.build = function (input) {
    var o = X.parse(input);
    var deck = M.newDeck({ size: M.SIZES[o.size] ? o.size : '16:9', theme: o.theme || 'slop', title: str(o.title, 200) || 'Untitled presentation', empty: true }); // i18n-ignore
    if (o.title && o.titleSlide !== false) X.fill(deck, M.addSlide(deck, 'title'), { title: o.title, subtitle: o.subtitle, notes: o.notes });
    (o.slides || []).slice(0, X.MAX_SLIDES).forEach(function (s) {
      s = typeof s === 'string' ? { title: s } : (s || {});
      X.fill(deck, M.addSlide(deck, X.layoutFor(s)), s);
    });
    if (!deck.slides.length) M.addSlide(deck, 'title');
    return deck;
  };

  /** "# Title / subtitle / ## Slide / - bullet / > note" into an outline object. */
  X.fromMarkdown = function (text) {
    var out = { title: '', subtitle: '', slides: [] }, cur = null;
    String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (line) {
      var m;
      if (!line.trim()) return;
      if ((m = /^#\s+(.*)$/.exec(line)) && !out.title && !cur) { out.title = m[1].trim(); return; }
      if ((m = /^#{1,3}\s+(.*)$/.exec(line))) { cur = { title: m[1].trim(), bullets: [], notes: [] }; out.slides.push(cur); return; }
      if ((m = /^(\s*)[-*+•]\s+(.*)$/.exec(line)) || (m = /^(\s*)\d+[.)]\s+(.*)$/.exec(line))) {
        if (!cur) { cur = { title: '', bullets: [], notes: [] }; out.slides.push(cur); }
        cur.bullets.push({ text: m[2], level: Math.floor(m[1].replace(/\t/g, '  ').length / 2) }); return;
      }
      if ((m = /^\s*(?:>\s?|notes?:\s*)(.*)$/i.exec(line))) { if (cur) cur.notes.push(m[1]); return; }
      if (!cur) { if (out.title && !out.subtitle) out.subtitle = line.trim(); return; }
      if (!cur.bullets.length && !cur.subtitle) cur.subtitle = line.trim(); else cur.bullets.push(line.trim());
    });
    out.slides.forEach(function (s) { s.notes = s.notes.join('\n'); if (!s.notes) delete s.notes; if (!s.subtitle) delete s.subtitle; });
    return out;
  };

  X.parse = function (input) {
    if (input && typeof input === 'object') return Array.isArray(input) ? { slides: input } : input;
    var s = String(input == null ? '' : input).trim();
    if (!s) throw new Error('The outline is empty.');
    if (/^[[{]/.test(s)) {
      var j;
      try { j = JSON.parse(s); } catch (e) { throw new Error('The outline is not valid JSON: ' + e.message); }
      return X.parse(j);
    }
    return X.fromMarkdown(s);
  };

  X.summary = function (deck) {
    return deck.slides.map(function (s, i) {
      var texts = [];
      O.walk(s.objects, function (o) { if (o.text && o.text.paras) { var t = O.plain(o.text).trim(); if (t) texts.push({ placeholder: o.placeholder || null, name: o.name, text: t.slice(0, 200) }); } });
      var t = ph(s, 'title') || ph(s, 'quote') || ph(s, 'number');
      return { slide: i + 1, layout: s.layout, hidden: !!s.hidden, title: t ? O.plain(t.text).slice(0, 120) : '', texts: texts.slice(0, 8),
        notes: (s.notes || '').slice(0, 200), objects: s.objects.length };
    });
  };
})();
