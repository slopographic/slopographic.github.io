/* Text recognition engines, English: the "Text recognition engine" select (shared/ocr/choose.js), the engines' messages
 * (shared/ocr/engines.js, shared/ocr/engine-tesseract.js) and the Tesseract models' words (aitools/ocr-models.js).
 * Shipped in English and Swedish; other languages read English until they are translated. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  'ocrengine.label': 'Text recognition engine',
  'ocrengine.auto': 'Auto (the best for the language)',
  'ocrengine.note': 'Which engine reads the text. Auto uses the most accurate one for the language you choose.',
  'ocrengine.hidden': '{name} is not offered on this site.',
  'ocrengine.unknown_model': '{model} is not a Tesseract model.',
  'ocrengine.reading': 'Reading the language data from this device…',
  'ocrengine.starting': 'Starting Tesseract…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'Tesseract\'s data for this one language. Reads clear printed text with the language\'s own letters and accents.',
  'ocrengine.model_arch': 'Tesseract 5 LSTM text recognition (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best of the Tesseract OCR project (from the @tesseract.js-data packages), on the Slopographic file host',
});
