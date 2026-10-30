/* Slop PDF, Japanese: the find bar, the Replace dialog and the page grid (thumbnails, drag, keys, size). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('ja', {
  // find/bar.js
  'pdf.find.input': 'ドキュメント内を検索',
  'pdf.find.match_case': '大文字と小文字を区別',
  'pdf.find.whole_word': '単語単位',
  'pdf.find.prev_tip': '前へ（Shift+Enter）',
  'pdf.find.prev': '前の一致',
  'pdf.find.next_tip': '次へ（Enter）',
  'pdf.find.next': '次の一致',
  'pdf.find.list_tip': '結果の一覧を表示',
  'pdf.find.list': '一覧',
  'pdf.find.replace_tip': 'ドキュメント内で置換',
  'pdf.find.replace': '置換…',
  'pdf.find.close_tip': '閉じる（Esc）',
  'pdf.find.close': '検索を閉じる',
  'pdf.find.matches': '一致',
  'pdf.find.page_short': 'P.{page}',

  // find/search.js
  'pdf.find.searching': '検索しています…',
  'pdf.find.no_results': '結果なし',
  'pdf.find.count': '{cur} / {total}',

  // find/replace-ui.js
  'pdf.find.rep_find': '検索する文字列',
  'pdf.find.rep_with': '置換後の文字列',
  'pdf.find.rep_go': 'チェックした項目を置換',
  'pdf.find.rep_go_n': 'チェックした項目を置換（{n}）',
  'pdf.find.rep_type': '検索するテキストを入力してください。',
  'pdf.find.rep_match': '一致 {n} を置換',
  'pdf.find.rep_unplaced': '位置を正確に特定できないため、置換されません',
  'pdf.find.rep_status': '{matches} · {n} 件をチェック',
  'pdf.find.rep_matches': '{n} 件の一致',
  'pdf.find.rep_none': '一致するものはありません。',
  'pdf.find.rep_done': '{total} 件中 {done} 件を置換しました。',
  'pdf.find.rep_skipped': '{n} 件は位置を正確に特定できなかったため、置換されませんでした。',
  'pdf.find.rep_unticked': '{n} 件はチェックされていません。',
  'pdf.find.rep_wide': '{n} 件は元のテキストより幅が広く、近くのテキストと重なる可能性があります。',
  'pdf.find.rep_unsupported': '一部の文字は標準フォントにないため、「?」として書き込まれました。',

  // find/replace.js
  'pdf.find.undo_replace': '「{text}」の置換',

  // organize/grid.js
  'pdf.org.toggle_sel': '選択の切り替え',
  'pdf.org.rotate_left': '左に回転',
  'pdf.org.rotate_right': '右に回転',
  'pdf.org.open_page': 'ページを開く',
  'pdf.org.dup_page': 'ページを複製',
  'pdf.org.move_up': '上へ移動',
  'pdf.org.move_page_up': 'ページを上へ移動',
  'pdf.org.move_down': '下へ移動',
  'pdf.org.move_page_down': 'ページを下へ移動',
  'pdf.org.extract_page': 'このページを抽出',
  'pdf.org.delete_page': 'ページを削除',
  'pdf.org.src_blank': '空白',
  'pdf.org.src_file_page': '{file} · P.{page}',
  'pdf.org.src_page': 'P.{page}',
  'pdf.org.thumb_blank': '{n} ページ、空白',
  'pdf.org.thumb_from': '{n} ページ、{file} の {page} ページから',
  'pdf.org.thumb_rotated': '{label}、{deg}° 回転',
  'pdf.org.blank_page': '空白ページ',
  'pdf.org.thumb_title': '{file} — {page} ページ',
  'pdf.org.to_redact': '墨消し対象 {n} か所',
  'pdf.org.redacted': '墨消し済み',

  // organize/drag.js
  'pdf.org.undo_move_page': 'ページの移動',
  'pdf.org.undo_move_pages': '{n} ページの移動',
  'pdf.org.moved_page': 'ページを位置 {pos} に移動しました',
  'pdf.org.moved_pages': '{n} ページを位置 {pos} に移動しました',

  // organize/keys.js
  'pdf.org.key_moved_page': 'ページを位置 {pos} / {total} に移動しました',
  'pdf.org.key_moved_pages': '{n} ページを位置 {pos} / {total} に移動しました',

  // organize/zoom.js
  'pdf.org.thumb_size': 'サムネイルのサイズ',
  'pdf.org.thumb_presets': 'サムネイルのサイズのプリセット',
  'pdf.org.thumb_size_n': 'サムネイルのサイズ {size}',
  'pdf.org.thumb_size_tip': 'サムネイルのサイズ（ページ上で Ctrl + ホイール、またはピンチ）',
  'pdf.org.one_per_row': '1 行に 1 ページ',
});
