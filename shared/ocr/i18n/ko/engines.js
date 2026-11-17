/* Text recognition engines, Korean. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-ko.md. */
window.SlopI18n && window.SlopI18n.add('ko', {
  'ocrengine.label': '텍스트 인식 엔진',
  'ocrengine.auto': '자동 (이 언어에 가장 적합한 엔진)',
  'ocrengine.note': '텍스트를 읽는 엔진입니다. 자동은 선택한 언어에 가장 정확한 엔진을 사용합니다.',
  'ocrengine.hidden': '이 사이트에서는 {name}을(를) 제공하지 않습니다.',
  'ocrengine.unknown_model': '{model}은(는) Tesseract 모델이 아닙니다.',
  'ocrengine.reading': '이 기기에서 언어 데이터를 읽는 중…',
  'ocrengine.starting': 'Tesseract 시작 중…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': '이 언어 하나만을 위한 Tesseract 데이터입니다. 해당 언어의 문자와 악센트가 있는 선명한 인쇄 텍스트를 읽습니다.',
  'ocrengine.model_arch': 'Tesseract 5 LSTM 텍스트 인식 (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'Tesseract OCR 프로젝트의 tessdata_best (@tesseract.js-data 패키지 제공), Slopographic 파일 호스트에서',
});
