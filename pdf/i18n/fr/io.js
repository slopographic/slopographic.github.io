/* Slop PDF, français : les calques, les polices, les images et pièces jointes, le déchiffrement, l’export, la session et les messages d’enregistrement. Règles : shared/i18n/APPS-HOWTO.md, shared/i18n/glossary-fr.md. */
window.SlopI18n && window.SlopI18n.add('fr', {
  // core/fonts-custom.js
  'pdf.core.font_missing': '{family} n’est pas installée.',

  // core/layers.js
  'pdf.core.layer_numbered': '{name} {n}',
  'pdf.core.layer_step_n': 'Étape {n}',
  'pdf.core.layer_text': 'Texte',
  'pdf.core.layer_callout': 'Bulle',
  'pdf.core.layer_comment': 'Commentaire',
  'pdf.core.layer_rect': 'Rectangle',
  'pdf.core.layer_ellipse': 'Ellipse',
  'pdf.core.layer_line': 'Ligne',
  'pdf.core.layer_arrow': 'Flèche',
  'pdf.core.layer_drawing': 'Dessin',
  'pdf.core.layer_highlighter': 'Surligneur',
  'pdf.core.layer_highlight': 'Surlignage',
  'pdf.core.layer_texthl': 'Surlignage de texte',
  'pdf.core.layer_whiteout': 'Blanc',
  'pdf.core.layer_image': 'Image',
  'pdf.core.layer_redaction': 'Biffure',
  'pdf.core.layer_step': 'Étape',
  'pdf.core.layer_paragraph': 'Paragraphe',
  'pdf.core.layer_signature': 'Signature',
  'pdf.core.layer_item': 'Élément',

  // core/pdf-parts.js
  'pdf.io.meta_pages': 'pages {list}',
  'pdf.io.meta_page': 'page {n}',
  'pdf.io.font_stream_raw': 'Ce flux de police est stocké d’une façon qui n’est pas décodée',
  'pdf.io.not_embedded': 'non intégrée',
  'pdf.io.font_composite': 'Composite ({type})',
  'pdf.io.not_decoded': 'Non décodée',
  'pdf.io.image_undecodable': 'Les données de l’image n’ont pas pu être décompressées',
  'pdf.io.image_no_size': 'L’image n’a pas de dimensions',
  'pdf.io.image_short': 'Les données de l’image sont plus courtes que sa taille',
  'pdf.io.att_raw': 'Cette pièce jointe est stockée d’une façon qui n’est pas décodée',

  // core/pdfjs.js
  'pdf.core.needs_password': 'Ce PDF nécessite un mot de passe.',
  'pdf.core.err_invalid': '« {name} » n’est pas un PDF valide, ou il est endommagé au point de ne pas pouvoir être réparé.',
  'pdf.core.err_empty': '« {name} » est vide.',
  'pdf.core.err_password': '« {name} » nécessite le bon mot de passe.',
  'pdf.core.err_open': '« {name} » n’a pas pu être ouvert : {msg}',
  'pdf.core.unsupported_encryption': 'Chiffrement non pris en charge',
  'pdf.core.writer_missing': 'Le générateur de PDF n’a pas été chargé.',

  // io/assets-model.js
  'pdf.io.unknown': 'inconnu',
  'pdf.io.none': 'aucun',
  'pdf.io.skip_stencil': 'Masque (1 bit) non décodé',
  'pdf.io.skip_jpx': 'Les images JPEG 2000 ne sont pas décodées',
  'pdf.io.skip_jbig2': 'Les images JBIG2 ne sont pas décodées',
  'pdf.io.skip_ccitt': 'Les images de télécopie CCITT ne sont pas décodées',
  'pdf.io.skip_filter': 'Le filtre {filter} n’est pas décodé',
  'pdf.io.skip_raw': 'Les images non compressées de ce type ne sont pas décodées',
  'pdf.io.skip_bpc': 'Les échantillons de {bpc} bits ne sont pas décodés',
  'pdf.io.skip_palette': 'La palette en {cs} n’est pas décodée',
  'pdf.io.skip_colour': 'L’espace colorimétrique {cs} n’est pas décodé',
  'pdf.io.mask_excluded': 'masque non inclus',
  'pdf.io.font_not_embedded': 'Non intégrée : le PDF renvoie à la police, il n’y a donc pas de fichier à enregistrer',
  'pdf.io.font_subset': 'sous-ensemble : peut être incomplet',
  'pdf.io.att_on_page': 'joint à la page {n}',
  'pdf.io.att_document': 'joint au document',
  'pdf.io.att_einvoice': 'facture électronique (ZUGFeRD / Factur-X)',
  'pdf.io.att_rel': 'relation : {rel}',

  // io/assets-save.js
  'pdf.io.assets_name': 'Ressources PDF',
  'pdf.io.no_font_file': 'Non intégrée, il n’y a donc pas de fichier de police',

  // io/decrypt.js
  'pdf.io.crypto_load_failed': 'Le code de mot de passe PDF n’a pas pu être chargé.',
  'pdf.io.crypto_not_loaded': 'Le code de mot de passe PDF n’a pas été chargé.',

  // io/doc-changes.js
  'pdf.io.changes_replayed': 'Rejouer les modifications enregistrées',

  // io/edit-log.js
  'pdf.io.log_found_title': 'Modifications enregistrées trouvées',
  'pdf.io.log_found_body': 'Slop PDF a conservé {n} modifications de « {name} » sur cet appareil. Rejouez-les sur ce fichier, ou abandonnez-les. Enregistrer ou Exporter écrit de toute façon un nouveau PDF.',
  'pdf.io.log_found_body#one': 'Slop PDF a conservé {n} modification de « {name} » sur cet appareil. Rejouez-la sur ce fichier, ou abandonnez-la. Enregistrer ou Exporter écrit de toute façon un nouveau PDF.',
  'pdf.io.log_discard': 'Abandonner',
  'pdf.io.log_replay': 'Rejouer',
  'pdf.io.log_replayed': 'Rejouer les modifications enregistrées',

  // io/export.js
  'pdf.io.no_pages': 'Il n’y a aucune page à exporter.',
  'pdf.io.redact_pending': '{n} zones sont marquées pour biffure mais ne sont pas encore biffées. Ouvrez Biffer et choisissez « Appliquer les biffures », ou retirez les marques.',
  'pdf.io.redact_pending#one': '{n} zone est marquée pour biffure mais n’est pas encore biffée. Ouvrez Biffer et choisissez « Appliquer les biffures », ou retirez la marque.',
  'pdf.io.source_missing': 'Un fichier source est manquant.',
  'pdf.io.locked': '« {name} » utilise un chiffrement que Slop PDF ne peut pas retirer ({why}) : ses pages ne peuvent donc pas être exportées.',

  // io/ocg.js
  'pdf.io.layer': 'Calque',
  'pdf.io.layer_hide': 'Masquer le calque « {name} »',
  'pdf.io.layer_show': 'Afficher le calque « {name} »',
  'pdf.io.layer_delete': 'Supprimer le calque « {name} »',

  // io/sample.js
  'pdf.io.sample_busy_playful': 'Préparation d’un nouveau lot de gelée…',
  'pdf.io.sample_busy_plain': 'Création de l’exemple…',

  // io/session.js
  'pdf.io.restore': 'Restaurer',
  'pdf.io.close_all': 'Tout fermer',
});
