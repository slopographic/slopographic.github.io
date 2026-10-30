/* SlopLabel — ui/barcode-gen: random values for barcodes. "Generate" fills the selected barcode with one
 * random value; "Generate many" makes a data source with N values (column Barcode, one label per row) and
 * points the selected barcode at {Barcode}. Values come from shared/data/barcode.js (crypto.getRandomValues,
 * GS1 check digits on EAN and UPC). */
'use strict';

const GEN_SYMS = [['code128', 'Code 128'], ['ean13', 'EAN-13'], ['ean8', 'EAN-8'], ['upca', 'UPC-A'], ['code39', 'Code 39'], ['qrcode', 'QR Code'], ['datamatrix', 'Data Matrix']]; // i18n-ignore: format names
const GEN_KINDS = [['digits', 'label.bgen.digits'], ['letters', 'label.bgen.letters'], ['alnum', 'label.bgen.letters_and_digits']]; // keys, read when the dialog opens
const GEN_FIXED = { ean13: 13, ean8: 8, upca: 12 }; // total length, check digit included
const GEN_LEN = { code128: 12, code39: 10, qrcode: 16, datamatrix: 16 };
const GEN = { symbology: 'code128', kind: 'alnum', length: 12, prefix: '', count: 10 };

/** Random value(s) for the current generator settings. n = 0 gives one value. */
function genValues(n = 0) {
  const opts = { symbology: GEN.symbology, kind: GEN.kind, length: GEN.length, prefix: GEN.prefix };
  return n ? SlopData.barcode.randomValues(n, opts) : [SlopData.barcode.randomValue(opts)];
}

/** The generator block of the barcode Properties section. */
function barcodeGenSection() {
  const fixed = GEN_FIXED[GEN.symbology] !== undefined;
  const kind = fSel(GEN_KINDS.map(([v, k]) => [v, LT(k)]), GEN.kind, (v) => { GEN.kind = v; }, { id: 'genKind' });
  kind.disabled = fixed;
  const len = fNum(GEN.length, (v) => { GEN.length = Math.floor(v); }, { min: 1, step: 1, id: 'genLen', title: fixed ? LT('label.bgen.fixed_by_the_symbology') : LT('label.bgen.characters_or_modules_in_the') });
  len.value = fixed ? String(GEN_FIXED[GEN.symbology]) : String(GEN.length);
  len.disabled = fixed;
  const sym = fSel(GEN_SYMS, GEN.symbology, (v) => {
    GEN.symbology = v;
    GEN.length = GEN_LEN[v] || GEN.length;
    GEN.kind = 'alnum';
    rebuildPanel();
  }, { id: 'genSym' });
  const prefix = fText(GEN.prefix, (v) => { GEN.prefix = v; }, { id: 'genPrefix', placeholder: fixed ? LT('label.bgen.digits_e_g_9_for') : 'optional' });
  const count = fNum(GEN.count, (v) => { GEN.count = Math.floor(v); }, { min: 1, max: 10000, step: 1, id: 'genCount', title: LT('label.bgen.how_many_labels_generate_many') });
  const hint = fixed ? LT('label.bgen.ean_and_upc_values_are') : LT('label.bgen.each_generate_picks_a_new');
  return fSec(LT('label.bgen.generate_random_value'),
    fRow(LT('label.ptypes.symbology'), sym),
    fRow(LT('label.dlg.value'), kind),
    fRow(LT('label.bgen.length'), len),
    fRow(LT('label.dlg.prefix'), prefix),
    mk('div', { class: 'btnrow' }, fBtn(LT('label.bgen.generate'), generateIntoBarcode, { cls: 'primary', title: LT('label.bgen.fill_the_selected_barcode_with') })),
    mk('p', { class: 'hint' }, hint),
    fRow(LT('label.bgen.count'), count),
    mk('div', { class: 'btnrow' }, fBtn(LT('label.bgen.generate_many'), generateManyLabels, { title: LT('label.bgen.make_one_label_per_random') })));
}
/** Re-renders the Properties panel so the generator fields match the chosen symbology. */
function rebuildPanel() { if (typeof renderPanels === 'function') renderPanels(); }

/** Fills the selected barcode with one random value of the chosen symbology. */
function generateIntoBarcode() {
  const o = selOne();
  if (!o || o.type !== 'barcode') { SlopUI.toast(LT('label.bgen.select_a_barcode_first')); return; }
  let v;
  try { v = genValues(0)[0]; } catch (e) { SlopUI.toast(e.message); return; }
  const sym = GEN.symbology;
  editSel((x) => { applySymbology(x, sym); x.content = v; }, LT('label.bgen.generate_barcode'));
  SlopUI.toast(LT('label.bgen.generated', { v: String(v) }));
}

/** N random values as data rows, one label each. The selected barcode shows {Barcode}. */
async function generateManyLabels() {
  const d = App.doc, o = selOne();
  if (!o || o.type !== 'barcode') { SlopUI.toast(LT('label.bgen.select_a_barcode_first_it')); return; }
  let vals;
  try { vals = genValues(Math.max(1, GEN.count | 0)); } catch (e) { SlopUI.toast(e.message); return; }
  if (d.data && !(await SlopUI.confirm(LT('label.bgen.replace_the_data'), LT('label.bgen.replace_body', { name: d.data.name, n: vals.length }), LT('label.bgen.replace')))) return;
  const src = { name: 'Generated barcodes', columns: ['Barcode'], rows: vals.map((v) => [v]), map: {}, qtyCol: '' };
  const sym = GEN.symbology, id = o.id;
  App.rec = 0;
  editDoc((x) => {
    x.data = src;
    const b = x.objects.find((ob) => ob.id === id);
    if (b) { applySymbology(b, sym); b.content = '{Barcode}'; }
  }, LT('label.bgen.generate_labels'));
  App.tab = 'data';
  refresh();
  SlopUI.toast(LT('label.bgen.made', { n: vals.length }));
}
