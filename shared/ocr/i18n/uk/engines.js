/* Text recognition engines, Ukrainian. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-uk.md. */
window.SlopI18n && window.SlopI18n.add('uk', {
  'ocrengine.label': 'Рушій розпізнавання тексту',
  'ocrengine.auto': 'Авто (найкращий для мови)',
  'ocrengine.note': 'Який рушій читає текст. «Авто» використовує найточніший для вибраної мови.',
  'ocrengine.hidden': '{name} не пропонується на цьому сайті.',
  'ocrengine.unknown_model': '{model} — не модель Tesseract.',
  'ocrengine.reading': 'Читання мовних даних з цього пристрою…',
  'ocrengine.starting': 'Запуск Tesseract…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'Дані Tesseract лише для цієї мови. Розпізнає чіткий друкований текст з літерами та діакритикою цієї мови.',
  'ocrengine.model_arch': 'Розпізнавання тексту Tesseract 5 LSTM (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best проєкту Tesseract OCR (з пакетів @tesseract.js-data), на файловому хості Slopographic',
});
