/* Text recognition engines, Russian. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-ru.md. */
window.SlopI18n && window.SlopI18n.add('ru', {
  'ocrengine.label': 'Движок распознавания текста',
  'ocrengine.auto': 'Авто (лучший для языка)',
  'ocrengine.note': 'Какой движок читает текст. «Авто» использует самый точный для выбранного языка.',
  'ocrengine.hidden': '{name} не предлагается на этом сайте.',
  'ocrengine.unknown_model': '{model} — не модель Tesseract.',
  'ocrengine.reading': 'Чтение языковых данных с этого устройства…',
  'ocrengine.starting': 'Запуск Tesseract…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'Данные Tesseract только для этого языка. Распознаёт чёткий печатный текст с буквами и диакритикой этого языка.',
  'ocrengine.model_arch': 'Распознавание текста Tesseract 5 LSTM (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best проекта Tesseract OCR (из пакетов @tesseract.js-data), на файловом хосте Slopographic',
});
