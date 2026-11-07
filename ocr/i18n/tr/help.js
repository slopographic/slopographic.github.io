/* Slop OCR, Turkish: the help box under the text (languages, the models, the PDF text layer, accuracy). Same keys as
 * ocr/i18n/en/help.js. Terms: shared/i18n/glossary-tr.md. */
window.SlopI18n && window.SlopI18n.add('tr', {
  'ocr.help.summary': 'Diller, modeller ve PDF metin katmanı',
  'ocr.help.lang_h': 'Diller.',
  'ocr.help.lang': ' Metnin dilini seçmek için Dil ve model düğmesine basın. Her yazı türünü bir model okur: aksanlı Latin harfleri (İsveççe å ä ö, Almanca, Fransızca, İspanyolca, Lehçe, Çekçe, Romence, Türkçe ve yaklaşık 50 dil daha), Çince (basitleştirilmiş ve geleneksel) ile Japonca; Kiril (Rusça, Ukraynaca, Bulgarca, Sırpça, Kazakça …); Arap yazısı (Arapça, Farsça, Urduca …); Devanagari (Hintçe, Marathi, Nepalce); Korece; Yunanca; Tayca; Tamilce; Telugu. Seçim yapmazsanız hazır gelen model önce Çince ve İngilizceyi okur (diğer Latin metinlerin aksanları kaybolur); metin başka bir yazıya benziyorsa, metnin altındaki bir satır doğru modeli önerir.',
  'ocr.help.models_h': 'Modeller.',
  'ocr.help.models': ' PaddleOCR (PP-OCRv4, PP-OCRv5 ve PP-OCRv6), Apache 2.0. Her biri yalnızca Dil ve model iletişim kutusunda İndir düğmesine bastığınızda iner; kutu boyutunu ve lisansını gösterir. Hiçbir şey kendiliğinden inmez ve dosyalar bu cihazda saklanmadan önce denetlenir.',
  'ocr.help.pdf_h': 'Aranabilir PDF.',
  'ocr.help.pdf': ' Her sayfanın resmi korunur, üzerine görünmez bir metin katmanı eklenir; böylece metni arayabilir ve seçebilirsiniz. Standart PDF yazı tipi yalnızca Latin harflerini çizer; çizemediği karakterler metin katmanında atlanır (resimde yine görünürler). Metin her satırın konumuna yerleştirilir; satır eklerseniz ya da silerseniz, fazla satırlar son kutunun altında kalır.',
  'ocr.help.acc_h': 'Doğruluk.',
  'ocr.help.acc': ' Kullanmadan önce metni kontrol edin. Yalnızca yatay satırlar okunur; döndürülmüş metin önce çevrilmez.',
});
