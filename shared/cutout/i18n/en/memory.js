/* SlopCutout, English: what a device the AI background remover cannot run on (too little memory, or a browser ONNX Runtime fails in) is told (shared/cutout/cutout.js
 * lowMemoryText). Other languages without a table read English. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  'cutoutmem.low_memory': 'This device is low on memory, so the AI background remover cannot run here.',
  'cutoutmem.manual': 'This device is low on memory, so the AI background remover cannot run here. Brush Remove over the background (and Keep over the subject) to cut it out by hand.',
  'cutoutmem.smaller': 'This device is low on memory: the Fast model was used instead.',
  'cutoutmem.unavailable': 'The AI background remover cannot run in this browser.',
  'cutoutmem.manual_unavailable': 'The AI background remover cannot run in this browser. Brush Remove over the background (and Keep over the subject) to cut it out by hand.',
});
