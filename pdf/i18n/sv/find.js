/* Slop PDF, Swedish: the find bar, the Replace dialog and the page grid (thumbnails, drag, keys, size).
 * Same keys as pdf/i18n/en/find.js. Terms: shared/i18n/glossary-sv.md. */
window.SlopI18n && window.SlopI18n.add('sv', {
  // find/bar.js
  'pdf.find.input': 'Sök i dokumentet',
  'pdf.find.match_case': 'Matcha gemener/versaler',
  'pdf.find.whole_word': 'Hela ord',
  'pdf.find.prev_tip': 'Föregående (Shift+Enter)',
  'pdf.find.prev': 'Föregående träff',
  'pdf.find.next_tip': 'Nästa (Enter)',
  'pdf.find.next': 'Nästa träff',
  'pdf.find.list_tip': 'Visa resultatlistan',
  'pdf.find.list': 'Lista',
  'pdf.find.replace_tip': 'Ersätt i dokumentet',
  'pdf.find.replace': 'Ersätt…',
  'pdf.find.close_tip': 'Stäng (Esc)',
  'pdf.find.close': 'Stäng sökningen',
  'pdf.find.matches': 'Träffar',
  'pdf.find.page_short': 's. {page}',

  // find/search.js
  'pdf.find.searching': 'Söker…',
  'pdf.find.no_results': 'Inga resultat',
  'pdf.find.count': '{cur} av {total}',

  // find/replace-ui.js
  'pdf.find.rep_find': 'Sök',
  'pdf.find.rep_with': 'Ersätt med',
  'pdf.find.rep_go': 'Ersätt markerade',
  'pdf.find.rep_go_n': 'Ersätt markerade ({n})',
  'pdf.find.rep_type': 'Skriv texten du vill söka efter.',
  'pdf.find.rep_match': 'Ersätt träff {n}',
  'pdf.find.rep_unplaced': 'Positionen kan inte fastställas exakt: ersätts inte',
  'pdf.find.rep_status': '{matches} · {n} markerade',
  'pdf.find.rep_matches': '{n} träffar',
  'pdf.find.rep_matches#one': '{n} träff',
  'pdf.find.rep_none': 'Inga träffar.',
  'pdf.find.rep_done': 'Ersatte {done} av {total}.',
  'pdf.find.rep_skipped': '{n} ersattes inte: positionen kunde inte fastställas exakt.',
  'pdf.find.rep_unticked': '{n} lämnades omarkerade.',
  'pdf.find.rep_wide': '{n} är bredare än originalet och kan överlappa närliggande text.',
  'pdf.find.rep_unsupported': 'Vissa tecken finns inte i standardteckensnittet och skrevs som ”?”.',

  // find/replace.js
  'pdf.find.undo_replace': 'Ersätt ”{text}”',

  // organize/grid.js
  'pdf.org.toggle_sel': 'Markera eller avmarkera',
  'pdf.org.rotate_left': 'Rotera åt vänster',
  'pdf.org.rotate_right': 'Rotera åt höger',
  'pdf.org.open_page': 'Öppna sida',
  'pdf.org.dup_page': 'Duplicera sida',
  'pdf.org.move_up': 'Flytta upp',
  'pdf.org.move_page_up': 'Flytta sidan uppåt',
  'pdf.org.move_down': 'Flytta ned',
  'pdf.org.move_page_down': 'Flytta sidan nedåt',
  'pdf.org.extract_page': 'Extrahera den här sidan',
  'pdf.org.delete_page': 'Ta bort sida',
  'pdf.org.src_blank': 'tom',
  'pdf.org.src_file_page': '{file} · s{page}',
  'pdf.org.src_page': 's{page}',
  'pdf.org.thumb_blank': 'Sida {n}, tom',
  'pdf.org.thumb_from': 'Sida {n}, från {file} sida {page}',
  'pdf.org.thumb_rotated': '{label}, roterad {deg}°',
  'pdf.org.blank_page': 'Tom sida',
  'pdf.org.thumb_title': '{file} – sida {page}',
  'pdf.org.to_redact': '{n} att maskera',
  'pdf.org.redacted': 'Maskerad',

  // organize/drag.js
  'pdf.org.undo_move_page': 'Flytta sida',
  'pdf.org.undo_move_pages': 'Flytta {n} sidor',
  'pdf.org.moved_page': 'Flyttade sidan till position {pos}',
  'pdf.org.moved_pages': 'Flyttade {n} sidor till position {pos}',

  // organize/keys.js
  'pdf.org.key_moved_page': 'Sidan flyttades till position {pos} av {total}',
  'pdf.org.key_moved_pages': '{n} sidor flyttades till position {pos} av {total}',

  // organize/zoom.js
  'pdf.org.thumb_size': 'Miniatyrstorlek',
  'pdf.org.thumb_presets': 'Förinställda miniatyrstorlekar',
  'pdf.org.thumb_size_n': 'Miniatyrstorlek {size}',
  'pdf.org.thumb_size_tip': 'Miniatyrstorlek (Ctrl + mushjulet eller nyp på sidorna)',
  'pdf.org.one_per_row': 'En sida per rad',
});
