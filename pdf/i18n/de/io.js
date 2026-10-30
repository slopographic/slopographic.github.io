/* Slop PDF, German: opening, saving and extracting (errors, skipped items, change labels) and the Layers panel names
 * (pdf/js/io, pdf/js/core). Rules: shared/i18n/APPS-HOWTO.md, shared/i18n/glossary-de.md. */
window.SlopI18n && window.SlopI18n.add('de', {
  // core/fonts-custom.js
  'pdf.core.font_missing': '{family} ist nicht installiert.',

  // core/layers.js
  'pdf.core.layer_numbered': '{name} {n}',
  'pdf.core.layer_step_n': 'Schritt {n}',
  'pdf.core.layer_text': 'Text',
  'pdf.core.layer_callout': 'Legende',
  'pdf.core.layer_comment': 'Kommentar',
  'pdf.core.layer_rect': 'Rechteck',
  'pdf.core.layer_ellipse': 'Ellipse',
  'pdf.core.layer_line': 'Linie',
  'pdf.core.layer_arrow': 'Pfeil',
  'pdf.core.layer_drawing': 'Zeichnung',
  'pdf.core.layer_highlighter': 'Textmarker',
  'pdf.core.layer_highlight': 'Hervorhebung',
  'pdf.core.layer_texthl': 'Texthervorhebung',
  'pdf.core.layer_whiteout': 'Abdeckung',
  'pdf.core.layer_image': 'Bild',
  'pdf.core.layer_redaction': 'Schwärzung',
  'pdf.core.layer_step': 'Schritt',
  'pdf.core.layer_paragraph': 'Absatz',
  'pdf.core.layer_signature': 'Unterschrift',
  'pdf.core.layer_item': 'Element',

  // core/pdf-parts.js
  'pdf.io.meta_pages': 'Seiten {list}',
  'pdf.io.meta_page': 'Seite {n}',
  'pdf.io.font_stream_raw': 'Dieser Schrift-Stream ist in einer Form gespeichert, die nicht dekodiert wird',
  'pdf.io.not_embedded': 'nicht eingebettet',
  'pdf.io.font_composite': 'Zusammengesetzt ({type})',
  'pdf.io.not_decoded': 'Nicht dekodiert',
  'pdf.io.image_undecodable': 'Die Bilddaten konnten nicht entpackt werden',
  'pdf.io.image_no_size': 'Das Bild hat keine Größe',
  'pdf.io.image_short': 'Die Bilddaten sind kürzer als ihre Größe',
  'pdf.io.att_raw': 'Dieser Anhang ist in einer Form gespeichert, die nicht dekodiert wird',

  // core/pdfjs.js
  'pdf.core.needs_password': 'Diese PDF benötigt ein Kennwort.',
  'pdf.core.err_invalid': '„{name}“ ist keine gültige PDF oder ist irreparabel beschädigt.',
  'pdf.core.err_empty': '„{name}“ ist leer.',
  'pdf.core.err_password': '„{name}“ benötigt das richtige Kennwort.',
  'pdf.core.err_open': '„{name}“ konnte nicht geöffnet werden: {msg}',
  'pdf.core.unsupported_encryption': 'Nicht unterstützte Verschlüsselung',
  'pdf.core.writer_missing': 'Das PDF-Schreibmodul wurde nicht geladen.',

  // io/assets-model.js
  'pdf.io.unknown': 'unbekannt',
  'pdf.io.none': 'keine',
  'pdf.io.skip_stencil': 'Schablonenmaske (1 Bit) wird nicht dekodiert',
  'pdf.io.skip_jpx': 'JPEG-2000-Bilder werden nicht dekodiert',
  'pdf.io.skip_jbig2': 'JBIG2-Bilder werden nicht dekodiert',
  'pdf.io.skip_ccitt': 'CCITT-Faxbilder werden nicht dekodiert',
  'pdf.io.skip_filter': 'Filter {filter} wird nicht dekodiert',
  'pdf.io.skip_raw': 'Unkomprimierte Bilder dieser Art werden nicht dekodiert',
  'pdf.io.skip_bpc': '{bpc}-Bit-Werte werden nicht dekodiert',
  'pdf.io.skip_palette': 'Palette in {cs} wird nicht dekodiert',
  'pdf.io.skip_colour': 'Farbraum {cs} wird nicht dekodiert',
  'pdf.io.mask_excluded': 'Maske nicht enthalten',
  'pdf.io.font_not_embedded': 'Nicht eingebettet: Die PDF verweist nur auf die Schrift, es gibt keine Datei zum Speichern',
  'pdf.io.font_subset': 'Teilmenge: evtl. unvollständig',
  'pdf.io.att_on_page': 'angehängt an Seite {n}',
  'pdf.io.att_document': 'an das Dokument angehängt',
  'pdf.io.att_einvoice': 'E-Rechnung (ZUGFeRD / Factur-X)',
  'pdf.io.att_rel': 'Beziehung: {rel}',

  // io/assets-save.js
  'pdf.io.assets_name': 'PDF-Inhalte',
  'pdf.io.no_font_file': 'Nicht eingebettet, daher keine Schriftdatei',

  // io/decrypt.js
  'pdf.io.crypto_load_failed': 'Der PDF-Kennwortcode konnte nicht geladen werden.',
  'pdf.io.crypto_not_loaded': 'Der PDF-Kennwortcode wurde nicht geladen.',

  // io/doc-changes.js
  'pdf.io.changes_replayed': 'Gespeicherte Änderungen anwenden',

  // io/edit-log.js
  'pdf.io.log_found_title': 'Gespeicherte Änderungen gefunden',
  'pdf.io.log_found_body': 'Slop PDF hat {n} Änderungen an „{name}“ auf diesem Gerät aufbewahrt. Sie lassen sich auf diese Datei anwenden oder verwerfen. Speichern oder Exportieren schreibt in jedem Fall eine neue PDF.',
  'pdf.io.log_found_body#one': 'Slop PDF hat {n} Änderung an „{name}“ auf diesem Gerät aufbewahrt. Sie lässt sich auf diese Datei anwenden oder verwerfen. Speichern oder Exportieren schreibt in jedem Fall eine neue PDF.',
  'pdf.io.log_discard': 'Verwerfen',
  'pdf.io.log_replay': 'Anwenden',
  'pdf.io.log_replayed': 'Gespeicherte Änderungen anwenden',

  // io/export.js
  'pdf.io.no_pages': 'Es gibt keine Seiten zum Exportieren.',
  'pdf.io.redact_pending': '{n} Bereiche sind zum Schwärzen markiert, aber noch nicht geschwärzt. Schwärzen öffnen und „Schwärzungen anwenden“ wählen oder die Markierungen entfernen.',
  'pdf.io.redact_pending#one': '{n} Bereich ist zum Schwärzen markiert, aber noch nicht geschwärzt. Schwärzen öffnen und „Schwärzungen anwenden“ wählen oder die Markierung entfernen.',
  'pdf.io.source_missing': 'Eine Quelldatei fehlt.',
  'pdf.io.locked': '„{name}“ verwendet eine Verschlüsselung, die Slop PDF nicht entfernen kann ({why}), daher lassen sich die Seiten nicht exportieren.',

  // io/ocg.js
  'pdf.io.layer': 'Ebene',
  'pdf.io.layer_hide': 'Ebene „{name}“ ausblenden',
  'pdf.io.layer_show': 'Ebene „{name}“ einblenden',
  'pdf.io.layer_delete': 'Ebene „{name}“ löschen',

  // io/sample.js
  'pdf.io.sample_busy_playful': 'Eine frische Portion Glibber wird angerührt…',
  'pdf.io.sample_busy_plain': 'Beispiel wird erstellt…',

  // io/session.js
  'pdf.io.restore': 'Wiederherstellen',
  'pdf.io.close_all': 'Alle schließen',
});
