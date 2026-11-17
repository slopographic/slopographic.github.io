/* Slop OCR, Traditional Chinese (Taiwan): the help text on languages, the models and the PDF text layer. Same keys as
 * ocr/i18n/en/help.js. Terms: shared/i18n/glossary-zh-TW.md. */
window.SlopI18n && window.SlopI18n.add('zh-TW', {
  'ocr.help.summary': '語言、模型與 PDF 文字層',
  'ocr.help.lang_h': '語言。',
  'ocr.help.lang': ' 按「語言與模型」選擇文字的語言。每種文字系統由一個模型辨識：拉丁字母（含重音符號，例如瑞典文 å ä ö、德文、法文、西班牙文、波蘭文、捷克文、羅馬尼亞文、土耳其文及另外約 50 種語言）、中文（簡體與繁體）與日文；西里爾字母（俄文、烏克蘭文、保加利亞文、塞爾維亞文、哈薩克文等）；阿拉伯字母（阿拉伯文、波斯文、烏爾都文等）；天城文（印地文、馬拉地文、尼泊爾文）；韓文；希臘文；泰文；坦米爾文；泰盧固文。若未選擇，內建模型會先辨識中文與英文（其他拉丁文字會遺失重音符號）；當文字看起來屬於其他文字系統時，文字下方的提示會建議正確的模型。',
  'ocr.help.models_h': '模型。',
  'ocr.help.models': ' PaddleOCR（PP-OCRv4、PP-OCRv5 與 PP-OCRv6），Apache 2.0 授權。只有在「語言與模型」對話方塊中按下「下載」時，各模型才會下載；對話方塊會列出大小與授權。不會自動下載任何內容，檔案在保留於此裝置前都會經過檢查。',
  'ocr.help.pdf_h': '可搜尋的 PDF。',
  'ocr.help.pdf': ' 每一頁的圖片都會保留，上方疊加一層隱形的文字層，讓您可以搜尋與選取文字。標準 PDF 字型只能繪製拉丁字母，因此無法繪製的字元會從文字層中省略（圖片仍會顯示）。文字會依各行的位置放置；若您新增或刪除行，多出的行會排在最後一個框線之下。',
  'ocr.help.acc_h': '準確度。',
  'ocr.help.acc': ' 使用前請檢查文字。只會辨識水平的文字行，旋轉的文字不會先被轉正。',
});
