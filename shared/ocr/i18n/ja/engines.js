/* Text recognition engines, Japanese. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-ja.md. */
window.SlopI18n && window.SlopI18n.add('ja', {
  'ocrengine.label': 'テキスト認識エンジン',
  'ocrengine.auto': '自動（言語に最適なもの）',
  'ocrengine.note': 'テキストを読み取るエンジンです。「自動」は選択した言語で最も精度の高いものを使います。',
  'ocrengine.hidden': '{name} はこのサイトでは提供されていません。',
  'ocrengine.unknown_model': '{model} は Tesseract のモデルではありません。',
  'ocrengine.reading': 'この端末から言語データを読み込んでいます…',
  'ocrengine.starting': 'Tesseract を起動しています…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'この言語だけの Tesseract データです。その言語特有の文字やアクセント記号を含む、鮮明な印刷文字を読み取ります。',
  'ocrengine.model_arch': 'Tesseract 5 LSTM テキスト認識（tesseract.js {version}、WebAssembly）',
  'ocrengine.model_source': 'Tesseract OCR プロジェクトの tessdata_best（@tesseract.js-data パッケージより）、Slopographic のファイルホスト上',
});
