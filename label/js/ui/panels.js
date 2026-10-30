/* SlopLabel — ui/panels: the dock (Properties, Objects, Variables, Data tabs). */
'use strict';

const DOCK_TABS = [['props', 'label.menu.properties'], ['objects', 'label.panels.objects'], ['vars', 'label.menu.variables'], ['data', 'label.cmd.data']]; // keys (LT at use)
const TYPE_ICON = { text: 'T', para: '¶', barcode: '║', image: '▣', rect: '□', ellipse: '○', line: '／', inverse: '◩' };
function renderPanels(opts = {}) {
  const tabs = $('dockTabs'), body = $('dockBody'), d = App.doc;
  const counts = { objects: d.objects.length, vars: d.vars.length, data: recordCount(d) };
  tabs.replaceChildren(...DOCK_TABS.map(([id, label]) => {
    const b = mk('button', { type: 'button', class: 'tab' + (App.tab === id ? ' on' : ''), role: 'tab', 'aria-selected': String(App.tab === id), 'data-tab': id }, LT(label), counts[id] ? mk('span', { class: 'count' }, counts[id]) : null);
    b.addEventListener('click', () => { App.tab = id; renderPanels(); });
    return b;
  }));
  if (opts.keepProps && App.tab === 'props') { syncGeomFields(); return; }
  const scroll = body.scrollTop, keep = body.dataset.tab === App.tab;
  const focus = focusedField(body);
  body.replaceChildren();
  body.dataset.tab = App.tab;
  if (App.tab === 'props') renderProps(body);
  else if (App.tab === 'objects') renderObjects(body);
  else if (App.tab === 'vars') renderVars(body);
  else renderData(body);
  if (keep) body.scrollTop = scroll;
  restoreField(body, focus);
}
/* A rebuild must not drop focus in the middle of a word: remember the field being typed in (by its
 * position in the panel, since the rebuilt controls are new) and its caret, then put them back. */
const panelFields = (body) => [...body.querySelectorAll('input, textarea, select')];
function focusedField(body) {
  const a = document.activeElement;
  if (!a || !body.contains(a) || !isTyping(a)) return null;
  return { idx: panelFields(body).indexOf(a), start: a.selectionStart, end: a.selectionEnd };
}
function restoreField(body, f) {
  const el = f && f.idx >= 0 ? panelFields(body)[f.idx] : null;
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  try { if (f.start != null) el.setSelectionRange(f.start, f.end); } catch (e) { /* number inputs have no caret */ }
}

/* ---------------- objects ---------------- */
function objSummary(o) {
  if (o.type === 'text' || o.type === 'para' || o.type === 'barcode') return (o.type === 'barcode' ? (SYM[o.symbology] || {}).name + ': ' : '') + String(o.content || '').replace(/\s+/g, ' ').slice(0, 60);
  return fmtLen(o.w, U(), App.doc.dpi, false) + ' × ' + fmtLen(o.h, U(), App.doc.dpi);
}
function renderObjects(body) {
  const d = App.doc;
  if (!d.objects.length) { body.append(mk('p', { class: 'empty' }, LT('label.panels.no_objects_yet_pick_a'))); return; }
  const list = mk('div', { class: 'list', role: 'listbox', 'aria-label': LT('label.panels.objects_front_to_back') });
  for (const o of d.objects.slice().reverse()) {
    const act = (lbl, t, f) => { const b = mk('button', { type: 'button', title: t, 'aria-label': t }, lbl); b.addEventListener('click', (e) => { e.stopPropagation(); f(); }); return b; };
    const row = mk('div', { class: 'li' + (App.sel.includes(o.id) ? ' on' : '') + (o.hidden ? ' hiddenobj' : ''), role: 'option', 'aria-selected': String(App.sel.includes(o.id)), tabindex: '0', 'data-id': o.id },
      mk('span', { class: 'ic' }, TYPE_ICON[o.type] || '?'),
      mk('span', { class: 'nm' }, o.name || LW('type', o.type, TYPE_NAMES[o.type]), o.group ? ' ⛓' : '', mk('span', { class: 'sub' }, objSummary(o))),
      mk('span', { class: 'acts' },
        act(o.hidden ? '◌' : '◉', o.hidden ? LT('label.menu.show') : LT('label.menu.hide'), () => { o.hidden = !o.hidden; commit(o.hidden ? LT('label.menu.hide') : LT('label.menu.show')); }),
        act(o.locked ? '🔒' : '🔓', o.locked ? LT('label.menu.unlock') : LT('label.menu.lock'), () => { o.locked = !o.locked; commit(o.locked ? LT('label.menu.lock') : LT('label.menu.unlock')); })));
    row.addEventListener('click', (e) => select([o.id], e.shiftKey || e.ctrlKey || e.metaKey));
    row.addEventListener('dblclick', () => { select([o.id]); focusContent(); });
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select([o.id]); } });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!App.sel.includes(o.id)) select([o.id]); openContext(o, e.clientX, e.clientY); });
    list.append(row);
  }
  body.append(list, App.sel.length ? arrangeSection(App.sel.length === 1) : mk('p', { class: 'hint' }, LT('label.panels.top_of_the_list_prints')));
}

