/* Text recognition engines, Spanish. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-es.md. */
window.SlopI18n && window.SlopI18n.add('es', {
  'ocrengine.label': 'Motor de reconocimiento de texto',
  'ocrengine.auto': 'Automático (el mejor para el idioma)',
  'ocrengine.note': 'Qué motor lee el texto. Automático usa el más preciso para el idioma que elijas.',
  'ocrengine.hidden': '{name} no se ofrece en este sitio.',
  'ocrengine.unknown_model': '{model} no es un modelo de Tesseract.',
  'ocrengine.reading': 'Leyendo los datos del idioma desde este dispositivo…',
  'ocrengine.starting': 'Iniciando Tesseract…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'Datos de Tesseract solo para este idioma. Lee texto impreso nítido con las letras y acentos propios del idioma.',
  'ocrengine.model_arch': 'Reconocimiento de texto LSTM de Tesseract 5 (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best del proyecto Tesseract OCR (de los paquetes @tesseract.js-data), en el servidor de archivos de Slopographic',
});
