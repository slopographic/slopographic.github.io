/* Slop Press — Properties panel: object geometry/appearance/frame options/wrap, paragraph details while
   editing text, document basics when nothing is selected. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, h = U.h, S = PR.state, K = PR.kit, H = PR.history, FM = PR.format;
  var UI = PR.ui = PR.ui || {};
  var refs = [], t = U.t, u = function (k) { return t('press.props.undo.' + k); };
  function sec(title) { return h('div', { class: 'psec' }, h('div', { class: 'psec-title' }, title)); }
  function r(el) { refs.push(el.refresh); return el; }
  function f(label, el, title) { var x = K.field(label, el, title); return x; }
  function n(o) { return r(K.num(o)); }

  function objectProps(body, its) {
    var it = its[0], set = function (fn, label) { return function (v) { its.forEach(function (x) { fn(x, v); }); H.commit(label); }; };
    var tr = sec(t('press.props.sec_transform')), g = h('div', { class: 'grid2' });
    [['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H']].forEach(function (k) {
      g.append(f(k[1], n({ get: function () { return it[k[0]]; }, set: set(function (x, v) { x[k[0]] = k[0] === 'w' || k[0] === 'h' ? Math.max(1, v) : v; }, u('transform')) })));
    });
    g.append(f('∠', n({ unit: '°', get: function () { return it.rot || 0; }, set: set(function (x, v) { x.rot = ((v % 360) + 360) % 360; }, u('rotate')) }), t('press.props.rotation')));
    tr.append(g); body.append(tr);
    var ap = sec(t('press.props.sec_appearance')), row = h('div', { class: 'row' });
    row.append(f(t('press.ctl.fill'), K.chip(it.fill, t('press.ctl.fill'), function (c) { UI.setPaint('fill', c); })), f(t('press.ctl.stroke'), K.chip(it.stroke, t('press.ctl.stroke'), function (c) { UI.setPaint('stroke', c); })),
      f('pt', n({ unit: 'pt', cls: 'w48', get: function () { return it.sw; }, set: set(function (x, v) { x.sw = Math.max(0, v); }, u('stroke_weight')), min: 0, step: 0.5 }), t('press.props.stroke_weight')));
    var g2 = h('div', { class: 'grid2' });
    g2.append(f('◜', n({ get: function () { return it.radius || 0; }, set: set(function (x, v) { x.radius = Math.max(0, v); }, u('corner_radius')), min: 0 }), t('press.ctl.corner_radius')),
      f('%', n({ unit: '%', get: function () { return Math.round((it.opacity == null ? 1 : it.opacity) * 100); }, set: set(function (x, v) { x.opacity = U.clamp(v, 0, 100) / 100; }, u('opacity')) }), t('press.ctl.opacity')));
    var dash = K.select([['', t('press.props.dash_solid')], ['dash', t('press.props.dash_dashed')], ['dot', t('press.props.dash_dotted')]], it.dash ? (it.dash[0] < 1 ? 'dot' : 'dash') : '', set(function (x, v) { x.dash = v === 'dash' ? [4, 2] : v === 'dot' ? [0.01, 2] : null; }, u('stroke_style')));
    ap.append(row, g2, h('div', { class: 'row' }, h('span', { class: 'fl' }, t('press.props.stroke_type')), dash)); body.append(ap);
    if (it.type === 'polygon') {
      var pg = sec(t('press.ctl.kind.polygon')), g3 = h('div', { class: 'grid2' });
      g3.append(f('#', n({ unit: 'raw', get: function () { return it.sides; }, set: set(function (x, v) { x.sides = U.clamp(Math.round(v), 3, 64); }, u('sides')), min: 3 }), t('press.props.sides')),
        f('★', n({ unit: '%', get: function () { return Math.round((it.inset || 0) * 100); }, set: set(function (x, v) { x.inset = U.clamp(v, 0, 95) / 100; }, u('star_inset')) }), t('press.props.star_inset')));
      pg.append(g3); body.append(pg);
    }
    if (it.type === 'text') {
      var tf = sec(t('press.props.sec_text_frame')), g4 = h('div', { class: 'grid2' });
      g4.append(f(t('press.props.col_short'), n({ unit: 'raw', get: function () { return it.cols || 1; }, set: set(function (x, v) { x.cols = U.clamp(Math.round(v), 1, 12); }, u('columns')), min: 1 }), t('press.ctl.columns')),
        f(t('press.props.gutter_short'), n({ get: function () { return it.gutter || 0; }, set: set(function (x, v) { x.gutter = Math.max(0, v); }, u('gutter')), min: 0 }), t('press.props.gutter')),
        f(t('press.props.inset_short'), n({ get: function () { return it.inset || 0; }, set: set(function (x, v) { x.inset = Math.max(0, v); }, u('inset')), min: 0 }), t('press.props.inset')));
      var va = K.seg([['top', t('press.props.va_top'), t('press.props.va_top_tip')], ['center', t('press.props.va_mid'), t('press.props.va_mid_tip')], ['bottom', t('press.props.va_bot'), t('press.props.va_bot_tip')]], it.valign || 'top', function (v) { its.forEach(function (x) { x.valign = v; }); H.commit(u('valign')); });
      var info = PR.engine.story(it.story), st = S.doc.stories[it.story];
      tf.append(g4, h('div', { class: 'row' }, h('span', { class: 'fl' }, t('press.props.align')), va),
        h('p', { class: 'tip' }, t('press.props.chars_n', { n: st ? st.text.length : 0 }) + (info && info.overset ? ' · ' : ''), info && info.overset ? h('b', { style: { color: '#ff6b6b' } }, t('press.props.overset')) : null,
          ' · ' + t('press.props.frames_n', { n: PR.model.storyFrames(S.doc, it.story).length })));
      var bt = h('div', { class: 'row' });
      var b1 = h('button', { type: 'button', class: 'btn small' }, t('press.props.edit_text')); b1.addEventListener('click', function () { PR.textEdit.enter(it, 0); });
      var b2 = h('button', { type: 'button', class: 'btn small' }, t('press.props.autoflow')); b2.addEventListener('click', function () { PR.actions.run('layout.autoflow'); });
      bt.append(b1); if (info && info.overset) bt.append(b2); tf.append(bt); body.append(tf);
    }
    if (it.type === 'image') {
      var im = sec(t('press.props.sec_image')), b = h('button', { type: 'button', class: 'btn small' }, t(it.asset ? 'press.props.replace_image' : 'press.props.place_image'));
      b.addEventListener('click', function () { PR.place.pick(it); });
      var fit = K.select(['fill', 'fit', 'center', 'stretch', 'custom'].map(function (k) { return [k, t('press.props.fit.' + k)]; }), it.fit, set(function (x, v) { x.fit = v; }, u('fitting')));
      var g5 = h('div', { class: 'grid2' });
      g5.append(f('%', n({ unit: '%', get: function () { return Math.round((it.sc || 1) * 100); }, set: set(function (x, v) { x.sc = Math.max(1, v) / 100; x.fit = x.fit === 'fill' || x.fit === 'fit' || x.fit === 'stretch' ? 'custom' : x.fit; }, u('image_scale')) }), t('press.props.scale_tip')),
        f('↔', n({ get: function () { return it.ox || 0; }, set: set(function (x, v) { x.ox = v; x.fit = 'custom'; }, u('image_offset')) }), t('press.props.offset_x')),
        f('↕', n({ get: function () { return it.oy || 0; }, set: set(function (x, v) { x.oy = v; x.fit = 'custom'; }, u('image_offset')) }), t('press.props.offset_y')));
      im.append(h('div', { class: 'row' }, b, fit), g5); body.append(im);
    }
    var wr = sec(t('press.props.sec_text_wrap')), w = it.wrap || { type: 'none', off: 6 };
    wr.append(K.seg(['none', 'box', 'contour', 'jump'].map(function (k) { return [k, t('press.props.wrap.' + k), t('press.ctl.wrap.' + k + '_tip')]; }), w.type, function (v) { its.forEach(function (x) { x.wrap = U.assign({ off: 6 }, x.wrap, { type: v }); }); H.commit(u('text_wrap')); }),
      f(t('press.props.offset'), n({ get: function () { return (it.wrap || {}).off || 0; }, set: set(function (x, v) { x.wrap = U.assign({ type: 'none' }, x.wrap, { off: Math.max(0, v) }); }, u('wrap_offset')) })));
    body.append(wr);
  }
  function paraProps(body) {
    var cur = function () { return FM.current() || { para: {}, char: {} }; }, p = function (k) { return function () { return cur().para[k] || 0; }; };
    var set = function (k) { return function (v) { var o = {}; o[k] = v; FM.para(o); }; };
    var ind = sec(t('press.props.sec_indents')), g = h('div', { class: 'grid2' });
    g.append(f('⇤', n({ get: p('indentLeft'), set: set('indentLeft') }), t('press.props.left_indent')), f('⇥', n({ get: p('indentRight'), set: set('indentRight') }), t('press.props.right_indent')),
      f(t('press.props.first_short'), n({ get: p('indentFirst'), set: set('indentFirst') }), t('press.ctl.first_indent')), f('', h('span')),
      f('↥', n({ unit: 'pt', get: p('spaceBefore'), set: set('spaceBefore') }), t('press.ctl.space_before')), f('↧', n({ unit: 'pt', get: p('spaceAfter'), set: set('spaceAfter') }), t('press.ctl.space_after')));
    ind.append(g); body.append(ind);
    var dc = sec(t('press.props.sec_drop_cap')), g2 = h('div', { class: 'grid2' });
    g2.append(f(t('press.props.lines_short'), n({ unit: 'raw', get: p('dropLines'), set: function (v) { FM.para({ dropLines: U.clamp(Math.round(v), 0, 10) }); } }), t('press.props.drop_lines_tip')),
      f(t('press.props.chars_short'), n({ unit: 'raw', get: function () { return cur().para.dropChars || 1; }, set: function (v) { FM.para({ dropChars: U.clamp(Math.round(v), 1, 10) }); } }), t('press.props.characters')));
    dc.append(g2); body.append(dc);
    var ko = sec(t('press.props.sec_keeps'));
    function chk(label, key) {
      var c = h('input', { type: 'checkbox' }); refs.push(function () { c.checked = !!cur().para[key]; });
      c.addEventListener('change', function () { var o = {}; o[key] = c.checked; FM.para(o); });
      return h('label', { class: 'chk' }, c, label);
    }
    var g3 = h('div', { class: 'grid2' });
    g3.append(f(t('press.props.keep_first_short'), n({ unit: 'raw', get: function () { return cur().para.keepFirst || 1; }, set: function (v) { FM.para({ keepFirst: U.clamp(Math.round(v), 1, 5) }); } }), t('press.props.keep_first_tip')),
      f(t('press.props.keep_last_short'), n({ unit: 'raw', get: function () { return cur().para.keepLast || 1; }, set: function (v) { FM.para({ keepLast: U.clamp(Math.round(v), 1, 5) }); } }), t('press.props.keep_last_tip')));
    ko.append(chk(t('press.props.keep_next'), 'keepNext'), chk(t('press.props.keep_lines'), 'keepLines'), g3, chk(t('press.props.hyphenate'), 'hyphenate'), chk(t('press.props.grid_align'), 'gridAlign'),
      h('div', { class: 'row' }, h('span', { class: 'fl' }, t('press.props.composer')), K.select([['kp', t('press.props.composer_kp')], ['greedy', t('press.props.composer_greedy')]], cur().para.composer || 'kp', function (v) { FM.para({ composer: v }); })));
    body.append(ko);
    var ru = sec(t('press.props.sec_rules'));
    ['ruleAbove', 'ruleBelow'].forEach(function (k) {
      var c = h('input', { type: 'checkbox' }); refs.push(function () { c.checked = !!(cur().para[k] && cur().para[k].weight); });
      c.addEventListener('change', function () { var o = {}; o[k] = c.checked ? { weight: 1, color: cur().char.color || '#000', offset: 6 } : null; FM.para(o); });
      ru.append(h('label', { class: 'chk' }, c, t(k === 'ruleAbove' ? 'press.props.rule_above' : 'press.props.rule_below')));
    });
    var more = h('button', { type: 'button', class: 'btn small' }, t('press.props.edit_para_style'));
    more.addEventListener('click', function () { UI.styleEditor('para', cur().ps); });
    ru.append(more); body.append(ru);
  }
  function docProps(body) {
    var d = S.doc, s = sec(t('press.props.sec_document'));
    s.append(h('p', { class: 'tip' }, t('press.props.doc_line', { name: d.name, n: d.pages.length, w: U.fmt(d.size.w, d.unit, true), h: U.fmt(d.size.h, d.unit, true) })),
      h('div', { class: 'row' }, h('span', { class: 'fl' }, t('press.props.units')), K.select(Object.keys(U.UNIT_NAMES).map(function (k) { return [k, t('press.props.unit.' + k)]; }), d.unit, function (v) { d.unit = v; H.commit(u('units')); UI.refreshPanels(); PR.view.request(); })));
    var b = h('button', { type: 'button', class: 'btn small' }, t('press.ctl.doc_setup')); b.addEventListener('click', function () { PR.actions.run('file.docSetup'); });
    var b2 = h('button', { type: 'button', class: 'btn small' }, t('press.ctl.margins_columns')); b2.addEventListener('click', function () { PR.actions.run('layout.marginsColumns'); });
    s.append(h('div', { class: 'row' }, b, b2), h('p', { class: 'tip' }, t('press.props.doc_tip')));
    body.append(s);
  }
  UI.panel({
    id: 'props', title: 'press.panel.props',
    build: function (body) {
      refs = [];
      if (S.text) paraProps(body);
      else if (S.sel.length) objectProps(body, PR.selected());
      else docProps(body);
      refs.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
    },
    refresh: function () { refs.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } }); }
  });
  function soon() {
    var p = UI.panels.props, ae = document.activeElement;
    var typing = p.body && ae && p.body.contains(ae) && /^(INPUT|SELECT)$/.test(ae.tagName);
    if (typing) { p.refresh && p.refresh(); return; }
    var keep = p.refresh; p.refresh = null; UI.refreshPanels('props'); p.refresh = keep;
  }
  var later = U.debounce(soon, 60);
  ['select', 'textsel', 'commit', 'doc', 'tool'].forEach(function (e) { PR.on(e, later); });
})();
