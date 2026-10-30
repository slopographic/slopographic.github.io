/* Text recognition engines, German. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-de.md. */
window.SlopI18n && window.SlopI18n.add('de', {
  'ocrengine.label': 'Texterkennungs-Engine',
  'ocrengine.auto': 'Automatisch (die beste für die Sprache)',
  'ocrengine.note': 'Welche Engine den Text liest. Automatisch nimmt die genaueste für die gewählte Sprache.',
  'ocrengine.hidden': '{name} wird auf dieser Website nicht angeboten.',
  'ocrengine.unknown_model': '{model} ist kein Tesseract-Modell.',
  'ocrengine.reading': 'Die Sprachdaten werden von diesem Gerät gelesen…',
  'ocrengine.starting': 'Tesseract wird gestartet…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'Tesseract-Daten für genau diese eine Sprache. Liest klar gedruckten Text mit den eigenen Buchstaben und Akzenten der Sprache.',
  'ocrengine.model_arch': 'Tesseract-5-LSTM-Texterkennung (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best aus dem Tesseract-OCR-Projekt (aus den @tesseract.js-data-Paketen), auf dem Dateiserver von Slopographic',
});
