/* Text recognition engines, Dutch. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-nl.md. */
window.SlopI18n && window.SlopI18n.add('nl', {
  'ocrengine.label': 'Engine voor tekstherkenning',
  'ocrengine.auto': 'Auto (de beste voor de taal)',
  'ocrengine.note': 'Welke engine de tekst leest. Auto gebruikt de nauwkeurigste voor de taal die je kiest.',
  'ocrengine.hidden': '{name} wordt op deze site niet aangeboden.',
  'ocrengine.unknown_model': '{model} is geen Tesseract-model.',
  'ocrengine.reading': 'De taalgegevens worden van dit apparaat gelezen…',
  'ocrengine.starting': 'Tesseract wordt gestart…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'Tesseract-gegevens voor precies deze ene taal. Leest duidelijke gedrukte tekst met de eigen letters en accenten van de taal.',
  'ocrengine.model_arch': 'Tesseract 5 LSTM-tekstherkenning (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best van het Tesseract OCR-project (uit de @tesseract.js-data-pakketten), op de bestandshost van Slopographic',
});
