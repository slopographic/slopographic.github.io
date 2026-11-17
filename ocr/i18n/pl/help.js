/* Slop OCR, Polish: the help text on languages, models and the PDF text layer. Same keys as ocr/i18n/en/help.js. Terms: shared/i18n/glossary-pl.md. */
window.SlopI18n && window.SlopI18n.add('pl', {
  'ocr.help.summary': 'Języki, modele i warstwa tekstu w PDF-ie',
  'ocr.help.lang_h': 'Języki.',
  'ocr.help.lang': ' Naciśnij Język i model, aby wybrać język tekstu. Jeden model czyta jedno pismo: alfabet łaciński z akcentami (polski, szwedzki å ä ö, niemiecki, francuski, hiszpański, czeski, rumuński, turecki i jeszcze około 50), chiński (uproszczony i tradycyjny) oraz japoński; cyrylica (rosyjski, ukraiński, bułgarski, serbski, kazachski …); pismo arabskie (arabski, perski, urdu …); dewanagari (hindi, marathi, nepali); koreański; grecki; tajski; tamilski; telugu. Bez wyboru wbudowany model czyta najpierw chiński i angielski (inny tekst łaciński traci akcenty), a linia pod tekstem proponuje właściwy model, gdy tekst wygląda na inne pismo.',
  'ocr.help.models_h': 'Modele.',
  'ocr.help.models': ' PaddleOCR (PP-OCRv4, PP-OCRv5 i PP-OCRv6), licencja Apache 2.0. Każdy pobiera się dopiero po naciśnięciu Pobierz w oknie Język i model, które podaje rozmiar i licencję. Nic nie pobiera się samo, a pliki są sprawdzane, zanim zostaną zachowane na tym urządzeniu.',
  'ocr.help.pdf_h': 'PDF z możliwością wyszukiwania.',
  'ocr.help.pdf': ' Obraz każdej strony zostaje, a na nim leży niewidoczna warstwa tekstu, dzięki czemu możesz szukać i zaznaczać tekst. Standardowa czcionka PDF rysuje tylko litery łacińskie, więc znaki, których nie potrafi narysować, są pominięte w warstwie tekstu (obraz nadal je pokazuje). Tekst jest umieszczany w położeniu każdego wiersza; jeśli dodasz lub usuniesz wiersze, dodatkowe wiersze znajdą się pod ostatnią ramką.',
  'ocr.help.acc_h': 'Dokładność.',
  'ocr.help.acc': ' Sprawdź tekst przed użyciem. Odczytywane są tylko poziome wiersze; tekst obrócony nie jest najpierw prostowany.',
});
