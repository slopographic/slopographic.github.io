/* Slop Slides: the four starter templates. */
(function () {
  'use strict';
  var SS = window.SS, O = SS.objects, TP = SS.templates, M = SS.model;
  function shape(kind, x, y, w, h, extra) { return O.make('shape', Object.assign({ shape: kind, x: x, y: y, w: w, h: h }, extra || {})); }
  function label(text, x, y, w, h, st, extra) {
    var o = O.make('text', Object.assign({ x: x, y: y, w: w, h: h, style: Object.assign({ font: 'body', size: 20, color: 'text', align: 'l', lineHeight: 1.2 }, st || {}) }, extra || {}));
    return O.setPlain(o, text);
  }

  TP.register({ id: 'pitch', name: 'Pitch deck', theme: 'slop', build: function () { // i18n-ignore
    var d = TP.make('slop', 'Pitch deck'); // i18n-ignore
    TP.slide(d, { layout: 'title', title: 'Gooey', subtitle: 'Collaboration that sticks', notes: 'Open with the problem in one sentence. Smile.', section: 'Intro', // i18n-ignore
      objects: [shape('ellipse', 700, 60, 180, 180, { name: 'Blob', fill: { type: 'radial', colors: ['accent1', '#6f8a1a'], cx: 0.35, cy: 0.3 }, opacity: 0.9 })] }); // i18n-ignore
    TP.slide(d, { layout: 'title-content', title: 'The problem', body: ['Teams lose 9 hours a week hunting for files', 'Tools do not talk to each other', { t: 'Context switching kills focus', level: 1 }, 'Everyone pays for five subscriptions'], // i18n-ignore
      transition: { name: 'fade', duration: 1 }, anims: { body: [{ preset: 'slide-up', trigger: 'click' }] },
      objects: [shape('ellipse', 830, 400, 90, 90, { name: 'Blob', fill: { type: 'radial', colors: ['accent2', '#7a1f30'], cx: 0.35, cy: 0.3 } })], notes: 'Pause after each point.' }); // i18n-ignore
    TP.slide(d, { layout: 'big-number', number: '9 h', body: 'lost per person, every week', transition: { name: 'zoom-in', duration: 0.8 } }); // i18n-ignore
    TP.slide(d, { layout: 'two-content', title: 'Our solution', body: ['One shared space', 'Works offline', 'Nothing uploaded'], body2: ['Instant search', 'Live presence', 'Free forever'], transition: { name: 'push-left', duration: 0.7 }, section: 'Product' }); // i18n-ignore
    var s = TP.slide(d, { layout: 'title-only', title: 'Traction', transition: { name: 'fade', duration: 0.6 }, // i18n-ignore
      anims: { 'Stat': [{ preset: 'pop', trigger: 'click' }], 'Stat 2': [{ preset: 'pop', trigger: 'with', at: 0.5 }] }, // i18n-ignore
      objects: [O.make('chart', { x: 70, y: 140, w: 560, h: 340, chart: 'line', data: { cats: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], series: [{ name: 'Weekly users (k)', values: [3, 5, 8, 13, 21, 34] }] }, legend: true }), // i18n-ignore
        shape('roundRect', 670, 160, 230, 130, { name: 'Stat', text: { paras: [{ runs: [{ t: '34k', size: 48 }] }, { runs: [{ t: 'weekly users', size: 18, b: false }] }], valign: 'middle', autofit: 'shrink' } }), // i18n-ignore
        shape('roundRect', 670, 320, 230, 130, { name: 'Stat 2', fill: { type: 'solid', color: 'bg2' }, style: { font: 'body', size: 20, color: 'text', bold: true, align: 'c', lineHeight: 1.15 }, text: { paras: [{ runs: [{ t: '+62%', size: 44, color: 'accent1' }] }, { runs: [{ t: 'month over month', size: 18, b: false }] }], valign: 'middle', autofit: 'shrink' } })] }); // i18n-ignore
    TP.slide(d, { layout: 'quote', quote: '“Finally, a tool that feels like it was made by people who love their craft.”', attribution: '— Early customer', transition: { name: 'fade', duration: 0.8 }, section: 'Close' }); // i18n-ignore
    TP.slide(d, { layout: 'section', title: 'Thank you', subtitle: 'hello@gooey.example', transition: { name: 'push-up', duration: 0.7 } }); // i18n-ignore
    return d;
  } });

  TP.register({ id: 'album', name: 'Photo album', theme: 'midnight', build: function () { // i18n-ignore
    var d = TP.make('midnight', 'Photo album'); // i18n-ignore
    var pics = [0, 1, 2, 3, 4, 5].map(function (i) { return M.addMedia(d, TP.photo(i + 1), 'photo-' + (i + 1) + '.jpg'); });
    TP.slide(d, { layout: 'title', title: 'Summer 2026', subtitle: 'A few favourite moments', background: { type: 'image', media: pics[0], dim: 0.35 } }); // i18n-ignore
    TP.slide(d, { layout: 'image-caption', pic: pics[1], title: 'Morning light', body: 'The first day by the lake.', transition: { name: 'fade', duration: 0.8 } }); // i18n-ignore
    var grid = [[60, 60, 410, 270, pics[2], 'roundRect'], [490, 60, 410, 270, pics[3], 'roundRect'], [60, 350, 260, 150, pics[4], 'roundRect'], [340, 350, 260, 150, pics[5], 'ellipse'], [620, 350, 280, 150, pics[1], 'roundRect']];
    TP.slide(d, { layout: 'blank', transition: { name: 'fade', duration: 1 }, objects: grid.map(function (g, i) { return O.make('image', { x: g[0], y: g[1], w: g[2], h: g[3], media: g[4], mask: g[5], radius: 0.06, name: 'Photo ' + (i + 1), shadow: { blur: 18, dy: 8, opacity: 0.4 } }); }) }); // i18n-ignore
    TP.slide(d, { layout: 'blank', transition: { name: 'fade', duration: 1.1 }, objects: [O.make('image', { x: 0, y: 0, w: 960, h: 540, media: pics[2], name: 'Photo 1' }), label('Golden hour', 60, 430, 600, 70, { font: 'heading', size: 48, bold: true, color: '#ffffff' })] }); // i18n-ignore
    TP.slide(d, { layout: 'quote', quote: '“Take only memories, leave only footprints.”', attribution: '— Chief Seattle', transition: { name: 'fade', duration: 1 } });
    return d;
  } });

  TP.register({ id: 'lesson', name: 'Lesson', theme: 'chalk', build: function () { // i18n-ignore
    var d = TP.make('chalk', 'Lesson: the water cycle'); // i18n-ignore
    TP.slide(d, { layout: 'title', title: 'The Water Cycle', subtitle: 'Science · Grade 5 · Lesson 3' }); // i18n-ignore
    TP.slide(d, { layout: 'title-content', title: 'Today we will learn', body: ['Where rain comes from', 'The four stages of the cycle', 'Why the cycle matters for life'], anims: { body: [{ preset: 'fade-in', trigger: 'click' }] }, transition: { name: 'push-left', duration: 0.6 } }); // i18n-ignore
    var y = 200, stages = ['Evaporation', 'Condensation', 'Precipitation', 'Collection'], objs = []; // i18n-ignore
    stages.forEach(function (s, i) {
      objs.push(shape(i === 1 ? 'cloudCallout' : 'roundRect', 50 + i * 225, y, 190, 120, { name: s, fill: { type: 'solid', color: 'accent' + (i + 1) }, style: { font: 'body', size: 20, color: '#23362b', bold: true, align: 'c', lineHeight: 1.1 }, text: { paras: [{ runs: [{ t: s }] }], valign: 'middle', autofit: 'shrink' } }));
      if (i < 3) objs.push(shape('arrowLine', 245 + i * 225, y + 60, 25, 0, { name: 'Arrow ' + (i + 1), stroke: { color: 'text', width: 3, tail: 'arrow' } })); // i18n-ignore
    });
    TP.slide(d, { layout: 'title-only', title: 'Four stages', objects: objs, // i18n-ignore
      anims: { 'Evaporation': [{ preset: 'pop', trigger: 'click', timeScale: 0.9 }], 'Condensation': [{ preset: 'pop', trigger: 'with', at: 0.6, timeScale: 0.9 }], // i18n-ignore
        'Precipitation': [{ preset: 'pop', trigger: 'with', at: 0.6, timeScale: 0.9 }], 'Collection': [{ preset: 'pop', trigger: 'with', at: 0.6, timeScale: 0.9 }] }, transition: { name: 'push-left', duration: 0.6 }, notes: 'Ask: where does the water in a puddle go?' }); // i18n-ignore
    TP.slide(d, { layout: 'two-content', title: 'Key words', body: ['Vapour: water as a gas', 'Condense: gas turns to liquid'], body2: ['Precipitation: rain, snow, hail', 'Runoff: water flowing to rivers'] }); // i18n-ignore
    TP.slide(d, { layout: 'title-only', title: 'Quick quiz', objects: [O.make('table', { x: 70, y: 150, w: 820, h: 300, cells: [['Question', 'Your answer'], ['What makes water evaporate?', ''], ['What is a cloud made of?', ''], ['Name two kinds of precipitation', '']].map(function (r) { return r.map(function (t) { return { text: O.defaultText(t) }; }); }), header: true, banded: true, accent: 'accent1', style: { font: 'body', size: 18, color: 'text', align: 'l', lineHeight: 1.15 } })] }); // i18n-ignore
    TP.slide(d, { layout: 'section', title: 'Great work!', subtitle: 'Homework: draw the cycle at home' }); // i18n-ignore
    return d;
  } });

  TP.register({ id: 'report', name: 'Quarterly report', theme: 'editorial', build: function () { // i18n-ignore
    var d = TP.make('editorial', 'Q3 2026 report');
    d.master.showNumber = true; d.master.footer = 'Acme Co. · Q3 2026'; // i18n-ignore
    TP.slide(d, { layout: 'title', title: 'Q3 2026 Business Review', subtitle: 'Prepared for the board · October 2026' }); // i18n-ignore
    TP.slide(d, { layout: 'title-content', title: 'Highlights', body: ['Revenue up 18% quarter over quarter', 'Two new markets opened: Nordics and Benelux', 'Churn down to 2.1%', { t: 'Lowest in company history', level: 1 }] , transition: { name: 'fade', duration: 0.5 } }); // i18n-ignore
    TP.slide(d, { layout: 'title-only', title: 'Revenue by quarter', objects: [O.make('chart', { x: 70, y: 140, w: 820, h: 340, chart: 'bar', labels: true, data: { cats: ['Q4 25', 'Q1 26', 'Q2 26', 'Q3 26'], series: [{ name: 'Revenue ($M)', values: [4.2, 4.8, 5.1, 6.0] }, { name: 'Target ($M)', values: [4.0, 4.5, 5.0, 5.5] }] } })] }); // i18n-ignore
    TP.slide(d, { layout: 'two-content', title: 'Market mix', body: ['North America 46%', 'Europe 38%', 'Asia Pacific 16%'], objects: [] }); // i18n-ignore
    var mix = d.slides[3]; mix.objects = mix.objects.filter(function (o) { return o.placeholder !== 'body2'; });
    mix.objects.push(O.make('chart', { x: 500, y: 150, w: 400, h: 330, chart: 'pie', labels: true, data: { cats: ['N. America', 'Europe', 'APAC'], series: [{ name: 'Share', values: [46, 38, 16] }] } })); // i18n-ignore
    TP.slide(d, { layout: 'title-only', title: 'Key metrics', objects: [O.make('table', { x: 70, y: 140, w: 820, h: 320, cells: [['Metric', 'Q2', 'Q3', 'Change'], ['Revenue', '$5.1M', '$6.0M', '+18%'], ['Customers', '1,240', '1,410', '+14%'], ['Churn', '2.6%', '2.1%', '−0.5 pt'], ['NPS', '48', '53', '+5']].map(function (r) { return r.map(function (t) { return { text: O.defaultText(t) }; }); }) })] }); // i18n-ignore
    TP.slide(d, { layout: 'big-number', number: '$6.0M', body: 'Q3 revenue, a new record' }); // i18n-ignore
    TP.slide(d, { layout: 'title-content', title: 'Next quarter', body: ['Launch the enterprise tier', 'Hire 6 engineers', 'Expand partner programme'], section: 'Outlook' }); // i18n-ignore
    return d;
  } });
})();
