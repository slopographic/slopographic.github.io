/* Slop PDF, English: the find bar, the Replace dialog and the page grid (thumbnails, drag, keys, size). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  // find/bar.js
  'pdf.find.input': 'Find in document',
  'pdf.find.match_case': 'Match case',
  'pdf.find.whole_word': 'Whole word',
  'pdf.find.prev_tip': 'Previous (Shift+Enter)',
  'pdf.find.prev': 'Previous match',
  'pdf.find.next_tip': 'Next (Enter)',
  'pdf.find.next': 'Next match',
  'pdf.find.list_tip': 'Show the result list',
  'pdf.find.list': 'List',
  'pdf.find.replace_tip': 'Replace in document',
  'pdf.find.replace': 'Replace…',
  'pdf.find.close_tip': 'Close (Esc)',
  'pdf.find.close': 'Close find',
  'pdf.find.matches': 'Matches',
  'pdf.find.page_short': 'p. {page}',

  // find/search.js
  'pdf.find.searching': 'Searching…',
  'pdf.find.no_results': 'No results',
  'pdf.find.count': '{cur} of {total}',

  // find/replace-ui.js
  'pdf.find.rep_find': 'Find',
  'pdf.find.rep_with': 'Replace with',
  'pdf.find.rep_go': 'Replace checked',
  'pdf.find.rep_go_n': 'Replace checked ({n})',
  'pdf.find.rep_type': 'Type the text to find.',
  'pdf.find.rep_match': 'Replace match {n}',
  'pdf.find.rep_unplaced': 'Position cannot be located exactly: not replaced',
  'pdf.find.rep_status': '{matches} · {n} checked',
  'pdf.find.rep_matches': '{n} matches',
  'pdf.find.rep_matches#one': '{n} match',
  'pdf.find.rep_none': 'No matches.',
  'pdf.find.rep_done': 'Replaced {done} of {total}.',
  'pdf.find.rep_skipped': '{n} not replaced: the position could not be located exactly.',
  'pdf.find.rep_unticked': '{n} left unticked.',
  'pdf.find.rep_wide': '{n} wider than the original and may overlap nearby text.',
  'pdf.find.rep_unsupported': 'Some characters are not in the standard font and were written as “?”.',

  // find/replace.js
  'pdf.find.undo_replace': 'Replace “{text}”',

  // organize/grid.js
  'pdf.org.toggle_sel': 'Toggle selection',
  'pdf.org.rotate_left': 'Rotate left',
  'pdf.org.rotate_right': 'Rotate right',
  'pdf.org.open_page': 'Open page',
  'pdf.org.dup_page': 'Duplicate page',
  'pdf.org.move_up': 'Move up',
  'pdf.org.move_page_up': 'Move page up',
  'pdf.org.move_down': 'Move down',
  'pdf.org.move_page_down': 'Move page down',
  'pdf.org.extract_page': 'Extract this page',
  'pdf.org.delete_page': 'Delete page',
  'pdf.org.src_blank': 'blank',
  'pdf.org.src_file_page': '{file} · p{page}',
  'pdf.org.src_page': 'p{page}',
  'pdf.org.thumb_blank': 'Page {n}, blank',
  'pdf.org.thumb_from': 'Page {n}, from {file} page {page}',
  'pdf.org.thumb_rotated': '{label}, rotated {deg}°',
  'pdf.org.blank_page': 'Blank page',
  'pdf.org.thumb_title': '{file} — page {page}',
  'pdf.org.to_redact': '{n} to redact',
  'pdf.org.redacted': 'Redacted',

  // organize/drag.js
  'pdf.org.undo_move_page': 'Move page',
  'pdf.org.undo_move_pages': 'Move {n} pages',
  'pdf.org.moved_page': 'Moved page to position {pos}',
  'pdf.org.moved_pages': 'Moved {n} pages to position {pos}',

  // organize/keys.js
  'pdf.org.key_moved_page': 'Page moved to position {pos} of {total}',
  'pdf.org.key_moved_pages': '{n} pages moved to position {pos} of {total}',

  // organize/zoom.js
  'pdf.org.thumb_size': 'Thumbnail size',
  'pdf.org.thumb_presets': 'Thumbnail size presets',
  'pdf.org.thumb_size_n': 'Thumbnail size {size}',
  'pdf.org.thumb_size_tip': 'Thumbnail size (Ctrl + wheel or pinch on the pages)',
  'pdf.org.one_per_row': 'One page per row',
});
