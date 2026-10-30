/* Slop PDF, English: opening, saving and extracting (errors, skipped items, change labels) and the Layers panel names (pdf/js/io, pdf/js/core). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  // core/fonts-custom.js
  'pdf.core.font_missing': '{family} is not installed.',

  // core/layers.js
  'pdf.core.layer_numbered': '{name} {n}',
  'pdf.core.layer_step_n': 'Step {n}',
  'pdf.core.layer_text': 'Text',
  'pdf.core.layer_callout': 'Callout',
  'pdf.core.layer_comment': 'Comment',
  'pdf.core.layer_rect': 'Rectangle',
  'pdf.core.layer_ellipse': 'Ellipse',
  'pdf.core.layer_line': 'Line',
  'pdf.core.layer_arrow': 'Arrow',
  'pdf.core.layer_drawing': 'Drawing',
  'pdf.core.layer_highlighter': 'Highlighter',
  'pdf.core.layer_highlight': 'Highlight',
  'pdf.core.layer_texthl': 'Text highlight',
  'pdf.core.layer_whiteout': 'Whiteout',
  'pdf.core.layer_image': 'Image',
  'pdf.core.layer_redaction': 'Redaction',
  'pdf.core.layer_step': 'Step',
  'pdf.core.layer_paragraph': 'Paragraph',
  'pdf.core.layer_signature': 'Signature',
  'pdf.core.layer_item': 'Item',

  // core/pdf-parts.js
  'pdf.io.meta_pages': 'pages {list}',
  'pdf.io.meta_page': 'page {n}',
  'pdf.io.font_stream_raw': 'This font stream is stored in a way that is not decoded',
  'pdf.io.not_embedded': 'not embedded',
  'pdf.io.font_composite': 'Composite ({type})',
  'pdf.io.not_decoded': 'Not decoded',
  'pdf.io.image_undecodable': 'The image data could not be decompressed',
  'pdf.io.image_no_size': 'The image has no size',
  'pdf.io.image_short': 'The image data is shorter than its size',
  'pdf.io.att_raw': 'This attachment is stored in a way that is not decoded',

  // core/pdfjs.js
  'pdf.core.needs_password': 'This PDF needs a password.',
  'pdf.core.err_invalid': '“{name}” is not a valid PDF, or it is damaged beyond repair.',
  'pdf.core.err_empty': '“{name}” is empty.',
  'pdf.core.err_password': '“{name}” needs the correct password.',
  'pdf.core.err_open': '“{name}” could not be opened: {msg}',
  'pdf.core.unsupported_encryption': 'Unsupported encryption',
  'pdf.core.writer_missing': 'The PDF writer did not load.',

  // io/assets-model.js
  'pdf.io.unknown': 'unknown',
  'pdf.io.none': 'none',
  'pdf.io.skip_stencil': 'Stencil mask (1 bit) is not decoded',
  'pdf.io.skip_jpx': 'JPEG 2000 images are not decoded',
  'pdf.io.skip_jbig2': 'JBIG2 images are not decoded',
  'pdf.io.skip_ccitt': 'CCITT fax images are not decoded',
  'pdf.io.skip_filter': 'Filter {filter} is not decoded',
  'pdf.io.skip_raw': 'Uncompressed images of this kind are not decoded',
  'pdf.io.skip_bpc': '{bpc}-bit samples are not decoded',
  'pdf.io.skip_palette': 'Palette in {cs} is not decoded',
  'pdf.io.skip_colour': 'Colour space {cs} is not decoded',
  'pdf.io.mask_excluded': 'mask not included',
  'pdf.io.font_not_embedded': 'Not embedded: the PDF refers to the font, so there is no file to save',
  'pdf.io.font_subset': 'subset: may be incomplete',
  'pdf.io.att_on_page': 'attached on page {n}',
  'pdf.io.att_document': 'attached to the document',
  'pdf.io.att_einvoice': 'e-invoice (ZUGFeRD / Factur-X)',
  'pdf.io.att_rel': 'relationship: {rel}',

  // io/assets-save.js
  'pdf.io.assets_name': 'PDF assets',
  'pdf.io.no_font_file': 'Not embedded, so there is no font file',

  // io/decrypt.js
  'pdf.io.crypto_load_failed': 'Could not load the PDF password code.',
  'pdf.io.crypto_not_loaded': 'The PDF password code did not load.',

  // io/doc-changes.js
  'pdf.io.changes_replayed': 'Replay saved changes',

  // io/edit-log.js
  'pdf.io.log_found_title': 'Saved edits found',
  'pdf.io.log_found_body': 'Slop PDF kept {n} edits to “{name}” on this device. Replay them on this file, or discard them. Save or Export writes a new PDF either way.',
  'pdf.io.log_found_body#one': 'Slop PDF kept {n} edit to “{name}” on this device. Replay them on this file, or discard them. Save or Export writes a new PDF either way.',
  'pdf.io.log_discard': 'Discard',
  'pdf.io.log_replay': 'Replay',
  'pdf.io.log_replayed': 'Replay saved edits',

  // io/export.js
  'pdf.io.no_pages': 'There are no pages to export.',
  'pdf.io.redact_pending': '{n} areas are marked for redaction but not redacted yet. Open Redact and choose “Apply redactions”, or remove the marks.',
  'pdf.io.redact_pending#one': '{n} area is marked for redaction but not redacted yet. Open Redact and choose “Apply redactions”, or remove the marks.',
  'pdf.io.source_missing': 'A source file is missing.',
  'pdf.io.locked': '“{name}” uses encryption Slop PDF cannot remove ({why}), so its pages cannot be exported.',

  // io/ocg.js
  'pdf.io.layer': 'Layer',
  'pdf.io.layer_hide': 'Hide layer “{name}”',
  'pdf.io.layer_show': 'Show layer “{name}”',
  'pdf.io.layer_delete': 'Delete layer “{name}”',

  // io/sample.js
  'pdf.io.sample_busy_playful': 'Mixing a fresh batch of goo…',
  'pdf.io.sample_busy_plain': 'Making the sample…',

  // io/session.js
  'pdf.io.restore': 'Restore',
  'pdf.io.close_all': 'Close all',
});
