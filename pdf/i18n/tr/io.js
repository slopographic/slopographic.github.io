/* Slop PDF, Turkish: opening, saving and extracting (errors, skipped items, change labels) and the Layers panel names (pdf/js/io, pdf/js/core). Same keys as pdf/i18n/en/io.js. Terms: shared/i18n/glossary-tr.md. */
window.SlopI18n && window.SlopI18n.add('tr', {
  // core/fonts-custom.js
  'pdf.core.font_missing': '{family} yüklü değil.',

  // core/layers.js
  'pdf.core.layer_numbered': '{name} {n}',
  'pdf.core.layer_step_n': '{n}. adım',
  'pdf.core.layer_text': 'Metin',
  'pdf.core.layer_callout': 'Açıklama kutusu',
  'pdf.core.layer_comment': 'Yorum',
  'pdf.core.layer_rect': 'Dikdörtgen',
  'pdf.core.layer_ellipse': 'Elips',
  'pdf.core.layer_line': 'Çizgi',
  'pdf.core.layer_arrow': 'Ok',
  'pdf.core.layer_drawing': 'Çizim',
  'pdf.core.layer_highlighter': 'Vurgulayıcı',
  'pdf.core.layer_highlight': 'Vurgu',
  'pdf.core.layer_texthl': 'Metin vurgusu',
  'pdf.core.layer_whiteout': 'Beyaz örtü',
  'pdf.core.layer_image': 'Resim',
  'pdf.core.layer_redaction': 'Karartma',
  'pdf.core.layer_step': 'Adım',
  'pdf.core.layer_paragraph': 'Paragraf',
  'pdf.core.layer_signature': 'İmza',
  'pdf.core.layer_item': 'Öğe',

  // core/pdf-parts.js
  'pdf.io.meta_pages': 'sayfalar {list}',
  'pdf.io.meta_page': 'sayfa {n}',
  'pdf.io.font_stream_raw': 'Bu yazı tipi akışı çözülemeyen bir biçimde saklanmış',
  'pdf.io.not_embedded': 'gömülü değil',
  'pdf.io.font_composite': 'Bileşik ({type})',
  'pdf.io.not_decoded': 'Çözülmedi',
  'pdf.io.image_undecodable': 'Resim verisi açılamadı',
  'pdf.io.image_no_size': 'Resmin boyutu yok',
  'pdf.io.image_short': 'Resim verisi, boyutundan kısa',
  'pdf.io.att_raw': 'Bu ek çözülemeyen bir biçimde saklanmış',

  // core/pdfjs.js
  'pdf.core.needs_password': 'Bu PDF bir parola gerektiriyor.',
  'pdf.core.err_invalid': '“{name}” geçerli bir PDF değil ya da onarılamayacak kadar bozuk.',
  'pdf.core.err_empty': '“{name}” boş.',
  'pdf.core.err_password': '“{name}” için doğru parola gerekiyor.',
  'pdf.core.err_open': '“{name}” açılamadı: {msg}',
  'pdf.core.unsupported_encryption': 'Desteklenmeyen şifreleme',
  'pdf.core.writer_missing': 'PDF yazıcısı yüklenemedi.',

  // io/assets-model.js
  'pdf.io.unknown': 'bilinmiyor',
  'pdf.io.none': 'yok',
  'pdf.io.skip_stencil': 'Şablon maskesi (1 bit) çözülmüyor',
  'pdf.io.skip_jpx': 'JPEG 2000 resimleri çözülmüyor',
  'pdf.io.skip_jbig2': 'JBIG2 resimleri çözülmüyor',
  'pdf.io.skip_ccitt': 'CCITT faks resimleri çözülmüyor',
  'pdf.io.skip_filter': '{filter} filtresi çözülmüyor',
  'pdf.io.skip_raw': 'Bu türdeki sıkıştırılmamış resimler çözülmüyor',
  'pdf.io.skip_bpc': '{bpc} bitlik örnekler çözülmüyor',
  'pdf.io.skip_palette': '{cs} içindeki palet çözülmüyor',
  'pdf.io.skip_colour': '{cs} renk uzayı çözülmüyor',
  'pdf.io.mask_excluded': 'maske dahil edilmedi',
  'pdf.io.font_not_embedded': 'Gömülü değil: PDF yazı tipine başvuruyor, kaydedilecek bir dosya yok',
  'pdf.io.font_subset': 'alt küme: eksik olabilir',
  'pdf.io.att_on_page': '{n}. sayfaya eklenmiş',
  'pdf.io.att_document': 'belgeye eklenmiş',
  'pdf.io.att_einvoice': 'e-fatura (ZUGFeRD / Factur-X)',
  'pdf.io.att_rel': 'ilişki: {rel}',

  // io/assets-save.js
  'pdf.io.assets_name': 'PDF öğeleri',
  'pdf.io.no_font_file': 'Gömülü değil, bu yüzden yazı tipi dosyası yok',

  // io/decrypt.js
  'pdf.io.crypto_load_failed': 'PDF parola kodu yüklenemedi.',
  'pdf.io.crypto_not_loaded': 'PDF parola kodu yüklenmedi.',

  // io/doc-changes.js
  'pdf.io.changes_replayed': 'Kaydedilmiş değişiklikleri yeniden uygula',

  // io/edit-log.js
  'pdf.io.log_found_title': 'Kaydedilmiş düzenlemeler bulundu',
  'pdf.io.log_found_body': 'Slop PDF, bu cihazda “{name}” dosyasına ait {n} düzenlemeyi tutuyor. Bunları bu dosyada yeniden uygulayabilir ya da atabilirsiniz. Kaydet ya da Dışa aktar her durumda yeni bir PDF yazar.',
  'pdf.io.log_found_body#one': 'Slop PDF, bu cihazda “{name}” dosyasına ait {n} düzenlemeyi tutuyor. Bunları bu dosyada yeniden uygulayabilir ya da atabilirsiniz. Kaydet ya da Dışa aktar her durumda yeni bir PDF yazar.',
  'pdf.io.log_discard': 'At',
  'pdf.io.log_replay': 'Yeniden uygula',
  'pdf.io.log_replayed': 'Kaydedilmiş düzenlemeleri yeniden uygula',

  // io/export.js
  'pdf.io.no_pages': 'Dışa aktarılacak sayfa yok.',
  'pdf.io.redact_pending': '{n} alan karartma için işaretlendi ama henüz karartılmadı. Karart’ı açın ve “Karartmaları uygula”yı seçin ya da işaretleri kaldırın.',
  'pdf.io.redact_pending#one': '{n} alan karartma için işaretlendi ama henüz karartılmadı. Karart’ı açın ve “Karartmaları uygula”yı seçin ya da işaretleri kaldırın.',
  'pdf.io.source_missing': 'Bir kaynak dosya eksik.',
  'pdf.io.locked': '“{name}” Slop PDF’in kaldıramadığı bir şifreleme kullanıyor ({why}), bu yüzden sayfaları dışa aktarılamıyor.',

  // io/ocg.js
  'pdf.io.layer': 'Katman',
  'pdf.io.layer_hide': '“{name}” katmanını gizle',
  'pdf.io.layer_show': '“{name}” katmanını göster',
  'pdf.io.layer_delete': '“{name}” katmanını sil',

  // io/sample.js
  'pdf.io.sample_busy_playful': 'Taze bir parti jöle karıştırılıyor…',
  'pdf.io.sample_busy_plain': 'Örnek hazırlanıyor…',

  // io/session.js
  'pdf.io.restore': 'Geri yükle',
  'pdf.io.close_all': 'Tümünü kapat',
});
