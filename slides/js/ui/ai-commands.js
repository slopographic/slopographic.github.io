/* Slop Slides for the assistant (and Ctrl+K, macros and WebMCP): SlopCmd commands with argument schemas
   (shared/commands/args.js). Loaded on demand by SlopCmd.prepare() (ui/commands.js), after ai-files.js. Every edit is one
   A.change, so one step in the presentation's own undo history; decks are built by the model's own functions
   (core/model.js, core/layouts.js, core/objects.js, core/outline.js). Only delete_slide is destructive. Exposes SS.aiCmd. */
(function () {
  'use strict';
  var SS = window.SS, A = SS.app, M = SS.model, O = SS.objects, X = SS.outline, F = SS.aiFiles, C = window.SlopCmd;
  var K = SS.aiCmd = { list: [], made: [] };
  var LAYOUTS = SS.layouts.list.map(function (l) { return [l.id, l.name]; });
  var THEMES = SS.themes.list.map(function (t) { return [t.id, t.name]; });
  var SIZES = Object.keys(M.SIZES);
  var PH = ['title', 'subtitle', 'body', 'body2', 'quote', 'attribution', 'number'];
  var FONTS = ['heading', 'body'].concat(SS.fonts.LIST);
  var Str = function (name, description, extra) { return Object.assign({ name: name, type: 'string', maxLength: 600, description: description }, extra || {}); };
  var Num = function (name, description, min, max, extra) { return Object.assign({ name: name, type: 'number', min: min, max: max, description: description }, extra || {}); };
  var SLIDE = Num('slide', 'slide number (1 = first) from app_state; the current slide when empty', 1, 500, { integer: true });
  var BULLETS = { name: 'bullets', type: 'array', maxItems: X.MAX_BULLETS, items: { type: 'string' }, description: 'bullet points, one per item; two leading spaces per level indent a point' };
  var BOX = [Num('x', 'left edge in points (a 16:9 slide is 960 × 540)', -2000, 4000), Num('y', 'top edge in points', -2000, 4000), // i18n-ignore
    Num('w', 'width in points', 4, 4000), Num('h', 'height in points', 4, 4000)]; // i18n-ignore
  var SLIDE_ITEM = { type: 'object', properties: { title: { type: 'string' }, subtitle: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } },
    right: { type: 'array', items: { type: 'string' }, description: 'right column bullets (two-content layout)' }, notes: { type: 'string', description: 'speaker notes' }, // i18n-ignore
    layout: { type: 'string', enum: LAYOUTS.map(function (l) { return l[0]; }) } } };

  function add(tool, title, args, run, extra) {
    K.list.push(Object.assign({ id: 'slides.ai.' + tool.replace(/_/g, '-'), tool: tool, title: title, group: 'AI', hidden: true, destructive: false, args: args,
      when: function () { return !!A.deck; },
      run: function (a) { return run(a || (window.SlopCmdArgs ? SlopCmdArgs.defaults(args) : {})); } }, extra || {}));
  }
  function editable() { if (!A.deck) throw new Error('No presentation is open'); if (A.mode !== 'edit') throw new Error('Leave Present mode first'); }
  /** The slide for a 1-based number (the current one when empty), and its index. */
  function slideAt(n) {
    editable();
    var i = n == null ? A.idx : n - 1;
    if (i < 0 || i >= A.deck.slides.length) throw new Error('There is no slide ' + n + ' (the presentation has ' + A.deck.slides.length + ')');
    return { s: A.deck.slides[i], i: i };
  }
  var nth = function (i) { return 'slide ' + (i + 1); };
  function change(label, fn) { var r; A.change(label, function () { r = fn(); }); return r; }
  /** A new tab with this deck; remembered so "Undo all AI changes" can close it again. */
  function openDeck(deck) {
    SS.tabs.open(deck, { name: SS.native.fileName(deck.title) });
    var T = SS.tabs.current();
    if (T) K.made.push(T);
    return T;
  }
  K.colour = function (v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return null;
    if (SS.themes.SLOTS.indexOf(s) >= 0 || /^[a-z0-9]+\/\d+$/.test(s) || s === 'none') return s;
    var c = window.SlopCmdArgs && SlopCmdArgs.toColor(s);
    if (!c) throw new Error('“' + s + '” is not a colour: use #rrggbb, a colour name or a theme slot (' + SS.themes.SLOTS.join(', ') + ')');
    return c;
  };
  var COLOUR = function (name, description) { return Str(name, description + ': #rrggbb, a colour name, or a theme slot (accent1…accent6, text, text2, bg, bg2)', { maxLength: 40 }); };

  add('new_presentation', 'New presentation', [Str('title', 'the presentation name', { maxLength: 200, default: 'Untitled presentation' }), // i18n-ignore
    { name: 'size', type: 'enum', values: SIZES, default: '16:9' }, { name: 'theme', type: 'enum', options: THEMES, default: 'slop' }],
  function (a) {
    var d = M.newDeck({ title: a.title, size: a.size, theme: a.theme });
    openDeck(d);
    return 'Opened a new ' + a.size + ' presentation “' + d.title + '” with the ' + SS.themes.byId(a.theme).name + ' theme in a new tab (1 title slide).'; // i18n-ignore
  }, { description: 'Start a new, empty presentation in a new tab (the open ones stay as they are).' }); // i18n-ignore

  add('build_presentation', 'Build presentation from outline', [Str('title', 'the presentation title (also the title slide)', { maxLength: 200, required: true }), // i18n-ignore
    Str('subtitle', 'title slide subtitle'), { name: 'slides', type: 'array', required: true, maxItems: X.MAX_SLIDES, items: SLIDE_ITEM, // i18n-ignore
      description: 'the slides after the title slide: [{ title, bullets: [..], notes, layout }]' },
    { name: 'size', type: 'enum', values: SIZES, default: '16:9' }, { name: 'theme', type: 'enum', options: THEMES, default: 'slop' },
    { name: 'title_slide', type: 'boolean', default: true, description: 'start with a title slide' }], // i18n-ignore
  function (a) {
    var d = X.build({ title: a.title, subtitle: a.subtitle, size: a.size, theme: a.theme, titleSlide: a.title_slide, slides: a.slides });
    openDeck(d);
    return 'Built “' + d.title + '”: ' + d.slides.length + ' slides, in a new tab. Use export_presentation to save it as PDF or PowerPoint.'; // i18n-ignore
  }, { description: 'Make a whole presentation in one step from an outline (title, then each slide\'s title, bullet points, speaker notes and layout). Opens it in a new tab.' }); // i18n-ignore

  add('add_slide', 'Add slide', [{ name: 'layout', type: 'enum', options: LAYOUTS, description: 'by default from what is given: bullets → title-content' }, // i18n-ignore
    Str('title', 'slide title'), Str('subtitle', 'subtitle (title, section and quote layouts)'), BULLETS, // i18n-ignore
    { name: 'right', type: 'array', maxItems: X.MAX_BULLETS, items: { type: 'string' }, description: 'right column bullets (two-content)' }, // i18n-ignore
    Str('notes', 'speaker notes', { maxLength: 8000 }), Num('after', 'put it after this slide number; 0 = first; after the current slide when empty', 0, 500, { integer: true })], // i18n-ignore
  function (a) {
    editable();
    var at = a.after == null ? A.idx + 1 : Math.min(a.after, A.deck.slides.length);
    var spec = { title: a.title, subtitle: a.subtitle, bullets: a.bullets, right: a.right, notes: a.notes, layout: a.layout };
    var s = change('Add slide', function () { var sl = M.addSlide(A.deck, X.layoutFor(spec), at); X.fill(A.deck, sl, spec); return sl; }); // i18n-ignore
    A.go(at);
    return 'Added ' + nth(at) + ' (' + SS.layouts.byId(s.layout).name + ')' + (a.title ? ' “' + a.title + '”' : '') + '.'; // i18n-ignore
  }, { description: 'Add one slide with a layout, title, bullet points and speaker notes.' }); // i18n-ignore

  /** A text object on a slide: a placeholder by type, or an object by name or id. */
  function target(s, placeholder, object) {
    var o = null;
    if (object) O.walk(s.objects, function (x) { if (!o && (x.id === object || String(x.name).toLowerCase() === String(object).toLowerCase())) o = x; });
    else o = s.objects.filter(function (x) { return x.placeholder === (placeholder || 'title'); })[0];
    if (!o) throw new Error(object ? 'No object “' + object + '” on this slide' : 'This slide has no ' + (placeholder || 'title') + ' placeholder (its layout is ' + s.layout + ')'); // i18n-ignore
    if (o.type !== 'text' && o.type !== 'shape') throw new Error((o.name || 'That object') + ' holds no text'); // i18n-ignore
    return o;
  }
  add('set_text', 'Set text', [SLIDE, { name: 'placeholder', type: 'enum', values: PH, default: 'title', description: 'which placeholder' }, // i18n-ignore
    Str('object', 'or an object name or id from app_state'), Str('text', 'the new text; in body placeholders each line is a bullet', { maxLength: 4000, required: true })],
  function (a) {
    var t = slideAt(a.slide), o = target(t.s, a.placeholder, a.object);
    change('Edit text', function () { // i18n-ignore
      if (o.placeholder === 'body' || o.placeholder === 'body2') o.text = Object.assign({}, o.text, { paras: X.bulletParas(a.text.split(/\r?\n/)) });
      else O.setPlain(o, a.text);
    });
    return 'Set the ' + (o.placeholder || o.name) + ' text on ' + nth(t.i) + '.'; // i18n-ignore
  }, { description: 'Replace the text of a placeholder (title, subtitle, body…) or of a named object on a slide.' }); // i18n-ignore

  add('set_notes', 'Set speaker notes', [SLIDE, Str('notes', 'the speaker notes', { maxLength: 8000, default: '' })], function (a) { // i18n-ignore
    var t = slideAt(a.slide);
    change('Notes', function () { t.s.notes = a.notes || ''; }); // i18n-ignore
    return 'Set the speaker notes of ' + nth(t.i) + '.'; // i18n-ignore
  });

  function frame(a, w, h) {
    var d = A.deck.size, o = { w: a.w || w, h: a.h || h };
    o.x = a.x == null ? (d.w - o.w) / 2 : a.x; o.y = a.y == null ? (d.h - o.h) / 2 : a.y;
    return o;
  }
  function style(a, base) {
    var st = Object.assign({}, base);
    if (a.size) st.size = a.size;
    if (a.color) st.color = K.colour(a.color);
    if (a.bold != null) st.bold = a.bold;
    if (a.italic != null) st.italic = a.italic;
    if (a.align) st.align = a.align;
    if (a.font) st.font = a.font;
    return st;
  }
  var TEXT_STYLE = [Num('size', 'font size in points', 4, 400), COLOUR('color', 'text colour'), { name: 'bold', type: 'boolean' }, { name: 'italic', type: 'boolean' }, // i18n-ignore
    { name: 'align', type: 'enum', options: [['l', 'left'], ['c', 'centre'], ['r', 'right'], ['j', 'justify']] }, { name: 'font', type: 'enum', values: FONTS, description: 'heading and body follow the theme' }]; // i18n-ignore
  K.place = function (s, o, label) { change(label, function () { s.objects.push(o); }); if (s === A.slide()) A.select([o.id]); return o; };

  add('add_text_box', 'Add text box', [SLIDE, Str('text', 'the text; a line break starts a new paragraph', { maxLength: 4000, required: true })].concat(BOX, TEXT_STYLE), // i18n-ignore
  function (a) {
    var t = slideAt(a.slide), o = O.make('text', Object.assign(frame(a, 400, 80), { text: O.defaultText(''),
      style: style(a, { font: 'body', size: 28, color: 'text', bold: false, italic: false, align: 'l', lineHeight: 1.2 }) }));
    O.setPlain(o, a.text);
    K.place(t.s, o, 'Add text'); // i18n-ignore
    return 'Added a text box on ' + nth(t.i) + ' (' + o.name + ', id ' + o.id + ').'; // i18n-ignore
  }, { description: 'Add a text box anywhere on a slide, with font, size, colour and alignment.' }); // i18n-ignore

  add('add_shape', 'Add shape', [SLIDE, { name: 'shape', type: 'enum', options: O.SHAPES.map(function (k) { return [k, O.SHAPE_NAMES[k]]; }), default: 'rect' }].concat(BOX, // i18n-ignore
    [COLOUR('fill', 'fill colour (default accent1)'), COLOUR('line', 'outline colour; none for no outline'), Num('line_width', 'outline width in points', 0, 40), // i18n-ignore
      Str('text', 'text inside the shape', { maxLength: 1000 }), Num('rotation', 'degrees', -360, 360), Num('opacity', '0 to 1', 0, 1)]), // i18n-ignore
  function (a) {
    var t = slideAt(a.slide), p = Object.assign(frame(a, 240, 160), { shape: a.shape });
    if (a.rotation) p.rot = a.rotation;
    if (a.opacity != null) p.opacity = a.opacity;
    var o = O.make('shape', p);
    if (a.fill && !O.isLine(o)) o.fill = K.colour(a.fill) === 'none' ? null : { type: 'solid', color: K.colour(a.fill) };
    if (a.line) o.stroke = K.colour(a.line) === 'none' ? null : Object.assign({ color: 'text', width: 2, dash: 'solid' }, o.stroke || {}, { color: K.colour(a.line) });
    if (a.line_width != null && o.stroke) o.stroke.width = a.line_width;
    if (a.text && o.text) O.setPlain(o, a.text);
    K.place(t.s, o, 'Add shape'); // i18n-ignore
    return 'Added a ' + O.SHAPE_NAMES[a.shape].toLowerCase() + ' on ' + nth(t.i) + ' (id ' + o.id + ').'; // i18n-ignore
  }, { description: 'Add a shape (rectangle, oval, arrow, star, line, callout…) with fill, outline and text.' }); // i18n-ignore

  add('apply_theme', 'Apply theme', [{ name: 'theme', type: 'enum', options: THEMES, description: 'a built-in theme; empty keeps the current one' }, // i18n-ignore
    { name: 'accent', type: 'color', description: 'main accent colour (accent1)' }, { name: 'background', type: 'color', description: 'slide background colour' }, // i18n-ignore
    { name: 'text_color', type: 'color', description: 'main text colour' }, { name: 'heading_font', type: 'enum', values: SS.fonts.LIST }, { name: 'body_font', type: 'enum', values: SS.fonts.LIST }], // i18n-ignore
  function (a) {
    editable();
    change('Theme', function () { // i18n-ignore
      if (a.theme) M.setTheme(A.deck, a.theme);
      var th = A.deck.theme = SS.util.clone(SS.themes.of(A.deck));
      if (a.accent) th.colors.accent1 = a.accent;
      if (a.text_color) th.colors.text = a.text_color;
      if (a.background) { th.colors.bg = a.background; th.background = { type: 'solid', colors: [a.background] }; th.dark = SS.util.luma(a.background) < 0.45; }
      if (a.heading_font) th.fonts.heading = a.heading_font;
      if (a.body_font) th.fonts.body = a.body_font;
    });
    return 'Theme is now ' + A.deck.theme.name + ' (' + A.deck.theme.fonts.heading + ' / ' + A.deck.theme.fonts.body + ').'; // i18n-ignore
  }, { description: 'Change the whole presentation\'s theme, accent, background and text colours, and fonts.' }); // i18n-ignore

  add('set_layout', 'Set slide layout', [SLIDE, { name: 'layout', type: 'enum', options: LAYOUTS, required: true }], function (a) { // i18n-ignore
    var t = slideAt(a.slide);
    change('Layout', function () { SS.layouts.apply(A.deck, t.s, a.layout); }); // i18n-ignore
    return nth(t.i) + ' now uses ' + SS.layouts.byId(a.layout).name + '.'; // i18n-ignore
  });
  add('move_slide', 'Move slide', [SLIDE, Num('to', 'its new slide number', 1, 500, { integer: true, required: true })], function (a) { // i18n-ignore
    var t = slideAt(a.slide), to = Math.min(a.to, A.deck.slides.length) - 1;
    change('Move slide', function () { M.moveSlides(A.deck, [t.s.id], to > t.i ? to + 1 : to); }); // i18n-ignore
    A.go(M.index(A.deck, t.s.id));
    return 'Moved ' + nth(t.i) + ' to ' + nth(M.index(A.deck, t.s.id)) + '.'; // i18n-ignore
  });
  add('delete_slide', 'Delete slide', [SLIDE], function (a) { // i18n-ignore
    var t = slideAt(a.slide);
    if (A.deck.slides.length < 2) throw new Error('A presentation keeps at least one slide');
    change('Delete slide', function () { M.deleteSlides(A.deck, [t.s.id]); }); // i18n-ignore
    A.go(Math.min(t.i, A.deck.slides.length - 1));
    return 'Deleted ' + nth(t.i) + '; ' + A.deck.slides.length + ' slides left.'; // i18n-ignore
  }, { destructive: true, description: 'Delete one slide.' }); // i18n-ignore
  add('go_to_slide', 'Go to slide', [Object.assign({}, SLIDE, { required: true })], function (a) { var t = slideAt(a.slide); A.go(t.i); return 'Showing ' + nth(t.i) + '.'; }); // i18n-ignore
  add('undo', 'Undo', [Num('steps', 'how many steps', 1, 20, { integer: true, default: 1 })], function (a) { // i18n-ignore
    var n = 0; while (n < a.steps && A.hist.canUndo() && A.undo()) n++;
    return 'Undid ' + n + ' step' + (n === 1 ? '' : 's') + '.'; // i18n-ignore
  });

  F.commands(add, { SLIDE: SLIDE, BOX: BOX, Str: Str, slideAt: slideAt, frame: frame, nth: nth });
  C.register(K.list);
  C.provide({ state: F.state, checkpoint: F.checkpoint });
})();
