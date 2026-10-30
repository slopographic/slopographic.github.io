/* Text recognition engines, French. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-fr.md. */
window.SlopI18n && window.SlopI18n.add('fr', {
  'ocrengine.label': 'Moteur de reconnaissance de texte',
  'ocrengine.auto': 'Auto (le meilleur pour la langue)',
  'ocrengine.note': 'Le moteur qui lit le texte. Auto utilise le plus précis pour la langue choisie.',
  'ocrengine.hidden': '{name} n’est pas proposé sur ce site.',
  'ocrengine.unknown_model': '{model} n’est pas un modèle Tesseract.',
  'ocrengine.reading': 'Lecture des données de langue depuis cet appareil…',
  'ocrengine.starting': 'Démarrage de Tesseract…',
  'ocrengine.model_name': 'Tesseract : {lang}',
  'ocrengine.model_note': 'Les données de Tesseract pour cette seule langue. Lit un texte imprimé net avec les lettres et accents propres à la langue.',
  'ocrengine.model_arch': 'Reconnaissance de texte LSTM de Tesseract 5 (tesseract.js {version}, WebAssembly)',
  'ocrengine.model_source': 'tessdata_best du projet Tesseract OCR (à partir des paquets @tesseract.js-data), sur l’hébergeur de fichiers de Slopographic',
});
