/* Slop OCR, Simplified Chinese: the help text on languages, models, the PDF text layer and accuracy. Same keys as ocr/i18n/en/help.js. Terms: shared/i18n/glossary-zh-CN.md. */
window.SlopI18n && window.SlopI18n.add('zh-CN', {
  'ocr.help.summary': '语言、模型和 PDF 文字层',
  'ocr.help.lang_h': '语言。',
  'ocr.help.lang': ' 点按“语言和模型”选择文字的语言。每种文字系统对应一个模型：带重音符号的拉丁字母（瑞典语 å ä ö、德语、法语、西班牙语、波兰语、捷克语、罗马尼亚语、土耳其语及另外约 50 种语言）、中文（简体和繁体）和日语；西里尔字母（俄语、乌克兰语、保加利亚语、塞尔维亚语、哈萨克语……）；阿拉伯字母（阿拉伯语、波斯语、乌尔都语……）；天城文（印地语、马拉地语、尼泊尔语）；韩语；希腊语；泰语；泰米尔语；泰卢固语。未作选择时，内置模型先读取中文和英文（其他拉丁文字会失去重音符号）；当文字看起来属于其他文字系统时，文字下方的一行提示会提供正确的模型。',
  'ocr.help.models_h': '模型。',
  'ocr.help.models': ' PaddleOCR（PP-OCRv4、PP-OCRv5 和 PP-OCRv6），Apache 2.0 许可。只有在“语言和模型”对话框中点按“下载”时才会下载每个模型，对话框会注明大小和许可。不会自行下载任何内容，文件在保存到此设备前会经过校验。',
  'ocr.help.pdf_h': '可搜索的 PDF。',
  'ocr.help.pdf': ' 每页的图片都会保留，上面叠加一层不可见的文字层，因此你可以搜索和选择文字。标准 PDF 字体只能绘制拉丁字母，因此无法绘制的字符会从文字层中省略（图片中仍会显示这些字符）。文字放置在每一行的位置；如果你添加或删除行，多出的行会位于最后一个框线的下方。',
  'ocr.help.acc_h': '准确度。',
  'ocr.help.acc': ' 使用前请检查文字。只识别水平排列的文字行；旋转的文字不会先被转正。',
});
