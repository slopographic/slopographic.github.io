/* Text recognition engines, Italian. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-it.md. */
window.SlopI18n && window.SlopI18n.add('it', {
  'ocrengine.label': 'Motore di riconoscimento del testo',
  'ocrengine.auto': 'Auto (il migliore per la lingua)',
  'ocrengine.note': 'Quale motore legge il testo. Auto usa quello più preciso per la lingua scelta.',
  'ocrengine.hidden': '{name} non è disponibile su questo sito.',
  'ocrengine.unknown_model': '{model} non è un modello Tesseract.',
  'ocrengine.reading': 'Lettura dei dati della lingua da questo dispositivo…',
  'ocrengine.starting': 'Avvio di Tesseract…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'I dati di Tesseract per questa sola lingua. Legge testo stampato nitido con le lettere e gli accenti propri della lingua.',
  'ocrengine.model_arch': 'Riconoscimento del testo LSTM di Tesseract 5 (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best del progetto Tesseract OCR (dai pacchetti @tesseract.js-data), sul server file di Slopographic',
});
