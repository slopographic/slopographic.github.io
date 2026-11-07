/* Shared components, Turkish: ilk kullanım bildirimi (shared/firstrun/notice.js) ve indirmeden önce başlayan ortak motorların bildirimleri (HEIC, kamera RAW, 3D çözücüler). Kurallar: shared/i18n/APPS-HOWTO.md. Terimler: shared/i18n/glossary-tr.md. */
window.SlopI18n && window.SlopI18n.add('tr', {
  'ui.firstrun.privacy': 'Dosyalarınız bu tarayıcıda kalır. Hiçbir şey karşıya yüklenmez: site GitHub Pages üzerinde barındırılır ve sunucusu ya da arka uç depolaması yoktur.',
  'ui.firstrun.download_one': 'Bu bir kez indirilir ({size}) ve bir sonraki kullanımınız için bu tarayıcıda saklanır.',
  'ui.firstrun.download_many': 'Bunlar bir kez indirilir, toplamda yaklaşık {size}, ve bir sonraki kullanımınız için bu tarayıcıda saklanır.',
  'ui.firstrun.continue': 'Devam et',
  'ui.firstrun.heic_title': 'HEIC fotoğraf çözücü indirilsin mi?',
  'ui.firstrun.heic_text': 'Bu tarayıcı HEIC fotoğraflarını (iPhone biçimi) tek başına açamaz, bu yüzden birini dönüştürmek için HEIC çözücü gerekir (libheif, tarayıcınızda çalışacak şekilde derlenmiş; LGPL-3.0 lisansı). {brand}’in dosya deposundan bir kez indirilir, denetlenir ve bu tarayıcıda saklanır. Fotoğraflarınız hiçbir zaman karşıya yüklenmez.',
  'ui.firstrun.heic_name': 'HEIC fotoğraf çözücü (libheif {version})',
  'ui.firstrun.raw_title': 'Kamera RAW motoru indirilsin mi?',
  'ui.firstrun.raw_text': 'Bir kamera RAW fotoğrafını işlemek için RAW motoru gerekir (LibRaw, tarayıcınızda çalışacak şekilde derlenmiş; LGPL-2.1 ya da CDDL-1.0 lisansı). {brand}’in dosya deposundan bir kez indirilir, denetlenir ve bu tarayıcıda saklanır.',
  'ui.firstrun.raw_name': 'Kamera RAW motoru (LibRaw {version})',
  'ui.firstrun.d3_title': '3D çözücü indirilsin mi?',
  'ui.firstrun.d3_text': 'Bu model sıkıştırılmış. Okumak için bir çözücü gerekir; bu, {brand} cdn’inden bir kez indirilir ve bu tarayıcıda saklanır. Model yine de bu cihazda okunur ve hiçbir zaman karşıya yüklenmez.',
});
