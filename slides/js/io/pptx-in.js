/* Slop Slides: PPTX import, part 4 of 4: the package. Reads a PowerPoint file (shared/office/zip.js, xml.js and units.js)
   into a deck: the slide size, the theme (colour scheme through the master's colour map, heading and body fonts), each
   slide's background (slide, else layout, else master), the shapes the master and layout draw on every slide, the
   slide's own objects (pptx-in-shape.js), speaker notes, hidden slides and the transition. Unsupported content is
   counted in the report (charts, SmartArt, video and audio, embedded objects, pictures in formats a browser cannot
   show, shapes drawn as rectangles); SS.pptxIn.summary(report) says it in a sentence.
   SS.pptxIn.read(blob, name) → Promise<{ deck, report }>; SS.pptxIn.fromFiles(files, lib, { name }) does the work on the
   unzipped Map (lib: the three shared/office modules merged, so Node tests can hand them in). */
(function () {
  'use strict';
  var SS = window.SS, I = SS.pptxIn, M = SS.model, U = SS.util, O = SS.objects;
  var BASE = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || (typeof location !== 'undefined' ? location.href : '');
  var MODS = ['zip.js', 'xml.js', 'units.js'];
  var TYPE = { title: 'title', ctrTitle: 'title', subTitle: 'body', body: 'body', obj: 'body' };

  function themeOf(files, path) {
    var el = I.a(I.xml(files, path), 'themeElements'), theme = { path: path, scheme: {}, fonts: {}, lnWidths: [], bgFills: [], name: '' };
    if (!el) return theme;
    theme.name = I.att(el.parentNode, 'name') || '';
    I.lib.kids(I.a(el, 'clrScheme')).forEach(function (c) {
      var s = I.a(c, 'srgbClr'), y = I.a(c, 'sysClr');
      theme.scheme[c.localName] = (s && I.lib.ooxmlToHex(I.att(s, 'val'))) || (y && I.lib.ooxmlToHex(I.att(y, 'lastClr'))) || '#000000';
    });
    var fs = I.a(el, 'fontScheme');
    theme.fonts.major = I.att(I.a(I.a(fs, 'majorFont'), 'latin'), 'typeface') || '';
    theme.fonts.minor = I.att(I.a(I.a(fs, 'minorFont'), 'latin'), 'typeface') || '';
    var fmt = I.a(el, 'fmtScheme');
    theme.lnWidths = I.as(I.a(fmt, 'lnStyleLst'), 'ln').map(function (l) { return I.pt(I.num(l, 'w', 9525)); });
    theme.bgFills = I.lib.kids(I.a(fmt, 'bgFillStyleLst'));
    return theme;
  }
  function clrMapOf(el) {
    if (!el) return null;
    var m = {};
    Array.prototype.forEach.call(el.attributes, function (a) { m[a.localName || a.name] = a.value; });
    return m;
  }
  function phList(tree) {
    return I.lib.kids(tree).filter(function (el) { return el.localName === 'sp' || el.localName === 'pic'; }).map(function (el) {
      var nv = I.p(el, 'nvSpPr') || I.p(el, 'nvPicPr');
      return { ph: I.phOf(I.p(nv, 'nvPr')), el: el };
    }).filter(function (x) { return x.ph; });
  }
  function match(list, ph, byIdx) {
    var hit = null;
    if (byIdx && ph.idx != null) hit = list.filter(function (x) { return x.ph.idx === ph.idx; })[0];
    if (!hit) hit = list.filter(function (x) { return x.ph.type === ph.type; })[0];
    if (!hit) hit = list.filter(function (x) { return TYPE[x.ph.type] && TYPE[x.ph.type] === TYPE[ph.type]; })[0];
    return hit ? hit.el : null;
  }
  function part(files, path, cache) {
    if (cache[path]) return cache[path];
    var root = I.xml(files, path), cSld = I.p(root, 'cSld');
    var p = cache[path] = { path: path, root: root, rels: I.relsOf(files, path), cSld: cSld, tree: I.p(cSld, 'spTree') };
    p.phs = phList(p.tree);
    p.showMasterSp = I.att(root, 'showMasterSp') !== '0';
    p.clrMapOvr = clrMapOf(I.a(I.p(root, 'clrMapOvr'), 'overrideClrMapping'));
    return p;
  }
  function master(files, path, cache) {
    var m = part(files, path, cache);
    if (!m.theme) {
      var th = I.relOfType(m.rels, 'theme');
      m.theme = cache['t:' + (th ? th.target : '')] = cache['t:' + (th ? th.target : '')] || themeOf(files, th ? th.target : '');
      m.clrMap = clrMapOf(I.p(m.root, 'clrMap')) || I.MAP_DEFAULT;
      var tx = I.p(m.root, 'txStyles');
      m.txStyles = { title: I.p(tx, 'titleStyle'), body: I.p(tx, 'bodyStyle'), other: I.p(tx, 'otherStyle') };
    }
    return m;
  }
  /** The import context for one part (slide, layout or master): its relationships, colours and inheritance. */
  function context(env, p, m, layout) {
    var map = p.clrMapOvr || (layout && layout.clrMapOvr) || m.clrMap;
    return { deck: env.deck, files: env.files, report: env.report, mediaIds: env.mediaIds, rels: p.rels, scheme: m.theme.scheme, clrMap: map,
      slots: m.theme.path === env.theme.path && map === m.clrMap, fonts: m.theme.fonts, lnWidths: m.theme.lnWidths, txStyles: m.txStyles,
      defaultText: env.defaultText, used: {}, skipPh: p !== env.slidePart,
      inherit: function (ph) { return [match(m.phs, ph, false), layout && match(layout.phs, ph, true)].filter(Boolean); } };
  }
  function bgSpec(f, ctx) {
    if (!f || f.type === 'none') return null;
    if (f.type === 'solid') return { type: 'solid', colors: [f.color] };
    if (f.type === 'blip') { var id = I.mediaOf(I.rid(I.a(f.el, 'blip')), ctx, 'Background'); return id ? { type: 'image', media: id } : null; } // i18n-ignore
    return f;
  }
  /** A cSld's own background, or null (then the layout's, then the master's). */
  function background(cSld, ctx, theme) {
    var bg = I.p(cSld, 'bg');
    if (!bg) return null;
    var pr = I.p(bg, 'bgPr'), ref = I.p(bg, 'bgRef');
    if (pr) return bgSpec(I.fill(pr, ctx), ctx);
    if (!ref) return null;
    var c = I.color(ref, ctx), idx = I.num(ref, 'idx', 0), el = idx >= 1001 ? theme.bgFills[idx - 1001] : null;
    if (el && c) return bgSpec(I.fillEl(el, Object.assign({}, ctx, { ph: c.hex, phRef: c.ref })), ctx);
    return c ? { type: 'solid', colors: [c.ref] } : null;
  }
  function transition(root) {
    var trans = root.getElementsByTagNameNS(I.lib.NS.p, 'transition')[0], out = { name: 'none', duration: 0.6 };
    if (!trans) return out;
    var dur = null;
    Array.prototype.forEach.call(trans.attributes, function (a) { if ((a.localName || a.name).replace(/^.*:/, '') === 'dur') dur = +a.value / 1000; });
    out.duration = dur || { slow: 1, med: 0.75, fast: 0.5 }[I.att(trans, 'spd') || 'fast'] || 0.5;
    var k = I.lib.kids(trans).filter(function (e) { return e.localName !== 'sndAc' && e.localName !== 'extLst'; })[0];
    if (!k) return out;
    var n = k.localName, dir = I.att(k, 'dir');
    var DIR = { l: 'left', r: 'right', u: 'up', d: 'down', lu: 'left', ru: 'right', ld: 'left', rd: 'right' };
    if (n === 'cut') out.name = 'none';
    else if (n === 'push' || n === 'cover' || n === 'pull') out.name = 'push-' + (DIR[dir] || 'left');
    else if (n === 'wipe') out.name = 'wipe';
    else if (n === 'zoom') out.name = dir === 'out' ? 'zoom-out' : 'zoom-in';
    else if (n === 'cube' || n === 'prism') out.name = 'cube';
    else out.name = 'fade';
    return out;
  }
  function notes(files, rels) {
    var r = I.relOfType(rels, 'notesSlide'), root = r && I.xml(files, r.target);
    if (!root) return '';
    var body = I.lib.kids(I.p(I.p(root, 'cSld'), 'spTree')).filter(function (el) {
      var ph = el.localName === 'sp' && I.phOf(I.p(I.p(el, 'nvSpPr'), 'nvPr'));
      return ph && ph.type === 'body';
    })[0];
    return body ? I.plainText(I.p(body, 'txBody')).replace(/\s+$/, '') : '';
  }
  function decorations(env, p, m, layout, key) {
    if (!env.decor[key]) env.decor[key] = I.objects(p.tree, context(env, p, m, layout));
    return env.decor[key].map(function (o) { return O.reId(U.clone(o)); });
  }
  function sizeOf(pres) {
    var s = I.p(pres, 'sldSz'), w = I.pt(I.num(s, 'cx', 12192000)), h = I.pt(I.num(s, 'cy', 6858000)), preset = 'custom';
    Object.keys(M.SIZES).forEach(function (k) { var z = M.SIZES[k]; if (Math.abs(z.w / z.h - w / h) < 0.005) preset = k; });
    return { w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100, preset: preset };
  }
  function title(files, name) {
    var core = I.xml(files, 'docProps/core.xml'), node = core && I.lib.kids(core, I.lib.NS.dc, 'title')[0];
    return (node && node.textContent.trim()) || String(name || '').replace(/\.[^.]+$/, '') || 'Imported presentation'; // i18n-ignore
  }

  I.fromFiles = function (files, lib, opts) {
    I.lib = lib;
    var rootRel = I.relOfType(I.relsOf(files, ''), 'officeDocument'), presPath = rootRel ? rootRel.target : 'ppt/presentation.xml';
    var pres = I.xml(files, presPath);
    if (!pres) throw new Error('This is not a PowerPoint presentation');
    if (pres.namespaceURI !== lib.NS.p) throw new Error('This PowerPoint file is in the Strict format, which Slop Slides cannot read yet');
    var presRels = I.relsOf(files, presPath), cache = {};
    var report = { slides: 0, charts: 0, smartart: 0, media: 0, ole: 0, pictures: 0, approx: 0, other: 0 };
    var deck = M.newDeck({ empty: true, title: title(files, opts && opts.name) });
    deck.size = sizeOf(pres);
    var slidePaths = I.ps(I.p(pres, 'sldIdLst'), 'sldId').map(function (s) { var r = presRels[I.rid(s, 'id')]; return r && r.target; }).filter(Boolean);
    var firstMaster = I.ps(I.p(pres, 'sldMasterIdLst'), 'sldMasterId').map(function (s) { var r = presRels[I.rid(s, 'id')]; return r && r.target; })[0];
    var env = { deck: deck, files: files, report: report, mediaIds: {}, decor: {}, defaultText: I.p(pres, 'defaultTextStyle') };
    var m0 = firstMaster ? master(files, firstMaster, cache) : null;
    env.theme = m0 ? m0.theme : { path: '', scheme: {}, fonts: {} };
    if (m0) {
      var c0 = context(env, m0, m0, null), col = function (n) { return I.schemeHex(n, c0); };
      deck.theme = { id: 'pptx', name: env.theme.name || 'PowerPoint theme', colors: { bg: col('bg1'), bg2: col('bg2'), text: col('tx1'), text2: col('tx2'), // i18n-ignore
        accent1: col('accent1'), accent2: col('accent2'), accent3: col('accent3'), accent4: col('accent4'), accent5: col('accent5'), accent6: col('accent6') },
        fonts: { heading: env.theme.fonts.major || 'Calibri Light', body: env.theme.fonts.minor || 'Calibri', headingBold: false } }; // i18n-ignore
      deck.theme.background = background(m0.cSld, c0, m0.theme) || { type: 'solid', colors: [deck.theme.colors.bg] };
      deck.theme.dark = U.luma(deck.theme.colors.bg) < 0.45;
    }
    slidePaths.forEach(function (path) {
      var sp = part(files, path, cache), lr = I.relOfType(sp.rels, 'slideLayout'), layout = lr ? part(files, lr.target, cache) : null;
      var mr = layout && I.relOfType(layout.rels, 'slideMaster'), m = mr ? master(files, mr.target, cache) : m0;
      if (!m) throw new Error('The presentation has no slide master');
      env.slidePart = sp;
      var s = M.newSlide(deck, 'blank'), ctx = context(env, sp, m, layout);
      var objs = [];
      if (sp.showMasterSp && (!layout || layout.showMasterSp)) objs = objs.concat(decorations(env, m, m, null, m.path));
      if (layout && sp.showMasterSp) objs = objs.concat(decorations(env, layout, m, layout, layout.path));
      s.objects = objs.concat(I.objects(sp.tree, ctx));
      var bg = background(sp.cSld, ctx, m.theme) || (layout && background(layout.cSld, context(env, layout, m, layout), m.theme));
      if (!bg && m !== m0) bg = background(m.cSld, context(env, m, m, null), m.theme);
      s.background = bg || null;
      s.hidden = I.att(sp.root, 'show') === '0';
      s.notes = notes(files, sp.rels);
      s.transition = transition(sp.root);
      deck.slides.push(s);
      report.slides++;
    });
    if (!deck.slides.length) M.addSlide(deck, 'title');
    return { deck: deck, report: report };
  };

  I.read = async function (blob, name) {
    var mods = await Promise.all(MODS.map(function (f) { return import(new URL('../../../shared/office/' + f, BASE).href); }));
    var lib = Object.assign({}, mods[0], mods[1], mods[2]);
    var files = await lib.readZip(blob);
    return I.fromFiles(files, lib, { name: name });
  };

  /** One sentence about what was left out, or '' when everything came in. */
  I.summary = function (r) {
    var t = SS.util.t, n = function (k) { return r[k] ? t(`slides.io.ni_${k}`, { n: r[k] }) : null; };   // the words: slides/i18n/<code>/io.js
    var out = ['charts', 'smartart', 'media', 'ole', 'pictures', 'other'].map(n).filter(Boolean);
    var s = out.length ? t('slides.io.not_imported', { list: out.join(', ') }) : '';
    if (r.approx) s += (s ? ' ' : '') + t('slides.io.approx', { n: r.approx });
    return s;
  };
})();
