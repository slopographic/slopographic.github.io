/* Slop OCR, français : la boîte d’aide sous le texte (langues, modèles, couche de texte du PDF, précision). Règles : shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('fr', {
  'ocr.help.summary': 'Langues, modèles et couche de texte du PDF',
  'ocr.help.lang_h': 'Langues.',
  'ocr.help.lang': ' Appuyez sur Langue et modèle pour choisir la langue du texte. Un modèle lit chaque écriture : alphabet latin avec ses accents (suédois å ä ö, allemand, français, espagnol, polonais, tchèque, roumain, turc et une cinquantaine d’autres), chinois (simplifié et traditionnel) et japonais ; cyrillique (russe, ukrainien, bulgare, serbe, kazakh…) ; alphabet arabe (arabe, persan, ourdou…) ; devanagari (hindi, marathi, népali) ; coréen ; grec ; thaï ; tamoul ; télougou. Sans choix, le modèle fourni lit d’abord le chinois et l’anglais (les autres textes latins perdent leurs accents), et une ligne sous le texte propose le bon modèle lorsque le texte paraît être dans une autre écriture.',
  'ocr.help.models_h': 'Les modèles.',
  'ocr.help.models': ' PaddleOCR (PP-OCRv4, PP-OCRv5 et PP-OCRv6), licence Apache 2.0. Chacun n’est téléchargé que lorsque vous appuyez sur Télécharger dans la boîte Langue et modèle, qui indique sa taille et sa licence. Rien ne se télécharge tout seul, et les fichiers sont vérifiés avant d’être conservés sur cet appareil.',
  'ocr.help.pdf_h': 'PDF recherchable.',
  'ocr.help.pdf': ' L’image de chaque page est conservée, avec une couche de texte invisible par-dessus, pour pouvoir rechercher et sélectionner le texte. La police PDF standard ne trace que les lettres latines : les caractères qu’elle ne peut pas tracer sont omis de la couche de texte (l’image les montre toujours). Le texte est placé à la position de chaque ligne ; si vous ajoutez ou supprimez des lignes, les lignes supplémentaires se placent sous la dernière case.',
  'ocr.help.acc_h': 'Précision.',
  'ocr.help.acc': ' Vérifiez le texte avant de l’utiliser. Seules les lignes horizontales sont lues ; le texte incliné n’est pas redressé au préalable.',
});
