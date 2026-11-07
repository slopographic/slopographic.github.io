/* Slop PDF, Japanese: opening, saving and extracting (errors, skipped items, change labels) and the Layers panel names (pdf/js/io, pdf/js/core). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('ja', {
  // core/fonts-custom.js
  'pdf.core.font_missing': '{family} はインストールされていません。',

  // core/layers.js
  'pdf.core.layer_numbered': '{name} {n}',
  'pdf.core.layer_step_n': 'ステップ {n}',
  'pdf.core.layer_text': 'テキスト',
  'pdf.core.layer_callout': '吹き出し',
  'pdf.core.layer_comment': 'コメント',
  'pdf.core.layer_rect': '四角形',
  'pdf.core.layer_ellipse': '楕円',
  'pdf.core.layer_line': '線',
  'pdf.core.layer_arrow': '矢印',
  'pdf.core.layer_drawing': '描画',
  'pdf.core.layer_highlighter': '蛍光ペン',
  'pdf.core.layer_highlight': 'ハイライト',
  'pdf.core.layer_texthl': 'テキスト ハイライト',
  'pdf.core.layer_whiteout': '白塗り',
  'pdf.core.layer_image': '画像',
  'pdf.core.layer_redaction': '墨消し',
  'pdf.core.layer_step': 'ステップ',
  'pdf.core.layer_paragraph': '段落',
  'pdf.core.layer_signature': '署名',
  'pdf.core.layer_item': '項目',

  // core/pdf-parts.js
  'pdf.io.meta_pages': '{list} ページ',
  'pdf.io.meta_page': '{n} ページ',
  'pdf.io.font_stream_raw': 'このフォント ストリームは、デコードされない方法で格納されています',
  'pdf.io.not_embedded': '埋め込みなし',
  'pdf.io.font_composite': '複合（{type}）',
  'pdf.io.not_decoded': 'デコードされていません',
  'pdf.io.image_undecodable': '画像データを展開できませんでした',
  'pdf.io.image_no_size': '画像にサイズがありません',
  'pdf.io.image_short': '画像データがサイズより短くなっています',
  'pdf.io.att_raw': 'この添付ファイルは、デコードされない方法で格納されています',

  // core/pdfjs.js
  'pdf.core.needs_password': 'この PDF にはパスワードが必要です。',
  'pdf.core.err_invalid': '「{name}」は有効な PDF ではないか、修復できないほど破損しています。',
  'pdf.core.err_empty': '「{name}」は空です。',
  'pdf.core.err_password': '「{name}」には正しいパスワードが必要です。',
  'pdf.core.err_open': '「{name}」を開けませんでした：{msg}',
  'pdf.core.unsupported_encryption': '対応していない暗号化',
  'pdf.core.writer_missing': 'PDF の書き込み機能を読み込めませんでした。',

  // io/assets-model.js
  'pdf.io.unknown': '不明',
  'pdf.io.none': 'なし',
  'pdf.io.skip_stencil': 'ステンシル マスク（1 ビット）はデコードされません',
  'pdf.io.skip_jpx': 'JPEG 2000 画像はデコードされません',
  'pdf.io.skip_jbig2': 'JBIG2 画像はデコードされません',
  'pdf.io.skip_ccitt': 'CCITT FAX 画像はデコードされません',
  'pdf.io.skip_filter': 'フィルター {filter} はデコードされません',
  'pdf.io.skip_raw': 'この種類の非圧縮画像はデコードされません',
  'pdf.io.skip_bpc': '{bpc} ビットのサンプルはデコードされません',
  'pdf.io.skip_palette': '{cs} のパレットはデコードされません',
  'pdf.io.skip_colour': '色空間 {cs} はデコードされません',
  'pdf.io.mask_excluded': 'マスクは含まれません',
  'pdf.io.font_not_embedded': '埋め込みなし：PDF はフォントを参照しているだけなので、保存するファイルがありません',
  'pdf.io.font_subset': 'サブセット：不完全な場合があります',
  'pdf.io.att_on_page': '{n} ページに添付',
  'pdf.io.att_document': 'ドキュメントに添付',
  'pdf.io.att_einvoice': '電子請求書（ZUGFeRD / Factur-X）',
  'pdf.io.att_rel': '関係：{rel}',

  // io/assets-save.js
  'pdf.io.assets_name': 'PDF アセット',
  'pdf.io.no_font_file': '埋め込まれていないため、フォントファイルはありません',

  // io/decrypt.js
  'pdf.io.crypto_load_failed': 'PDF パスワード処理のコードを読み込めませんでした。',
  'pdf.io.crypto_not_loaded': 'PDF パスワード処理のコードが読み込まれていません。',

  // io/doc-changes.js
  'pdf.io.changes_replayed': '保存した変更の再適用',

  // io/edit-log.js
  'pdf.io.log_found_title': '保存された編集が見つかりました',
  'pdf.io.log_found_body': 'Slop PDF は「{name}」に対する {n} 件の編集をこのデバイスに保持しています。このファイルに再適用するか、破棄してください。どちらの場合も、保存または書き出すと新しい PDF が書き出されます。',
  'pdf.io.log_discard': '破棄',
  'pdf.io.log_replay': '再適用',
  'pdf.io.log_replayed': '保存した編集の再適用',

  // io/export.js
  'pdf.io.no_pages': '書き出すページがありません。',
  'pdf.io.redact_pending': '{n} か所が墨消し対象としてマークされていますが、まだ墨消しされていません。[墨消し] を開いて「墨消しを適用」を選ぶか、マークを削除してください。',
  'pdf.io.source_missing': '元のファイルが見つかりません。',
  'pdf.io.locked': '「{name}」は Slop PDF で解除できない暗号化を使用しているため（{why}）、ページを書き出せません。',

  // io/ocg.js
  'pdf.io.layer': 'レイヤー',
  'pdf.io.layer_hide': 'レイヤー「{name}」を非表示',
  'pdf.io.layer_show': 'レイヤー「{name}」を表示',
  'pdf.io.layer_delete': 'レイヤー「{name}」の削除',

  // io/sample.js
  'pdf.io.sample_busy_playful': 'できたてのスライムを練っています…',
  'pdf.io.sample_busy_plain': 'サンプルを作成しています…',

  // io/session.js
  'pdf.io.restore': '復元',
  'pdf.io.close_all': 'すべて閉じる',
});
