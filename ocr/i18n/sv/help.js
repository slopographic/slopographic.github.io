/* Slop OCR, Swedish: the help box under the text. Same keys as ocr/i18n/en/help.js. Terms: shared/i18n/glossary-sv.md. */
window.SlopI18n && window.SlopI18n.add('sv', {
  'ocr.help.summary': 'Språk, modellerna och PDF:ens textlager',
  'ocr.help.lang_h': 'Språk.',
  'ocr.help.lang': ' Tryck på Språk och modell för att välja textens språk. En modell läser varje skriftsystem: latinsk skrift med sina diakritiska tecken (svenska å ä ö, tyska, franska, spanska, polska, tjeckiska, rumänska, turkiska och ett femtiotal till), kinesiska (förenklad och traditionell) och japanska; kyrilliska (ryska, ukrainska, bulgariska, serbiska, kazakiska …); arabisk skrift (arabiska, persiska, urdu …); devanagari (hindi, marathi, nepali); koreanska; grekiska; thailändska; tamil; telugu. Utan ett val läser den medföljande modellen kinesiska och engelska först (annan latinsk text tappar sina diakritiska tecken), och en rad under texten erbjuder rätt modell när texten ser ut att vara en annan skrift.',
  'ocr.help.models_h': 'Modellerna.',
  'ocr.help.models': ' Två motorer läser texten: PaddleOCR (PP-OCRv4, PP-OCRv5 och PP-OCRv6, en modell per skriftsystem) och Tesseract (en modell per språk, ett hundratal språk), båda Apache 2.0. Motor för textigenkänning väljer en av dem; Automatiskt använder den mest exakta modellen för det språk du väljer. Varje modell laddas ned först när du trycker på Ladda ned i dialogrutan Språk och modell, som anger dess storlek och licens. Inget laddas ned av sig självt, och filerna kontrolleras innan de sparas på den här enheten.',
  'ocr.help.pdf_h': 'Sökbar PDF.',
  'ocr.help.pdf': ' Bilden av varje sida behålls, med ett osynligt textlager ovanpå, så att du kan söka i och markera texten. PDF-standardteckensnittet ritar bara latinska bokstäver, så de tecken det inte kan rita lämnas utanför textlagret (bilden visar dem fortfarande). Texten placeras på varje rads position; om du lägger till eller tar bort rader hamnar de extra raderna under den sista rutan.',
  'ocr.help.acc_h': 'Noggrannhet.',
  'ocr.help.acc': ' Läs igenom texten innan du använder den. Bara vågräta rader läses; roterad text vänds inte först.',
});
