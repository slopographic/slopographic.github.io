/* Text recognition engines, Simplified Chinese. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-zh-CN.md. */
window.SlopI18n && window.SlopI18n.add('zh-CN', {
  'ocrengine.label': '文本识别引擎',
  'ocrengine.auto': '自动（该语言的最佳选择）',
  'ocrengine.note': '由哪个引擎读取文本。“自动”会为你所选的语言使用最精确的引擎。',
  'ocrengine.hidden': '本站未提供 {name}。',
  'ocrengine.unknown_model': '{model} 不是 Tesseract 模型。',
  'ocrengine.reading': '正在从本设备读取语言数据…',
  'ocrengine.starting': '正在启动 Tesseract…',
  'ocrengine.model_name': 'Tesseract：{lang}',
  'ocrengine.model_note': '该语言单独的 Tesseract 数据。可读取清晰的印刷文字，支持该语言特有的字母和重音符号。',
  'ocrengine.model_arch': 'Tesseract 5 LSTM 文本识别（tesseract.js {version}，WebAssembly）',
  'ocrengine.model_source': 'Tesseract OCR 项目的 tessdata_best（来自 @tesseract.js-data 软件包），托管于 Slopographic 文件服务器',
});
