/* SlopLabel — io/examples: the example data CSV (text from shared/data/examples.js) and a sample .sloplabel
 * template, both made in the browser. Nothing is downloaded from a server. */
'use strict';

function downloadExampleCSV() {
  SlopUI.download(new Blob([SlopExamples.csv('label')], { type: 'text/csv;charset=utf-8' }), SlopExamples.filename('label'));
}
/** A product label: name, SKU and price, and the EAN-13 barcode from the {EAN} column. */
function exampleTemplateText() {
  const d = newDoc({ name: 'Product label (example)', stock: stockById('roll-62x29') });
  d.objects.push(
    makeObject('text', { name: 'Name', x: 3, y: 2, w: 56, h: 6, content: '{Name}', size: 10, bold: true }),
    makeObject('text', { name: 'SKU and price', x: 3, y: 8, w: 56, h: 4, content: 'SKU {SKU}   Price {Price}', size: 8 }),
    makeObject('barcode', { name: 'EAN', x: 3, y: 12.5, w: 40, h: 14, content: '{EAN}', symbology: 'ean13', hr: 'below' }));
  return serializeProject(d);
}
function downloadExampleTemplate() {
  SlopUI.download(new Blob([exampleTemplateText()], { type: 'application/json' }), 'sloplabel-example.sloplabel');
}
