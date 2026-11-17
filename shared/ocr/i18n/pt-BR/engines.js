/* Text recognition engines, Brazilian Portuguese. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-pt-BR.md. */
window.SlopI18n && window.SlopI18n.add('pt-BR', {
  'ocrengine.label': 'Motor de reconhecimento de texto',
  'ocrengine.auto': 'Automático (o melhor para o idioma)',
  'ocrengine.note': 'Qual motor lê o texto. O automático usa o mais preciso para o idioma escolhido.',
  'ocrengine.hidden': '{name} não é oferecido neste site.',
  'ocrengine.unknown_model': '{model} não é um modelo do Tesseract.',
  'ocrengine.reading': 'Lendo os dados do idioma neste dispositivo…',
  'ocrengine.starting': 'Iniciando o Tesseract…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'Dados do Tesseract só para este idioma. Lê textos impressos nítidos com as letras e acentos próprios do idioma.',
  'ocrengine.model_arch': 'Reconhecimento de texto LSTM do Tesseract 5 (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best do projeto Tesseract OCR (dos pacotes @tesseract.js-data), no servidor de arquivos da Slopographic',
});
