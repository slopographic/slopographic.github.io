/* SlopLabel — ui/dialogs: label setup (stock picker, size, printer), variable editor, template gallery, about. */
'use strict';

function dRow(label, ...c) { return mk('label', { class: 'row' }, mk('span', null, label), c.length > 1 ? mk('div', { class: 'pair' }, c) : c[0]); }
function dInp(value, type = 'text', attrs = {}) { const i = mk('input', Object.assign({ class: 'inp', type, spellcheck: 'false' }, attrs)); i.value = value == null ? '' : String(value); return i; }
function dSel(options, value) { const s = mk('select', { class: 'inp' }, options.map(([v, l]) => mk('option', { value: v }, l))); s.value = String(value); return s; }
function dChk(label, checked) { const c = mk('input', { type: 'checkbox', checked: !!checked }); return { el: mk('label', { class: 'chk' }, c, label), input: c }; }

/* ---------------- label setup ---------------- */
function labelSetupDialog(target) {
  const d = target || App.doc, P = d.printer;
  let stock = d.stock && stockById(d.stock.id) ? stockById(d.stock.id) : null;
  const u = d.unit, cv = (mm) => num(fromMM(mm, u, d.dpi), unitDigits(u) + 1), back = (v) => toMM(+v, u, d.dpi);
  const name = dInp(d.name), W = dInp(cv(d.label.w), 'number', { step: 'any', min: 1 }), H = dInp(cv(d.label.h), 'number', { step: 'any', min: 1 });
  const gap = dInp(num(d.label.gap, 2), 'number', { step: 'any', min: 0 }), rad = dInp(num(d.label.radius || 0, 2), 'number', { step: 'any', min: 0 });
  const unit = dSel([['mm', LT('label.dlg.millimetres')], ['in', LT('label.dlg.inches')], ['dots', LT('label.dlg.printer_dots')]], u), dpi = dSel([[152, '152 dpi'], [203, '203 dpi'], [300, '300 dpi'], [600, '600 dpi']], d.dpi);
  const S0 = Object.assign({}, DEFAULT_STYLE, d.style); // the defaults a new text or shape gets (core/configs.js styleProps)
  const sFont = dSel([['sans', LT('label.dlg.sans')], ['serif', LT('label.dlg.serif')], ['mono', LT('label.dlg.mono')]], S0.font), sInk = dSel([['black', LT('label.dlg.black_text')], ['white', LT('label.dlg.white_text_reversed')]], S0.colour);
  const sFill = dSel([['none', LT('label.dlg.no_fill')], ['black', LT('label.dlg.black')], ['white', LT('label.dlg.white')]], S0.fill), sStroke = dInp(num(S0.stroke, 2), 'number', { step: 'any', min: 0, max: 20 });
  const dark = dInp(P.darkness, 'number', { min: 0, max: 30, step: 1 }), speed = dInp(P.speed, 'number', { min: 1, max: 14, step: 1 });
  const media = dSel([['gap', LT('label.dlg.gap_notch')], ['mark', LT('label.dlg.black_mark')], ['continuous', LT('label.dlg.continuous')]], P.media), method = dSel([['direct', LT('label.dlg.direct_thermal')], ['transfer', LT('label.dlg.thermal_transfer_ribbon')]], P.method);
  const rot = dChk(LT('label.dlg.print_upside_down_rotate_180'), P.rotate180);
  const info = mk('p', { class: 'hint' });
  const list = mk('div', { class: 'stock-list', role: 'listbox', 'aria-label': LT('label.dlg.label_stock') });
  const showInfo = () => { info.textContent = stock ? (stock.kind === 'sheet' ? LT('label.dlg.sheet_info', { grid: stock.cols + ' × ' + stock.rows, size: num(stock.pageW, 1) + ' × ' + num(stock.pageH, 1) }) : LT('label.dlg.thermal_roll_one_label_per')) : LT('label.dlg.custom_size_on_a_roll'); W.disabled = H.disabled = !!(stock && stock.kind === 'sheet'); };
  const pick = (s, btn) => {
    stock = s; list.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    if (s) { const uu = unit.value; W.value = num(fromMM(s.w, uu, +dpi.value), 4); H.value = num(fromMM(s.h, uu, +dpi.value), 4); rad.value = num(s.radius || 0, 2); if (s.gap != null) gap.value = s.gap; }
    showInfo();
  };
  const custom = mk('button', { type: 'button', class: stock ? '' : 'on' }, LT('label.dlg.custom_size_roll'));
  custom.addEventListener('click', () => pick(null, custom));
  list.append(custom);
  let grp = '';
  for (const s of STOCKS) {
    if (s.group !== grp) { grp = s.group; list.append(mk('div', { class: 'grp' }, LW('sgroup', grp, grp))); }
    const b = mk('button', { type: 'button', class: stock && stock.id === s.id ? 'on' : '' }, s.name);
    b.addEventListener('click', () => pick(s, b));
    list.append(b);
  }
  unit.addEventListener('change', () => { const mmW = toMM(+W.value, unitPrev, +dpi.value), mmH = toMM(+H.value, unitPrev, +dpi.value); unitPrev = unit.value; W.value = num(fromMM(mmW, unitPrev, +dpi.value), 4); H.value = num(fromMM(mmH, unitPrev, +dpi.value), 4); });
  let unitPrev = u;
  showInfo();
  requestAnimationFrame(() => { const on = list.querySelector('button.on'); if (on) on.scrollIntoView({ block: 'center' }); });
  const body = mk('div', { class: 'dlg-cols' },
    mk('div', null, mk('div', { class: 'sec-h' }, LT('label.dlg.stock')), list, info),
    mk('div', { class: 'dlg-form' }, mk('div', { class: 'sec-h' }, LT('label.dlg.label')), dRow(LT('label.dlg.name'), name), dRow(LT('label.dlg.units'), unit), dRow(LT('label.dlg.width'), W), dRow(LT('label.dlg.height'), H), dRow(LT('label.dlg.gap_mm'), gap), dRow(LT('label.dlg.corners_mm'), rad),
      mk('div', { class: 'sec-h' }, LT('label.dlg.printer')), dRow(LT('label.dlg.resolution'), dpi), dRow(LT('label.dlg.darkness_0_30'), dark), dRow(LT('label.dlg.speed_ips'), speed), dRow(LT('label.dlg.media'), media), dRow(LT('label.dlg.method'), method), rot.el,
      mk('div', { class: 'sec-h' }, LT('label.dlg.new_objects')), dRow(LT('label.dlg.text_font'), sFont), dRow(LT('label.dlg.text_ink'), sInk), dRow(LT('label.dlg.shape_fill'), sFill), dRow(LT('label.dlg.line_width_mm'), sStroke)));
  SlopFormReset.snapshot(body);
  return new Promise((res) => SlopUI.dialog({ title: LT('label.dlg.label_setup'), cls: 'sl-wide', body, onClose: (ok) => res(ok),
    buttons: [{ label: LT('label.dlg.cancel') }, SlopFormReset.dialogButton(body), { label: LT('label.dlg.apply'), primary: true, act: () => {
      const w = toMM(+W.value, unit.value, +dpi.value), h = toMM(+H.value, unit.value, +dpi.value);
      if (!(w >= 1 && h >= 1 && w <= 2000 && h <= 2000)) { SlopUI.toast(LT('label.dlg.enter_a_label_size_between')); return false; }
      const apply = (x) => {
        if (stock) applyStock(x, stock); else { x.stock = { kind: 'roll', id: 'custom', name: 'Custom roll', cols: 1 }; x.label.w = round(w, 4); x.label.h = round(h, 4); x.label.orientation = h >= w ? 'portrait' : 'landscape'; }
        x.name = name.value.trim() || x.name; x.unit = unit.value; x.dpi = +dpi.value;
        x.label.gap = Math.max(0, +gap.value || 0); x.label.radius = Math.max(0, +rad.value || 0);
        Object.assign(x.printer, { darkness: clamp(+dark.value | 0, 0, 30), speed: clamp(+speed.value | 0, 1, 14), media: media.value, method: method.value, rotate180: rot.input.checked });
        x.style = { font: sFont.value, colour: sInk.value, fill: sFill.value, stroke: clamp(+sStroke.value || 0, 0, 20) };
      };
      if (target) apply(target); else { editDoc(apply, LT('label.dlg.label_setup')); document.title = App.doc.name + ' — SlopLabel'; syncTabName(); fitView(); }
    } }] }));
}