/* ---------------- variables ---------------- */
function varSummary(v) {
  switch (v.type) {
    case 'prompt': return LT('label.panels.asked_at_print') + (v.required ? ' · required' : '');
    case 'counter': return LT('label.panels.counter', { from: `${v.prefix || ''}${String(v.start).padStart(v.pad || 0, '0')}${v.suffix || ''}`, step: String(v.step) }) + (v.remember ? ' · ' + LT('label.panels.remembers') : '');
    case 'date': return LT('label.panels.date', { format: v.format }) + (+v.days ? ' · ' + LT('label.panels.days', { n: `${+v.days > 0 ? '+' : ''}${v.days}` }) : '') + (+v.months ? ' · ' + LT('label.panels.months', { n: `${+v.months > 0 ? '+' : ''}${v.months}` }) : '');
    case 'formula': return '= ' + v.expr;
    default: return LT('label.panels.fixed');
  }
}
function renderVars(body) {
  const d = App.doc, get = previewGet();
  const add = fBtn('+ ' + LT('label.dlg.add_variable'), (e) => { const r = e.currentTarget.getBoundingClientRect(); SlopUI.menu(Object.entries(VAR_TYPES).map(([t, l]) => ({ label: LW('var', t, l), act: () => varDialog(null, t) })), r.left, r.bottom + 2); }, { cls: 'small' });
  body.append(mk('div', { class: 'sec-h' }, mk('span', null, LT('label.menu.variables')), mk('span', { class: 'grow' }), add));
  if (!d.vars.length) body.append(mk('p', { class: 'empty' }, LT('label.panels.variables_fill_in_text_and')));
  const list = mk('div', { class: 'list' });
  for (const v of d.vars) {
    const row = mk('div', { class: 'li', tabindex: '0' }, mk('span', { class: 'ic' }, { prompt: '?', counter: '#', date: '◷', formula: 'ƒ', fixed: '=' }[v.type]),
      mk('span', { class: 'nm' }, '{' + v.name + '}', mk('span', { class: 'sub' }, varSummary(v) + ' → ' + String(get(v.name) || '').slice(0, 40))),
      mk('span', { class: 'acts' }, (() => { const b = mk('button', { type: 'button', title: LT('label.panels.delete_variable'), 'aria-label': LT('label.panels.delete_variable') }, '✕'); b.addEventListener('click', (e) => { e.stopPropagation(); deleteVar(v); }); return b; })()));
    row.addEventListener('click', () => varDialog(v));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') varDialog(v); });
    list.append(row);
  }
  body.append(list);
  const prompts = d.vars.filter((v) => v.type === 'prompt');
  if (prompts.length) {
    body.append(mk('div', { class: 'sec-h' }, mk('span', null, LT('label.panels.preview_values'))));
    for (const v of prompts) body.append(fRow(v.name, fText(App.prompts[v.name] != null ? App.prompts[v.name] : v.def, (x) => { App.prompts[v.name] = x; refresh({ keepProps: true }); }, { placeholder: v.prompt })));
    body.append(mk('p', { class: 'hint' }, LT('label.panels.these_values_only_change_the')));
  }
  const f = fieldNames();
  body.append(mk('div', { class: 'sec-h' }, mk('span', null, LT('label.panels.other_fields'))), mk('p', { class: 'hint' },
    (f.data.length ? LT('label.panels.data_fields', { list: f.data.map((n) => '{' + n + '}').join(' ') }) + ' ' : '') + LT('label.panels.system_label_no_record_no')));
}
function deleteVar(v) {
  const used = App.doc.objects.some((o) => varRefs(o.content).includes(v.name));
  const go = () => editDoc((d) => { d.vars = d.vars.filter((x) => x.id !== v.id); }, LT('label.panels.delete_variable'));
  if (!used) return go();
  SlopUI.confirm(LT('label.panels.delete_variable_2'), `{${v.name}} is used on the label. Deleting it leaves the placeholder text in place.`, 'Delete', { danger: true }).then((ok) => ok && go());
}

