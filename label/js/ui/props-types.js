/* SlopLabel — ui/props-types: type-specific property sections (text, barcode, image, shapes). */
'use strict';

const FONT_OPTS = () => Object.entries(FONTS).map(([k, f]) => [k, LW('font', k, f.name)]);   // read when a panel is drawn (the chosen language)
/** Makes a family known to the label renderers: CSS from the shared picker, PDF falls back to the Sans base-14 faces. */
function ensureFont(name) {
  if (!name || FONTS[name]) return;
  FONTS[name] = { name, css: SlopFonts.stack(name), pdf: FONTS.sans.pdf, asc: FONTS.sans.asc, desc: FONTS.sans.desc };
  SlopFonts.bundledIndex().then(() => { FONTS[name].css = SlopFonts.stack(name); });
}
/** Family select: the four standard faces, bundled and downloaded families, and Get more. */
function familySelect(o, key, label, flag) {
  if (!window.SlopFonts) return fSel(FONT_OPTS(), o[key], (v) => setProp(key, v, label, flag)); // offline build: plain list
  const s = mk('select', { class: 'inp' });
  ensureFont(o[key]);
  const pick = SlopFonts.attach(s, { value: o[key], legacy: FONT_OPTS(), onPick: (f) => { ensureFont(f); setProp(key, f, label, flag); } });
  return mk('span', { class: 'font-pick' }, s, pick.button, pick.fontsButton);
}
function symOptions() {
  const g1 = SYMBOLOGIES.filter((s) => s.kind === '1d'), g2 = SYMBOLOGIES.filter((s) => s.kind === '2d');
  return [{ group: LT('label.ptypes.linear_1d'), items: g1.map((s) => [s.id, s.name]) }, { group: '2D', items: g2.map((s) => [s.id, s.name]) }];
}
function typeSections(o, it) {
  switch (o.type) {
    case 'text': case 'para': return textSections(o);
    case 'barcode': return barcodeSections(o, it);
    case 'image': return imageSections(o);
    case 'rect': case 'ellipse': return shapeSections(o);
    case 'line': return lineSections(o);
    case 'inverse': return [mk('p', { class: 'hint' }, LT('label.ptypes.everything_under_an_inverse_box'))];
  }
  return [];
}
function textSections(o) {
  const out = [contentField(o, { multi: true, placeholder: LT('label.ptypes.type_text_or_insert_fields') })];
  if (o.type === 'para') out.push(mk('p', { class: 'hint' }, LT('label.ptypes.use_bold_and_italic_inside')));
  out.push(fSec(LT('label.ptypes.font'),
    fRow(LT('label.ptypes.family'), familySelect(o, 'font', LT('label.ptypes.font'), true)),
    fRow(LT('label.ptypes.size_pt'), fNum(o.size, (v) => setProp('size', v, LT('label.ptypes.font_size')), { min: 1, max: 999, step: 0.5 })),
    mk('div', { class: 'btnrow' }, fChk(LT('label.ptypes.bold'), o.bold, (v) => setProp('bold', v, LT('label.ptypes.bold'))), fChk(LT('label.ptypes.italic'), o.italic, (v) => setProp('italic', v, LT('label.ptypes.italic'))), fChk(LT('label.ptypes.white_on_black'), o.color === 'white', (v) => setProp('color', v ? 'white' : 'black', LT('label.ptypes.text_colour')))),
    fRow(LT('label.menu.align'), fSeg([['left', LT('label.keys.left')], ['center', LT('label.ptypes.centre')], ['right', LT('label.keys.right')]], o.align, (v) => setProp('align', v, LT('label.ptypes.align_text')))),
    fRow(LT('label.ptypes.line_spacing'), fNum(o.lineSpacing, (v) => setProp('lineSpacing', v, LT('label.ptypes.line_spacing')), { min: 0.5, max: 4, step: 0.05 }))));
  const fit = [fRow(LT('label.ptypes.sizing'), fSeg([['grow', LT('label.ptypes.auto_size')], ['box', LT('label.ptypes.fixed_box')]], o.fit, (v) => editSel((x) => { if (v === 'box' && x.fit === 'grow') { const b = boxOf(x); x.w = Math.max(5, b.w); x.h = Math.max(3, b.h); } x.fit = v; }, LT('label.ptypes.text_sizing')), { title: LT('label.ptypes.auto_size_grows_with_the') }))];
  if (o.fit !== 'grow') fit.push(
    fRow(LT('label.ptypes.vertical'), fSeg([['top', LT('label.keys.top')], ['middle', LT('label.ptypes.middle')], ['bottom', LT('label.keys.bottom')]], o.valign || 'top', (v) => setProp('valign', v, LT('label.ptypes.vertical_align')))),
    mk('div', { class: 'btnrow' }, fChk(LT('label.ptypes.wrap_lines'), o.wrap, (v) => setProp('wrap', v, LT('label.ptypes.wrap'))), fChk(LT('label.ptypes.shrink_to_fit'), o.shrink, (v) => setProp('shrink', v, LT('label.ptypes.shrink_to_fit'), true))),
    o.shrink ? fRow(LT('label.ptypes.min_size_pt'), fNum(o.minSize, (v) => setProp('minSize', v, LT('label.ptypes.minimum_size')), { min: 1, step: 0.5 })) : null);
  else fit.push(fRow(LT('label.ptypes.anchor'), fSeg([['left', '◧'], ['center', '▣'], ['right', '◨']], o.align, (v) => setProp('align', v, LT('label.ptypes.anchor')), { title: LT('label.ptypes.the_side_that_stays_put') })));
  out.push(fSec(LT('label.ptypes.fit'), ...fit));
  return out;
}
/** Switching the symbology keeps the module sensible: 2D codes get a bigger module and no text. */
function applySymbology(x, v) {
  const was2d = (SYM[x.symbology] || {}).kind === '2d'; x.symbology = v;
  if (SYM[v].kind === '2d' && !was2d) { x.hr = 'none'; x.module = Math.max(x.module, 0.4); }
  if (SYM[v].kind === '1d' && was2d) { x.hr = 'below'; x.module = 0.33; }
}
function barcodeSections(o, it) {
  const S = SYM[o.symbology] || {}, is2d = S.kind === '2d', lin = !is2d;
  const hint = S.hint ? LW('hint', S.id, S.hint) : '';
  const out = [contentField(o, { placeholder: hint }), mk('p', { class: 'hint' }, hint)];
  if (it && it.value != null && it.value !== o.content && !it.error) out.push(mk('p', { class: 'hint' }, LT('label.ptypes.encodes') + ' ', mk('span', { class: 'mono' }, it.value)));
  const sym = fSec(LT('label.ptypes.symbology'), fRow(LT('label.ptypes.type'), fSel(symOptions(), o.symbology, (v) => editSel((x) => applySymbology(x, v), LT('label.ptypes.barcode_type')))));
  out.push(sym, barcodeGenSection());
  const dims = [fRow(LT('label.ptypes.module_mm'), fNum(o.module, (v) => setProp('module', v, LT('label.ptypes.module_width')), { min: 0.05, max: 5, step: 0.01, title: LT('label.ptypes.width_of_the_narrowest_bar') }))];
  const g = it && it.geom;
  if (g && g.ok) dims.push(mk('p', { class: 'hint' }, `${num(g.module, 3)} mm = ${Math.max(1, mmToDots(g.module, App.doc.dpi))} dots at ${App.doc.dpi} dpi${lin ? ` · ${g.modules} modules` : ` · ${g.modules} × ${g.rows} cells`}`));
  if (lin) dims.push(fRow(LT('label.ptypes.height_u', { unit: unitLabel() }), fNum(toU(o.barHeight), (v) => setProp('barHeight', fromU(v), LT('label.ptypes.bar_height')), { min: 0 })));
  if (['code39', 'i2of5', 'itf14', 'codabar'].includes(o.symbology)) dims.push(fRow('Wide : narrow', fNum(o.ratio, (v) => setProp('ratio', v, LT('label.ptypes.ratio')), { min: 2, max: 3, step: 0.1 })));
  dims.push(mk('div', { class: 'btnrow' }, fChk(LT('label.ptypes.quiet_zone'), o.quiet, (v) => setProp('quiet', v, LT('label.ptypes.quiet_zone'))), fChk(LT('label.ptypes.snap_to_printer_dots'), o.snapDots, (v) => setProp('snapDots', v, LT('label.ptypes.snap_to_dots')), LT('label.ptypes.round_bar_widths_to_whole'))));
  out.push(fSec(LT('label.ptypes.size'), ...dims));
  const opts = [];
  if (lin) {
    opts.push(fRow(LT('label.menu.text'), fSeg([['below', LT('label.ptypes.below')], ['above', LT('label.ptypes.above')], ['none', LT('label.ptypes.none')]], o.hr, (v) => setProp('hr', v, LT('label.ptypes.human_readable'), true))));
    if (o.hr !== 'none') opts.push(fRow(LT('label.ptypes.text_size_pt'), fNum(o.hrSize, (v) => setProp('hrSize', v, LT('label.ptypes.text_size')), { min: 3, max: 72, step: 0.5 })), fRow(LT('label.dlg.text_font'), familySelect(Object.assign({}, o, { hrFont: o.hrFont || 'mono' }), 'hrFont', LT('label.dlg.text_font'), false)));
  }
  const chk = { ean13: 1, ean8: 1, upca: 1, upce: 1, itf14: 1, 'gs1-128': 1, gs1qrcode: 1, gs1datamatrix: 1 }[o.symbology];
  if (chk) opts.push(fRow(LT('label.ptypes.check_digit'), fSeg([['auto', LT('label.ptypes.add_verify')], ['none', LT('label.ptypes.verify_only')]], o.check === 'none' ? 'none' : 'auto', (v) => setProp('check', v, LT('label.ptypes.check_digit')))));
  if (o.symbology === 'code39') opts.push(fRow(LT('label.ptypes.check_digit'), fSeg([['auto', LT('label.ptypes.none')], ['mod43', LT('label.ptypes.mod_43')]], o.check === 'mod43' ? 'mod43' : 'auto', (v) => setProp('check', v, LT('label.ptypes.check_digit')))));
  if (o.symbology === 'i2of5') opts.push(fRow(LT('label.ptypes.check_digit'), fSeg([['auto', LT('label.ptypes.none')], ['mod10', LT('label.ptypes.mod_10')]], o.check === 'mod10' ? 'mod10' : 'auto', (v) => setProp('check', v, LT('label.ptypes.check_digit')))));
  if (o.symbology === 'itf14') opts.push(fChk(LT('label.ptypes.bearer_bars'), o.bearer !== false, (v) => setProp('bearer', v, LT('label.ptypes.bearer_bars'))));
  if (['qrcode', 'gs1qrcode', 'aztec'].includes(o.symbology)) opts.push(fRow(LT('label.ptypes.error_correction'), fSeg([['L', 'L 7%'], ['M', 'M 15%'], ['Q', 'Q 25%'], ['H', 'H 30%']], o.ec || 'M', (v) => setProp('ec', v, LT('label.ptypes.error_correction')))));
  if (o.symbology === 'datamatrix') opts.push(fRow(LT('label.ptypes.shape'), fSeg([['square', LT('label.ptypes.square')], ['rect', LT('label.ptypes.rectangle')]], o.dmShape || 'square', (v) => setProp('dmShape', v, LT('label.ptypes.shape')))));
  if (o.symbology === 'pdf417') opts.push(fRow(LT('label.ptypes.columns'), fNum(o.columns || 0, (v) => setProp('columns', v | 0, LT('label.ptypes.columns')), { min: 0, max: 30, step: 1, title: '0 = automatic' })), fRow(LT('label.ptypes.security'), fNum(o.security, (v) => setProp('security', v | 0, LT('label.ptypes.security_level')), { min: 0, max: 8, step: 1 })));
  opts.push(fRow(LT('label.ptypes.anchor'), fSeg([['left', LT('label.keys.left')], ['center', LT('label.ptypes.centre')], ['right', LT('label.keys.right')]], o.align || 'left', (v) => setProp('align', v, LT('label.ptypes.anchor')), { title: LT('label.ptypes.the_side_that_stays_put_2') })));
  out.push(fSec(LT('label.ptypes.options'), ...opts));
  return out;
}
/** Resets the selected image to its natural aspect ratio. */
function originalRatio() { editSel((x) => { if (x.aspect) x.h = round(x.w / x.aspect, 3); }, LT('label.ptypes.original_ratio')); }
function imageSections(o) {
  return [fSec(LT('label.ptypes.image'),
    mk('div', { class: 'btnrow' }, fBtn(LT('label.ptypes.replace_image'), replaceImage), fBtn(LT('label.ptypes.original_ratio'), originalRatio)),
    mk('div', { class: 'btnrow' }, fChk(LT('label.ptypes.keep_proportions'), o.keepAspect !== false, (v) => setProp('keepAspect', v, LT('label.ptypes.keep_proportions')))),
    fRow(LT('label.ptypes.threshold'), fNum(o.threshold, (v) => setProp('threshold', v | 0, LT('label.ptypes.threshold')), { min: 1, max: 254, step: 1, title: LT('label.ptypes.grey_level_that_becomes_black') })),
    mk('div', { class: 'btnrow' }, fChk(LT('label.ptypes.dither_for_thermal'), o.dither !== false, (v) => setProp('dither', v, LT('label.ptypes.dither')))),
    mk('p', { class: 'hint' }, LT('label.ptypes.pdf_and_browser_printing_keep')))];
}
function shapeSections(o) {
  const out = [fRow(LT('label.ptypes.fill'), fSeg([['none', LT('label.ptypes.none')], ['black', LT('label.dlg.black')], ['white', LT('label.dlg.white')]], o.fill || 'none', (v) => setProp('fill', v, LT('label.ptypes.fill'), true)))];
  if (o.fill !== 'black') out.push(fRow(LT('label.ptypes.border_mm'), fNum(o.stroke, (v) => setProp('stroke', v, LT('label.ptypes.border')), { min: 0, max: 50, step: 0.1 })));
  if (o.type === 'rect') out.push(fRow(LT('label.ptypes.corner_mm'), fNum(o.radius || 0, (v) => setProp('radius', v, LT('label.props.corner_radius')), { min: 0, step: 0.5 })));
  return [fSec(o.type === 'rect' ? LT('label.menu.box') : LT('label.menu.ellipse'), ...out)];
}
function lineSections(o) {
  return [fSec(LT('label.menu.line'),
    fRow(LT('label.ptypes.thickness_mm'), fNum(o.stroke, (v) => editSel((x) => {
      x.stroke = v;
      if (x.dir === 'h') { const c = x.y + x.h / 2; x.h = v; x.y = round(c - v / 2, 3); } else if (x.dir === 'v') { const c = x.x + x.w / 2; x.w = v; x.x = round(c - v / 2, 3); }
    }, LT('label.ptypes.line_thickness'), 'prop:stroke', { keepProps: true }), { min: 0.05, max: 20, step: 0.05 })),
    fRow(LT('label.ptypes.direction'), fSeg([['h', '—'], ['v', '|'], ['d1', '╲'], ['d2', '╱']], o.dir || 'h', (v) => editSel((x) => {
      const s = +x.stroke || 0.5;
      if (v === 'h') { const c = x.y + x.h / 2; x.h = s; x.y = round(c - s / 2, 3); if (x.w < 2) x.w = 20; }
      else if (v === 'v') { const c = x.x + x.w / 2; x.w = s; x.x = round(c - s / 2, 3); if (x.h < 2) x.h = 20; }
      else { if (x.w < 2) x.w = 20; if (x.h < 2) x.h = 20; }
      x.dir = v;
    }, LT('label.ptypes.line_direction')))))];
}
