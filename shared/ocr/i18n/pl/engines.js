/* Text recognition engines, Polish. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-pl.md. */
window.SlopI18n && window.SlopI18n.add('pl', {
  'ocrengine.label': 'Silnik rozpoznawania tekstu',
  'ocrengine.auto': 'Auto (najlepszy dla języka)',
  'ocrengine.note': 'Który silnik odczytuje tekst. Auto używa najdokładniejszego dla wybranego języka.',
  'ocrengine.hidden': '{name} nie jest dostępny na tej stronie.',
  'ocrengine.unknown_model': '{model} nie jest modelem Tesseract.',
  'ocrengine.reading': 'Odczytywanie danych językowych z tego urządzenia…',
  'ocrengine.starting': 'Uruchamianie Tesseract…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'Dane Tesseract tylko dla tego języka. Odczytuje wyraźny tekst drukowany ze znakami i akcentami właściwymi dla języka.',
  'ocrengine.model_arch': 'Rozpoznawanie tekstu Tesseract 5 LSTM (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best z projektu Tesseract OCR (z pakietów @tesseract.js-data), na serwerze plików Slopographic',
});