/* ---------------- data ---------------- */
function renderData(body) {
  const d = App.doc, D = d.data;
  const btns = mk('div', { class: 'btnrow' }, fBtn(LT('label.panels.import_csv_excel'), () => importDataDialog()), fBtn(LT('label.cmd.paste_data'), () => pasteDataDialog()), hubAvailable() ? fBtn(LT('label.menu.from_slop_drive'), () => dataFromDrive()) : null);
  const examples = mk('div', { class: 'btnrow' }, fBtn(LT('label.panels.example_csv'), downloadExampleCSV, { title: LT('label.panels.download_a_csv_with_the') }), fBtn(LT('label.panels.example_template'), downloadExampleTemplate, { title: LT('label.panels.download_a_sample_sloplabel_label') }));
  if (!D) {
    body.append(fSec(LT('label.panels.data_source'), btns, examples, mk('p', { class: 'hint' }, LT('label.panels.merge_a_spreadsheet_every_row'))));
    return;
  }
  const n = D.rows.length;
  body.append(fSec(LT('label.panels.data_source'),
    mk('p', { class: 'hint' }, `${D.name} · ${n} record${n === 1 ? '' : 's'} · ${D.columns.length} columns`),
    mk('div', { class: 'btnrow' }, fBtn(LT('label.cmd.map_columns'), () => mapColumnsDialog(D)), fBtn(LT('label.panels.replace'), () => importDataDialog()), fBtn(LT('label.panels.remove'), () => editDoc((x) => { x.data = null; }, LT('label.cmd.remove_data')), { cls: 'danger' })),
    fRow(LT('label.panels.quantity_from'), fSel([['', '(1 label per record)'], ...D.columns.map((c) => [c, c])], D.qtyCol || '', (v) => editDoc((x) => { x.data.qtyCol = v; }, LT('label.panels.quantity_column')))),
    mk('div', { class: 'btnrow' }, fBtn(LT('label.panels.print_all', { n }), () => bulkPrint(false), { cls: 'primary', title: LT('label.panels.one_label_per_record_on') }),
      fBtn(LT('label.panels.print_sel', { n: [...BULK.picked].filter((i) => i < n).length }), () => bulkPrint(true), { title: LT('label.panels.tick_records_in_the_table') })),
    examples));
  const wrap = mk('div', { class: 'tbl-wrap' }), tbl = mk('table', { class: 'tbl' }), max = Math.min(n, 300);
  tbl.append(mk('thead', null, mk('tr', null, mk('th', { title: LT('label.panels.tick_to_print_selected') }, LT('label.panels.print')), mk('th', null, '#'), D.columns.map((c) => mk('th', { title: (D.map && D.map[c] && D.map[c] !== c) ? '→ {' + D.map[c] + '}' : c }, c + (D.map && D.map[c] && D.map[c] !== c ? ' → ' + D.map[c] : ''))))));
  const tb = mk('tbody');
  for (let i = 0; i < max; i++) {
    const tick = mk('input', { type: 'checkbox', checked: BULK.picked.has(i), 'aria-label': LT('label.panels.print_record', { n: i + 1 }) });
    tick.addEventListener('click', (e) => { e.stopPropagation(); if (tick.checked) BULK.picked.add(i); else BULK.picked.delete(i); });
    const tr = mk('tr', { class: i === App.rec ? 'on' : '' }, mk('td', null, tick), mk('td', null, i + 1), D.rows[i].map((v) => mk('td', { title: v }, v)));
    tr.addEventListener('click', () => setRecord(i));
    tb.append(tr);
  }
  tbl.append(tb); wrap.append(tbl);
  // Element.append writes a null argument as the text "null", so the optional note is left out instead.
  body.append(wrap, ...(n > max ? [mk('p', { class: 'hint' }, LT('label.panels.showing', { max, n }))] : []), mk('p', { class: 'hint' }, LT('label.panels.click_a_row_to_preview')));
}
