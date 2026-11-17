/* Slop OCR, German: the help page: languages, the models and the PDF text layer. Same keys as ocr/i18n/en/help.js. Terms: shared/i18n/glossary-de.md. */
window.SlopI18n && window.SlopI18n.add('de', {
  'ocr.help.summary': 'Sprachen, Modelle und die Textebene im PDF',
  'ocr.help.lang_h': 'Sprachen.',
  'ocr.help.lang': ' „Sprache und Modell“ drücken, um die Sprache des Textes zu wählen. Ein Modell liest jeweils eine Schrift: lateinische Schrift mit ihren Akzenten (Schwedisch å ä ö, Deutsch, Französisch, Spanisch, Polnisch, Tschechisch, Rumänisch, Türkisch und etwa 50 weitere), Chinesisch (vereinfacht und traditionell) und Japanisch; kyrillische Schrift (Russisch, Ukrainisch, Bulgarisch, Serbisch, Kasachisch …); arabische Schrift (Arabisch, Persisch, Urdu …); Devanagari (Hindi, Marathi, Nepali); Koreanisch; Griechisch; Thailändisch; Tamil; Telugu. Ohne Auswahl liest das mitgelieferte Modell zuerst Chinesisch und Englisch (anderer lateinischer Text verliert seine Akzente). Eine Zeile unter dem Text bietet das passende Modell an, wenn der Text wie eine andere Schrift aussieht.',
  'ocr.help.models_h': 'Die Modelle.',
  'ocr.help.models': ' PaddleOCR (PP-OCRv4, PP-OCRv5 und PP-OCRv6), Apache 2.0. Jedes wird nur geladen, wenn im Dialog „Sprache und Modell“ auf „Herunterladen“ gedrückt wird; dort stehen Größe und Lizenz. Nichts wird von selbst geladen, und die Dateien werden geprüft, bevor sie auf diesem Gerät gespeichert bleiben.',
  'ocr.help.pdf_h': 'Durchsuchbares PDF.',
  'ocr.help.pdf': ' Das Bild jeder Seite bleibt erhalten, darüber liegt eine unsichtbare Textebene, sodass sich der Text suchen und markieren lässt. Die Standardschrift von PDF zeichnet nur lateinische Buchstaben; Zeichen, die sie nicht zeichnen kann, fehlen daher in der Textebene (das Bild zeigt sie weiterhin). Der Text wird an der Position jeder Zeile platziert; wenn Zeilen hinzugefügt oder entfernt werden, stehen die zusätzlichen Zeilen unter dem letzten Kästchen.',
  'ocr.help.acc_h': 'Genauigkeit.',
  'ocr.help.acc': ' Den Text vor der Verwendung prüfen. Nur waagerechte Zeilen werden gelesen; gedrehter Text wird vorher nicht gerade gerichtet.',
});
