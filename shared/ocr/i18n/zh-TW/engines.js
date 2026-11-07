/* Text recognition engines, Traditional Chinese. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-zh-TW.md. */
window.SlopI18n && window.SlopI18n.add('zh-TW', {
  'ocrengine.label': '文字辨識引擎',
  'ocrengine.auto': '自動（該語言的最佳選擇）',
  'ocrengine.note': '由哪個引擎讀取文字。「自動」會為您所選的語言使用最精確的引擎。',
  'ocrengine.hidden': '本站未提供 {name}。',
  'ocrengine.unknown_model': '{model} 不是 Tesseract 模型。',
  'ocrengine.reading': '正在從本裝置讀取語言資料…',
  'ocrengine.starting': '正在啟動 Tesseract…',
  'ocrengine.model_name': 'Tesseract：{lang}',
  'ocrengine.model_note': '此語言專用的 Tesseract 資料。可讀取清晰的印刷文字，支援該語言特有的字母與重音符號。',
  'ocrengine.model_arch': 'Tesseract 5 LSTM 文字辨識（tesseract.js {version}，WebAssembly）',
  'ocrengine.model_source': 'Tesseract OCR 專案的 tessdata_best（來自 @tesseract.js-data 套件），託管於 Slopographic 檔案伺服器',
});
