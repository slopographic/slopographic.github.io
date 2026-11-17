/* Slop OCR, Dutch: the help box under the text (languages, the models, the PDF text layer, accuracy). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('nl', {
  'ocr.help.summary': 'Talen, de modellen en de tekstlaag van pdf’s',
  'ocr.help.lang_h': 'Talen.',
  'ocr.help.lang': ' Druk op Taal en model om de taal van de tekst te kiezen. Eén model leest elk schrift: Latijns schrift met zijn accenten (Zweeds å ä ö, Duits, Frans, Spaans, Pools, Tsjechisch, Roemeens, Turks en nog zo’n 50 andere), Chinees (vereenvoudigd en traditioneel) en Japans; Cyrillisch (Russisch, Oekraïens, Bulgaars, Servisch, Kazachs …); Arabisch schrift (Arabisch, Perzisch, Urdu …); Devanagari (Hindi, Marathi, Nepalees); Koreaans; Grieks; Thai; Tamil; Telugu. Zonder keuze leest het ingebouwde model eerst Chinees en Engels (andere Latijnse tekst verliest zijn accenten), en een regel onder de tekst biedt het juiste model aan wanneer de tekst een ander schrift lijkt te hebben.',
  'ocr.help.models_h': 'De modellen.',
  'ocr.help.models': ' PaddleOCR (PP-OCRv4, PP-OCRv5 en PP-OCRv6), Apache 2.0. Elk model wordt alleen gedownload als je op Downloaden drukt in het venster Taal en model, dat de grootte en de licentie noemt. Niets downloadt vanzelf, en de bestanden worden gecontroleerd voordat ze op dit apparaat worden bewaard.',
  'ocr.help.pdf_h': 'Doorzoekbare pdf.',
  'ocr.help.pdf': ' De afbeelding van elke pagina blijft bewaard, met bovenop een onzichtbare tekstlaag, zodat je de tekst kunt doorzoeken en selecteren. Het standaard pdf-lettertype tekent alleen Latijnse letters, dus tekens die het niet kan tekenen, vallen weg uit de tekstlaag (de afbeelding toont ze wel). Tekst wordt geplaatst op de positie van elke regel; als je regels toevoegt of verwijdert, staan de extra regels onder het laatste kader.',
  'ocr.help.acc_h': 'Nauwkeurigheid.',
  'ocr.help.acc': ' Controleer de tekst voordat je hem gebruikt. Alleen horizontale regels worden gelezen; gedraaide tekst wordt niet eerst rechtgezet.',
});
