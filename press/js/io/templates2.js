/* Slop Press — templates: flyer, business card, zine; plus the New from Template picker. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, M = PR.model, TP = PR.templates, h = U.h;
  var mm = U.UNITS.mm, inch = 72;

  TP.defs.flyer = { make: function () {
    var doc = M.create({ name: 'Flyer', w: 612, h: 792, unit: 'in', pages: 1, facing: false, columns: { count: 3, gutter: 0.2 * inch }, margins: { top: 0.6 * inch, bottom: 0.6 * inch, inside: 0.6 * inch, outside: 0.6 * inch }, bleed: { top: 9, bottom: 9, inside: 9, outside: 9 } }); // i18n-ignore: sample document content
    var ps = doc.styles.para, p = doc.pages[0].items, W = doc.size.w, H = doc.size.h, b = 9, m = 0.6 * inch;
    ps['Mega'] = { basedOn: '[Basic Paragraph]', font: 'Liberation Sans', fontStyle: 'Bold', size: 70, leading: 64, tracking: -30, color: '#0a0a0a', hyphenate: false }; // i18n-ignore: sample document content
    ps['Info'] = { basedOn: '[Basic Paragraph]', font: 'Liberation Sans', size: 13, leading: 18, spaceAfter: 6, hyphenate: false }; // i18n-ignore: sample document content
    ps['Info Head'] = { basedOn: 'Info', fontStyle: 'Bold', caps: 'allcaps', tracking: 100, size: 10, color: '#e0245e', spaceAfter: 2 }; // i18n-ignore: sample document content
    TP.shape(doc, p, 'rect', -b, -b, W + 2 * b, H * 0.58 + b, { fill: '#d4ff3a' });
    TP.image(doc, p, W * 0.42, 40, W * 0.58 + b - 30, H * 0.5, TP.art(700, 640, ['#d4ff3a', '#9be15d', '#00c2d1', '#ff7ac6'], 11), { fit: 'fill', radius: 18 });
    TP.text(doc, p, m, m, W * 0.5, H * 0.5, 'SLOP\nFEST\n2026', 'Mega'); // i18n-ignore: sample document content
    TP.shape(doc, p, 'polygon', W - m - 110, H * 0.5 - 40, 110, 110, { sides: 12, inset: 0.18, fill: '#e0245e', rot: 12 });
    var badge = TP.text(doc, p, W - m - 100, H * 0.5 + 2, 90, 30, 'FREE ENTRY', 'Info Head', { rot: 12 }); // i18n-ignore: sample document content
    doc.stories[badge.story].paras[0].ov = { align: 'center', color: '#ffffff', size: 12 };
    var cw = (W - 2 * m - 2 * 0.2 * inch) / 3, y = H * 0.62;
    [['When', 'Saturday 14 November\nDoors 7 pm'], ['Where', 'The Print Hall\n12 Harbour Street'], ['What', 'Live typesetting, zines, slime and print workshops.']].forEach(function (c, i) { // i18n-ignore: sample document content
      var t = TP.text(doc, p, m + i * (cw + 0.2 * inch), y, cw, 120, c[0] + '\n' + c[1], 'Info'); // i18n-ignore: sample document content
      doc.stories[t.story].paras[0].ps = 'Info Head'; // i18n-ignore: sample document content
    });
    TP.shape(doc, p, 'line', m, H - m - 40, W - 2 * m, 0, { stroke: '#0a0a0a', sw: 2 });
    TP.text(doc, p, m, H - m - 30, W - 2 * m, 30, 'slopographic.com/press  —  made with Slop Press', 'Folio'); // i18n-ignore: sample document content
    return doc;
  } };

  TP.defs.card = { make: function () {
    var doc = M.create({ name: 'Business Card', w: 252, h: 144, unit: 'in', pages: 2, facing: false, columns: { count: 1, gutter: 9 }, margins: { top: 12, bottom: 12, inside: 12, outside: 12 }, bleed: { top: 9, bottom: 9, inside: 9, outside: 9 } }); // i18n-ignore: sample document content
    var ps = doc.styles.para, b = 9, W = 252, H = 144;
    ps['Name'] = { basedOn: '[Basic Paragraph]', font: 'Liberation Sans', fontStyle: 'Bold', size: 15, leading: 17, hyphenate: false }; // i18n-ignore: sample document content
    ps['Role'] = { basedOn: '[Basic Paragraph]', font: 'Liberation Sans', size: 8, leading: 10, tracking: 80, caps: 'allcaps', color: '#666666', spaceAfter: 10, hyphenate: false }; // i18n-ignore: sample document content
    ps['Contact'] = { basedOn: '[Basic Paragraph]', font: 'Liberation Sans', size: 7.5, leading: 10, hyphenate: false }; // i18n-ignore: sample document content
    doc.masters[0].pages[0].items = [];
    var f = doc.pages[0].items;
    TP.shape(doc, f, 'rect', W - 46, -b, 46 + b, H + 2 * b, { fill: '#d4ff3a' });
    var t = TP.text(doc, f, 16, 22, 170, 110, 'Ada Slopworth\nTypesetter-in-chief\nada@slopographic.com\n+1 555 0100\nslopographic.com/press', 'Contact'); // i18n-ignore: sample document content
    var st = doc.stories[t.story]; st.paras[0].ps = 'Name'; st.paras[1].ps = 'Role'; // i18n-ignore: sample document content
    TP.shape(doc, f, 'ellipse', W - 38, H / 2 - 15, 30, 30, { fill: '#0a0a0a' });
    var back = doc.pages[1].items;
    TP.shape(doc, back, 'rect', -b, -b, W + 2 * b, H + 2 * b, { fill: '#0a0a0a' });
    var logo = TP.text(doc, back, 20, H / 2 - 22, W - 40, 44, 'SLOP PRESS', 'Name', { valign: 'center' }); // i18n-ignore: sample document content
    doc.stories[logo.story].paras[0].ov = { align: 'center', color: '#d4ff3a', size: 24, tracking: 120 };
    return doc;
  } };

  TP.defs.zine = { make: function () {
    var doc = M.create({ name: 'Slop Zine', w: 396, h: 612, unit: 'in', pages: 8, facing: true, columns: { count: 1, gutter: 12 }, margins: { top: 40, bottom: 48, inside: 40, outside: 30 }, bleed: { top: 9, bottom: 9, inside: 9, outside: 9 } }); // i18n-ignore: sample document content
    var ps = doc.styles.para, A = doc.masters[0], W = doc.size.w, H = doc.size.h;
    ps['Zine Title'] = { basedOn: 'Heading 1', font: 'Courier', fontStyle: 'Bold', size: 34, leading: 36, tracking: 0 }; // i18n-ignore: sample document content
    ps['Body'] = { basedOn: '[Basic Paragraph]', font: 'Courier', size: 10, leading: 14, align: 'left', indentFirst: 0, spaceAfter: 7, composer: 'kp' }; // i18n-ignore: sample document content
    A.pages.forEach(function (mp, side) {
      var m = PR.pages.marginsSide(doc, side ? 'right' : 'left');
      var fol = TP.text(doc, mp.items, m.left, H - 32, W - m.left - m.right, 14, '— ' + M.PAGE_NUM + ' —', 'Folio'); // i18n-ignore: sample document content
      doc.stories[fol.story].paras[0].ov = { align: 'center' };
    });
    doc.pages[0].master = null;
    var c = doc.pages[0].items, b = 9;
    TP.image(doc, c, -b, -b, W + 2 * b, H + 2 * b, TP.art(600, 920, ['#0a0a0a', '#2f1d6b', '#d4ff3a', '#ff7ac6'], 21));
    var ct = TP.text(doc, c, 30, 40, W - 60, 160, 'THE SLOP ZINE\nissue nº 1', 'Zine Title'); // i18n-ignore: sample document content
    doc.stories[ct.story].paras.forEach(function (p) { p.ov = { color: '#ffffff' }; });
    var prev = null;
    for (var i = 1; i < 7; i++) {
      var m = PR.pages.margins(doc, i), fr = M.item('text', m.left, m.top, W - m.left - m.right, H - m.top - m.bottom);
      PR.items.add(doc, doc.pages[i].items, fr, { text: i === 1 ? 'Cut, fold, staple\n' + TP.COPY.concat(TP.COPY, TP.COPY).join('\n') : '', ps: 'Body', layer: doc.layers[0].id }); // i18n-ignore: sample document content
      if (i === 1) doc.stories[fr.story].paras[0].ps = 'Zine Title'; // i18n-ignore: sample document content
      if (prev) TP.thread(doc, prev, fr);
      prev = fr;
    }
    var back = doc.pages[7].items;
    TP.shape(doc, back, 'rect', -b, -b, W + 2 * b, H + 2 * b, { fill: '#d4ff3a' });
    var bt = TP.text(doc, back, 30, H / 2 - 40, W - 60, 100, 'made with\nSlop Press', 'Zine Title'); // i18n-ignore: sample document content
    doc.stories[bt.story].paras.forEach(function (p) { p.ov = { align: 'center' }; });
    return doc;
  } };
  TP.defs.blank = { make: function () { return M.create({ pages: 4 }); } };

  /** Thumbnail canvas for a template's first page. */
  TP.thumb = function (doc, pageIdx, width) {
    return PR.withDoc(doc, function () { return PR.render.pageCanvas(doc, pageIdx || 0, (width || 150) / doc.size.w, {}); });
  };
  PR.ui = PR.ui || {};
  PR.ui.templates = function () {
    var grid = h('div', { class: 'pr-tpl' }), dlg;
    ['magazine', 'flyer', 'card', 'zine', 'blank'].forEach(function (id) {
      var d = TP.defs[id], doc = d.make(), b = h('button', { type: 'button' });
      var pi = id === 'magazine' ? 1 : 0, cv = TP.thumb(doc, pi, 300);
      PR.render.ready(doc).then(function () { var c2 = TP.thumb(doc, pi, 300); cv.getContext('2d').drawImage(c2, 0, 0); });
      b.append(cv, h('b', null, U.t('press.tpl.' + id + '_name')), h('small', null, U.t('press.tpl.' + id + '_desc')));
      b.addEventListener('click', function () { dlg.close(true); PR.io.openDoc(TP.make(id)).then(function () { U.toast(U.t('press.tpl.opened', { name: U.t('press.tpl.' + id + '_name') })); }); });
      grid.append(b);
    });
    dlg = window.SlopUI.dialog({ title: U.t('press.tpl.title'), body: grid, cls: 'sui-wide', buttons: [{ label: U.t('menu.cancel') }] });
  };
})();
