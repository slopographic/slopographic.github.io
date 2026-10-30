/* Text recognition engines, Turkish. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-tr.md. */
window.SlopI18n && window.SlopI18n.add('tr', {
  'ocrengine.label': 'Metin tanıma motoru',
  'ocrengine.auto': 'Otomatik (dil için en iyi)',
  'ocrengine.note': 'Metni hangi motorun okuyacağı. Otomatik, seçtiğiniz dil için en doğru olanı kullanır.',
  'ocrengine.hidden': '{name} bu sitede sunulmuyor.',
  'ocrengine.unknown_model': '{model} bir Tesseract modeli değil.',
  'ocrengine.reading': 'Dil verileri bu cihazdan okunuyor…',
  'ocrengine.starting': 'Tesseract başlatılıyor…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'Yalnızca bu dil için Tesseract verileri. Dilin kendi harf ve aksanlarıyla birlikte net basılı metinleri okur.',
  'ocrengine.model_arch': 'Tesseract 5 LSTM metin tanıma (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'Tesseract OCR projesinin tessdata_best verisi (@tesseract.js-data paketlerinden), Slopographic dosya sunucusunda',
});