/* ---------------- variable editor ---------------- */
function varDialog(v, type) {
  const isNew = !v;
  const draft = isNew ? makeVar(type, uniqueVarName(type === 'counter' ? 'Serial' : type === 'date' ? 'Date' : type === 'prompt' ? 'Input' : 'Field')) : deepClone(v);
  const name = dInp(draft.name), prev = mk('div', { class: 'msg warn', style: 'color:var(--text)' });
  const F = {}, rows = [];
  const inp = (k, label, t = 'text', attrs) => { F[k] = dInp(draft[k], t, attrs); rows.push(dRow(label, F[k])); };
  const chk = (k, label) => { const c = dChk(label, draft[k]); F[k] = c.input; rows.push(c.el); };
  switch (draft.type) {
    case 'prompt': inp('prompt', LT('label.dlg.question')); inp('def', LT('label.dlg.default')); chk('required', LT('label.dlg.required')); inp('pattern', LT('label.dlg.pattern_regex'), 'text', { placeholder: 'e.g. \\d{5}' }); inp('maxLen', LT('label.dlg.max_length'), 'number', { min: 0 }); break;
    case 'counter': inp('start', LT('label.dlg.start'), 'number'); inp('step', LT('label.dlg.step'), 'number'); inp('pad', LT('label.dlg.digits_zero_pad'), 'number', { min: 0, max: 30 }); inp('prefix', LT('label.dlg.prefix')); inp('suffix', LT('label.dlg.suffix')); inp('every', LT('label.dlg.change_every_n_labels'), 'number', { min: 1 }); chk('remember', LT('label.dlg.continue_from_the_last_printed')); break;
    case 'date': inp('format', LT('label.dlg.format')); rows.push(mk('p', { class: 'hint' }, LT('label.dlg.yyyy_yy_mmmm_mmm_mm'))); inp('days', LT('label.dlg.offset_days'), 'number'); inp('months', LT('label.dlg.offset_months'), 'number'); inp('years', LT('label.dlg.offset_years'), 'number'); inp('hours', LT('label.dlg.offset_hours'), 'number'); inp('fixed', LT('label.dlg.fixed_date'), 'text', { placeholder: 'YYYY-MM-DD (empty = today)' }); break;
    case 'formula': inp('expr', LT('label.dlg.expression')); rows.push(mk('p', { class: 'hint' }, LT('label.dlg.combine_fields_sku_batch_name'))); break;
    default: inp('value', LT('label.dlg.value'));
  }
  const read = () => { const x = deepClone(draft); x.name = name.value.trim(); for (const k in F) x[k] = F[k].type === 'checkbox' ? F[k].checked : F[k].type === 'number' ? +F[k].value || 0 : F[k].value; return x; };
  const upd = () => {
    const x = read(), doc = Object.assign({}, App.doc, { vars: App.doc.vars.filter((y) => y.id !== x.id).concat(x) });
    let val; try { val = makeResolver(doc, { record: recordAt(doc, App.rec), prompts: App.prompts })(x.name); } catch (e) { val = '#ERROR'; }
    prev.textContent = LT('label.dlg.preview', { v: val === undefined ? '' : String(val) });
  };
  const body = mk('div', { class: 'dlg-form' }, dRow(LT('label.dlg.name'), name), mk('p', { class: 'hint' }, LT('label.dlg.var_hint', { type: LW('var', draft.type, VAR_TYPES[draft.type]), use: '{' + draft.name + '}' })), ...rows, prev);
  body.addEventListener('input', upd); body.addEventListener('change', upd); upd();
  SlopFormReset.snapshot(body);
  return new Promise((res) => SlopUI.dialog({ title: LT(isNew ? 'label.dlg.var_new' : 'label.dlg.var_edit', { type: LW('var', draft.type, VAR_TYPES[draft.type]).toLowerCase() }), body, onClose: (ok) => { if (!ok) res(null); },
    buttons: [{ label: LT('label.dlg.cancel') }, SlopFormReset.dialogButton(body), { label: isNew ? LT('label.dlg.add') : LT('label.menu.save'), primary: true, act: () => {
      const x = read();
      if (!VAR_NAME_RE.test(x.name)) { SlopUI.toast(LT('label.dlg.names_start_with_a_letter')); return false; }
      if (App.doc.vars.some((y) => y.name === x.name && y.id !== x.id) || ['LABEL_NO', 'RECORD_NO', 'TODAY', 'NOW'].includes(x.name)) { SlopUI.toast(LT('label.dlg.that_name_is_already_used')); return false; }
      editDoc((d) => {
        if (isNew) d.vars.push(x);
        else {
          d.vars = d.vars.map((y) => (y.id === x.id ? x : y));
          if (v.name !== x.name) renameRefs(d, v.name, x.name);
        }
      }, isNew ? LT('label.dlg.add_variable') : LT('label.dlg.edit_variable'));
      if (App.tab !== 'props') App.tab = 'vars';
      res(x);
    } }] }));
}
function uniqueVarName(base) { let n = base, i = 2; while (App.doc.vars.some((v) => v.name === n)) n = base + i++; return n; }
/** Rename {Old…} references in object contents and formulas. */
function renameRefs(d, from, to) {
  const re = new RegExp('\\{(\\s*)' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s*)([|}])', 'g');
  const fix = (s) => String(s).replace(re, (m, a, b, c) => '{' + a + to + b + c);
  for (const o of d.objects) if (o.content != null) o.content = fix(o.content);
  for (const v of d.vars) if (v.type === 'formula') v.expr = fix(v.expr);
}

