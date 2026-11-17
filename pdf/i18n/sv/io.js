/* Slop PDF, Swedish: opening, saving and extracting (errors, skipped items, change labels) and the Layers panel names (pdf/js/io, pdf/js/core). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('sv', {
  // core/fonts-custom.js
  'pdf.core.font_missing': '{family} är inte installerat.',

  // core/layers.js
  'pdf.core.layer_numbered': '{name} {n}',
  'pdf.core.layer_step_n': 'Steg {n}',
  'pdf.core.layer_text': 'Text',
  'pdf.core.layer_callout': 'Pratbubbla',
  'pdf.core.layer_comment': 'Kommentar',
  'pdf.core.layer_rect': 'Rektangel',
  'pdf.core.layer_ellipse': 'Ellips',
  'pdf.core.layer_line': 'Linje',
  'pdf.core.layer_arrow': 'Pil',
  'pdf.core.layer_drawing': 'Teckning',
  'pdf.core.layer_highlighter': 'Överstrykning',
  'pdf.core.layer_highlight': 'Markering',
  'pdf.core.layer_texthl': 'Textmarkering',
  'pdf.core.layer_whiteout': 'Vit överstrykning',
  'pdf.core.layer_image': 'Bild',
  'pdf.core.layer_redaction': 'Maskering',
  'pdf.core.layer_step': 'Steg',
  'pdf.core.layer_paragraph': 'Stycke',
  'pdf.core.layer_signature': 'Underskrift',
  'pdf.core.layer_item': 'Objekt',

  // core/pdf-parts.js
  'pdf.io.meta_pages': 'sidorna {list}',
  'pdf.io.meta_page': 'sidan {n}',
  'pdf.io.font_stream_raw': 'Teckensnittsströmmen är lagrad på ett sätt som inte avkodas',
  'pdf.io.not_embedded': 'inte inbäddat',
  'pdf.io.font_composite': 'Sammansatt ({type})',
  'pdf.io.not_decoded': 'Inte avkodad',
  'pdf.io.image_undecodable': 'Det gick inte att packa upp bilddata',
  'pdf.io.image_no_size': 'Bilden har ingen storlek',
  'pdf.io.image_short': 'Bilddata är kortare än bildens storlek',
  'pdf.io.att_raw': 'Den bifogade filen är lagrad på ett sätt som inte avkodas',

  // core/pdfjs.js
  'pdf.core.needs_password': 'Den här PDF:en kräver ett lösenord.',
  'pdf.core.err_invalid': '”{name}” är inte en giltig PDF, eller så är den för skadad för att repareras.',
  'pdf.core.err_empty': '”{name}” är tom.',
  'pdf.core.err_password': '”{name}” kräver rätt lösenord.',
  'pdf.core.err_open': 'Det gick inte att öppna ”{name}”: {msg}',
  'pdf.core.unsupported_encryption': 'Krypteringen stöds inte',
  'pdf.core.writer_missing': 'PDF-skrivaren lästes inte in.',

  // io/assets-model.js
  'pdf.io.unknown': 'okänd',
  'pdf.io.none': 'ingen',
  'pdf.io.skip_stencil': 'Stencilmask (1 bit) avkodas inte',
  'pdf.io.skip_jpx': 'JPEG 2000-bilder avkodas inte',
  'pdf.io.skip_jbig2': 'JBIG2-bilder avkodas inte',
  'pdf.io.skip_ccitt': 'CCITT-faxbilder avkodas inte',
  'pdf.io.skip_filter': 'Filtret {filter} avkodas inte',
  'pdf.io.skip_raw': 'Okomprimerade bilder av det här slaget avkodas inte',
  'pdf.io.skip_bpc': '{bpc}-bitars sampel avkodas inte',
  'pdf.io.skip_palette': 'Palett i {cs} avkodas inte',
  'pdf.io.skip_colour': 'Färgrymden {cs} avkodas inte',
  'pdf.io.mask_excluded': 'masken ingår inte',
  'pdf.io.font_not_embedded': 'Inte inbäddat: PDF:en hänvisar bara till teckensnittet, så det finns ingen fil att spara',
  'pdf.io.font_subset': 'delmängd: kan vara ofullständig',
  'pdf.io.att_on_page': 'bifogad på sidan {n}',
  'pdf.io.att_document': 'bifogad till dokumentet',
  'pdf.io.att_einvoice': 'e-faktura (ZUGFeRD / Factur-X)',
  'pdf.io.att_rel': 'relation: {rel}',

  // io/assets-save.js
  'pdf.io.assets_name': 'PDF-resurser',
  'pdf.io.no_font_file': 'Inte inbäddat, så det finns ingen teckensnittsfil',

  // io/decrypt.js
  'pdf.io.crypto_load_failed': 'Det gick inte att läsa in koden för PDF-lösenord.',
  'pdf.io.crypto_not_loaded': 'Koden för PDF-lösenord lästes inte in.',

  // io/doc-changes.js
  'pdf.io.changes_replayed': 'Spela upp sparade ändringar',

  // io/edit-log.js
  'pdf.io.log_found_title': 'Sparade ändringar hittades',
  'pdf.io.log_found_body': 'Slop PDF har sparat {n} ändringar av ”{name}” på den här enheten. Spela upp dem på filen eller ignorera dem. Spara eller Exportera skriver en ny PDF i båda fallen.',
  'pdf.io.log_found_body#one': 'Slop PDF har sparat {n} ändring av ”{name}” på den här enheten. Spela upp den på filen eller ignorera den. Spara eller Exportera skriver en ny PDF i båda fallen.',
  'pdf.io.log_discard': 'Ignorera',
  'pdf.io.log_replay': 'Spela upp',
  'pdf.io.log_replayed': 'Spela upp sparade ändringar',

  // io/export.js
  'pdf.io.no_pages': 'Det finns inga sidor att exportera.',
  'pdf.io.redact_pending': '{n} områden är markerade för maskering men inte maskerade än. Öppna Maskera och välj ”Tillämpa maskeringar”, eller ta bort markeringarna.',
  'pdf.io.redact_pending#one': '{n} område är markerat för maskering men inte maskerat än. Öppna Maskera och välj ”Tillämpa maskeringar”, eller ta bort markeringen.',
  'pdf.io.source_missing': 'En källfil saknas.',
  'pdf.io.locked': '”{name}” använder kryptering som Slop PDF inte kan ta bort ({why}), så dess sidor kan inte exporteras.',

  // io/ocg.js
  'pdf.io.layer': 'Lager',
  'pdf.io.layer_hide': 'Dölj lagret ”{name}”',
  'pdf.io.layer_show': 'Visa lagret ”{name}”',
  'pdf.io.layer_delete': 'Ta bort lagret ”{name}”',

  // io/sample.js
  'pdf.io.sample_busy_playful': 'Blandar en färsk sats sörja…',
  'pdf.io.sample_busy_plain': 'Skapar exemplet…',

  // io/session.js
  'pdf.io.restore': 'Återställ',
  'pdf.io.close_all': 'Stäng alla',
});
