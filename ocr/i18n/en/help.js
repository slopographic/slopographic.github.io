/* Slop OCR, English: the help box under the text (languages, the models, the PDF text layer, accuracy). Every other
 * language copies these keys into ocr/i18n/<code>/help.js. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  'ocr.help.summary': 'Languages, the models and the PDF text layer',
  'ocr.help.lang_h': 'Languages.',
  'ocr.help.lang': ' Press Language and model to choose the language of the text. One model reads each script: Latin script with its accents (Swedish å ä ö, German, French, Spanish, Polish, Czech, Romanian, Turkish and about 50 more), Chinese (simplified and traditional) and Japanese; Cyrillic (Russian, Ukrainian, Bulgarian, Serbian, Kazakh …); Arabic script (Arabic, Persian, Urdu …); Devanagari (Hindi, Marathi, Nepali); Korean; Greek; Thai; Tamil; Telugu. Without a choice, the bundled model reads Chinese and English first (other Latin text loses its accents), and a line under the text offers the right model when the text looks like another script.',
  'ocr.help.models_h': 'The models.',
  'ocr.help.models': ' Two engines read the text: PaddleOCR (PP-OCRv4, PP-OCRv5 and PP-OCRv6, one model per script) and Tesseract (one model per language, about 100 languages), both Apache 2.0. Text recognition engine chooses one; Auto uses the most accurate model for the language you choose. Each model is downloaded only when you press Download in the Language and model dialog, which names its size and licence. Nothing downloads on its own, and the files are checked before they are kept on this device.',
  'ocr.help.pdf_h': 'Searchable PDF.',
  'ocr.help.pdf': ' The picture of each page is kept, with an invisible text layer on top, so you can search and select the text. The standard PDF font draws Latin letters only, so the characters it cannot draw are left out of the text layer (the picture still shows them). Text is placed at each line\'s position; if you add or remove lines, the extra lines sit below the last box.',
  'ocr.help.acc_h': 'Accuracy.',
  'ocr.help.acc': ' Read the text before you use it. Only horizontal lines are read; rotated text is not turned first.',
});
