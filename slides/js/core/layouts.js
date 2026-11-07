/* Slop Slides: master layouts and their placeholders. Geometry is in fractions of the slide so a layout fits
   16:9, 4:3 and custom sizes. Text sizes are points on a 540 pt tall slide and scale with the slide height. */
(function () {
  'use strict';
  var SS = window.SS;
  var L = SS.layouts = {};
  function ph(type, x, y, w, h, style, prompt) { return { ph: type, x: x, y: y, w: w, h: h, style: style || {}, prompt: prompt }; }
  var TITLE = { font: 'heading', size: 44, bold: 'theme', color: 'text', valign: 'bottom' };
  var BODY = { font: 'body', size: 28, color: 'text', bullets: true, valign: 'top' };

  L.list = [
    { id: 'title', name: 'Title', phs: [ // i18n-ignore
      ph('title', 0.08, 0.26, 0.84, 0.3, Object.assign({}, TITLE, { size: 66, align: 'c' }), 'Presentation title'), // i18n-ignore
      ph('subtitle', 0.12, 0.6, 0.76, 0.14, { font: 'body', size: 26, color: 'text2', align: 'c', valign: 'top' }, 'Subtitle')] }, // i18n-ignore
    { id: 'title-content', name: 'Title & Content', phs: [ // i18n-ignore
      ph('title', 0.07, 0.06, 0.86, 0.17, TITLE, 'Title'), // i18n-ignore
      ph('body', 0.07, 0.28, 0.86, 0.62, BODY, 'Add your points')] }, // i18n-ignore
    { id: 'two-content', name: 'Two Content', phs: [ // i18n-ignore
      ph('title', 0.07, 0.06, 0.86, 0.17, TITLE, 'Title'), // i18n-ignore
      ph('body', 0.07, 0.28, 0.41, 0.62, BODY, 'Left column'), // i18n-ignore
      ph('body2', 0.52, 0.28, 0.41, 0.62, BODY, 'Right column')] }, // i18n-ignore
    { id: 'section', name: 'Section Header', phs: [ // i18n-ignore
      ph('title', 0.08, 0.34, 0.84, 0.22, Object.assign({}, TITLE, { size: 56 }), 'Section title'), // i18n-ignore
      ph('subtitle', 0.08, 0.58, 0.7, 0.1, { font: 'body', size: 24, color: 'accent1', valign: 'top' }, 'Section subtitle')] }, // i18n-ignore
    { id: 'title-only', name: 'Title Only', phs: [ph('title', 0.07, 0.06, 0.86, 0.17, TITLE, 'Title')] }, // i18n-ignore
    { id: 'blank', name: 'Blank', phs: [] }, // i18n-ignore
    { id: 'image-caption', name: 'Image & Caption', phs: [ // i18n-ignore
      ph('pic', 0.0, 0.0, 0.58, 1.0, {}, 'Drop an image'), // i18n-ignore
      ph('title', 0.63, 0.22, 0.32, 0.3, Object.assign({}, TITLE, { size: 40 }), 'Caption title'), // i18n-ignore
      ph('body', 0.63, 0.55, 0.32, 0.3, { font: 'body', size: 20, color: 'text2', valign: 'top' }, 'Describe the image')] }, // i18n-ignore
    { id: 'quote', name: 'Quote', phs: [ // i18n-ignore
      ph('quote', 0.12, 0.2, 0.76, 0.42, { font: 'heading', size: 44, color: 'text', align: 'c', valign: 'middle', italic: true }, '“A memorable quote.”'),
      ph('attribution', 0.12, 0.66, 0.76, 0.1, { font: 'body', size: 22, color: 'accent1', align: 'c', valign: 'top' }, '— Attribution')] },
    { id: 'big-number', name: 'Big Number', phs: [ // i18n-ignore
      ph('number', 0.08, 0.14, 0.84, 0.46, { font: 'heading', size: 160, bold: true, color: 'accent1', align: 'c', valign: 'bottom' }, '100%'),
      ph('body', 0.14, 0.64, 0.72, 0.18, { font: 'body', size: 26, color: 'text2', align: 'c', valign: 'top' }, 'What the number means')] } // i18n-ignore
  ];
  L.byId = function (id) { return L.list.filter(function (l) { return l.id === id; })[0] || L.list[1]; };
  L.PH_NAMES = { title: 'Title', subtitle: 'Subtitle', body: 'Body', body2: 'Body 2', pic: 'Picture', quote: 'Quote', attribution: 'Attribution', number: 'Number' }; // i18n-ignore

  /** Creates the slide objects for a placeholder spec on a slide of size {w,h}. */
  L.instantiate = function (spec, size, theme) {
    var k = size.h / 540, st = spec.style;
    var box = { x: spec.x * size.w, y: spec.y * size.h, w: spec.w * size.w, h: spec.h * size.h };
    if (spec.ph === 'pic') return SS.objects.make('image', Object.assign(box, { placeholder: 'pic', name: 'Picture', prompt: spec.prompt, media: null })); // i18n-ignore
    var bold = st.bold === 'theme' ? !!(theme && theme.fonts.headingBold) : !!st.bold;
    var size2 = st.size * k * (st.font === 'heading' && theme && theme.fonts.headingScale ? theme.fonts.headingScale : 1);
    return SS.objects.make('text', Object.assign(box, {
      placeholder: spec.ph, name: L.PH_NAMES[spec.ph] || spec.ph, prompt: spec.prompt,
      style: { font: st.font || 'body', size: Math.round(size2 * 10) / 10, color: st.color || 'text', bold: bold, italic: !!st.italic, align: st.align || 'l', lineHeight: st.font === 'heading' ? 1.05 : 1.2 },
      text: { paras: [{ runs: [{ t: '' }], bullet: st.bullets ? 'disc' : 'none' }], valign: st.valign || 'top', autofit: 'shrink' }
    }));
  };

  /** Re-applies a layout to a slide: placeholders are matched by type and keep their content. */
  L.apply = function (deck, slide, layoutId) {
    var lay = L.byId(layoutId), theme = SS.themes.of(deck);
    var old = {}, others = [];
    slide.objects.forEach(function (o) { if (o.placeholder && !old[o.placeholder]) old[o.placeholder] = o; else others.push(o); });
    var out = lay.phs.map(function (spec) {
      var fresh = L.instantiate(spec, deck.size, theme), prev = old[spec.ph];
      if (prev) {
        delete old[spec.ph];
        if (prev.type === fresh.type) {
          prev.x = fresh.x; prev.y = fresh.y; prev.w = fresh.w; prev.h = fresh.h;
          if (fresh.style) prev.style = Object.assign({}, fresh.style, { color: prev.style ? prev.style.color : fresh.style.color });
          prev.prompt = fresh.prompt; return prev;
        }
      }
      return fresh;
    });
    // content of placeholders the new layout has no slot for is kept as free objects (unless empty)
    Object.keys(old).forEach(function (k) { var o = old[k]; if (!SS.objects.isEmpty(o)) { delete o.placeholder; others.push(o); } });
    slide.layout = lay.id;
    slide.objects = out.concat(others);
    return slide;
  };
})();