/* ---------------- templates / new ---------------- */
function templateThumb(doc) {
  try { const sc = buildScene(doc, previewResolver(doc)); return renderLabelCanvas(doc, sc, (240 * 25.4) / Math.max(doc.label.w, doc.label.h)); } catch (e) { return mk('span', null, '…'); }
}
function templatesDialog() {
  const grid = mk('div', { class: 'tpl-grid' });
  let dlg;
  const tile = (title, desc, thumb, act) => { const b = mk('button', { type: 'button', class: 'tpl' }, mk('span', { class: 'tp' }, thumb), mk('b', null, title), mk('small', null, desc)); b.addEventListener('click', () => { dlg.close(true); act(); }); return b; };
  grid.append(tile(LT('label.dlg.blank_label'), LT('label.dlg.choose_a_roll_or_sheet'), mk('span', { class: 'mono', style: 'font-size:28px;color:#999' }, '+'), async () => {
    const d = newDoc({ stock: stockById('roll-4x2') }); d.unit = 'mm';
    if (await labelSetupDialog(d)) openDocTab(d, { label: LT('label.dlg.new_label') });
  }));
  for (const t of TEMPLATES) { const d = t.build(); grid.append(tile(LW('tpl', t.id, t.name), LW('tpl_desc', t.id, t.desc), templateThumb(d), () => { openDocTab(t.build(), { label: LT('label.dlg.new_from_template'), dirty: true }); status(LT('label.dlg.started', { name: LW('tpl', t.id, t.name) }), '', 3000); })); }
  dlg = SlopUI.dialog({ title: LT('label.dlg.new_label'), cls: 'sl-wide', body: mk('div', null, mk('p', { class: 'sui-p' }, LT('label.dlg.start_blank_or_from_a')), grid), buttons: [{ label: LT('label.dlg.cancel') }] });
  return dlg;
}
function aboutDialog() {
  SlopUI.dialog({ title: LT('label.cmd.about_sloplabel'), body: mk('div', null,
    mk('p', { class: 'sui-p' }, LT('label.dlg.sloplabel_designs_and_prints_barcode')),
    mk('p', { class: 'sui-p' }, LT('label.dlg.barcodes_code_128_gs1_128')),
    mk('p', { class: 'sui-p' }, LT('label.dlg.output_browser_printing_at_exact')),
    mk('p', { class: 'sui-p' }, LT('label.dlg.shortcuts_v_select_t_text'))),
    buttons: [{ label: 'OK', primary: true }] });
}
