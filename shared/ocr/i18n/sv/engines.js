/* Text recognition engines, Swedish. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-sv.md. */
window.SlopI18n && window.SlopI18n.add('sv', {
  'ocrengine.label': 'Motor för textigenkänning',
  'ocrengine.auto': 'Automatiskt (den bästa för språket)',
  'ocrengine.note': 'Vilken motor som läser texten. Automatiskt använder den mest exakta för det språk du väljer.',
  'ocrengine.hidden': '{name} erbjuds inte på den här webbplatsen.',
  'ocrengine.unknown_model': '{model} är inte en Tesseract-modell.',
  'ocrengine.reading': 'Läser språkdata från den här enheten…',
  'ocrengine.starting': 'Startar Tesseract…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'Tesseracts data för just det här språket. Läser tydlig tryckt text med språkets egna bokstäver och accenter.',
  'ocrengine.model_arch': 'Tesseract 5 LSTM-textigenkänning (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best från Tesseract OCR-projektet (från paketen @tesseract.js-data), på Slopographics filvärd',
});
