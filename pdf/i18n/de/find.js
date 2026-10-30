/* Slop PDF, German: the find bar, the Replace dialog and the page grid (thumbnails, drag, keys, size).
 * Rules: shared/i18n/APPS-HOWTO.md, shared/i18n/glossary-de.md. */
window.SlopI18n && window.SlopI18n.add('de', {
  // find/bar.js
  'pdf.find.input': 'Im Dokument suchen',
  'pdf.find.match_case': 'Groß-/Kleinschreibung',
  'pdf.find.whole_word': 'Ganzes Wort',
  'pdf.find.prev_tip': 'Zurück (Umschalt+Eingabe)',
  'pdf.find.prev': 'Vorheriger Treffer',
  'pdf.find.next_tip': 'Weiter (Eingabe)',
  'pdf.find.next': 'Nächster Treffer',
  'pdf.find.list_tip': 'Ergebnisliste anzeigen',
  'pdf.find.list': 'Liste',
  'pdf.find.replace_tip': 'Im Dokument ersetzen',
  'pdf.find.replace': 'Ersetzen…',
  'pdf.find.close_tip': 'Schließen (Esc)',
  'pdf.find.close': 'Suche schließen',
  'pdf.find.matches': 'Treffer',
  'pdf.find.page_short': 'S. {page}',

  // find/search.js
  'pdf.find.searching': 'Suche läuft…',
  'pdf.find.no_results': 'Keine Ergebnisse',
  'pdf.find.count': '{cur} von {total}',

  // find/replace-ui.js
  'pdf.find.rep_find': 'Suchen',
  'pdf.find.rep_with': 'Ersetzen durch',
  'pdf.find.rep_go': 'Markierte ersetzen',
  'pdf.find.rep_go_n': 'Markierte ersetzen ({n})',
  'pdf.find.rep_type': 'Den Suchtext eingeben.',
  'pdf.find.rep_match': 'Treffer {n} ersetzen',
  'pdf.find.rep_unplaced': 'Position nicht genau bestimmbar: nicht ersetzt',
  'pdf.find.rep_status': '{matches} · {n} markiert',
  'pdf.find.rep_matches': '{n} Treffer',
  'pdf.find.rep_matches#one': '{n} Treffer',
  'pdf.find.rep_none': 'Keine Treffer.',
  'pdf.find.rep_done': '{done} von {total} ersetzt.',
  'pdf.find.rep_skipped': '{n} nicht ersetzt: Die Position war nicht genau bestimmbar.',
  'pdf.find.rep_unticked': '{n} nicht markiert.',
  'pdf.find.rep_wide': '{n} breiter als das Original; kann nahen Text überlappen.',
  'pdf.find.rep_unsupported': 'Einige Zeichen fehlen in der Standardschrift und wurden als „?“ geschrieben.',

  // find/replace.js
  'pdf.find.undo_replace': '„{text}“ ersetzen',

  // organize/grid.js
  'pdf.org.toggle_sel': 'Auswahl umschalten',
  'pdf.org.rotate_left': 'Nach links drehen',
  'pdf.org.rotate_right': 'Nach rechts drehen',
  'pdf.org.open_page': 'Seite öffnen',
  'pdf.org.dup_page': 'Seite duplizieren',
  'pdf.org.move_up': 'Nach oben',
  'pdf.org.move_page_up': 'Seite nach oben verschieben',
  'pdf.org.move_down': 'Nach unten',
  'pdf.org.move_page_down': 'Seite nach unten verschieben',
  'pdf.org.extract_page': 'Diese Seite extrahieren',
  'pdf.org.delete_page': 'Seite löschen',
  'pdf.org.src_blank': 'leer',
  'pdf.org.src_file_page': '{file} · S. {page}',
  'pdf.org.src_page': 'S. {page}',
  'pdf.org.thumb_blank': 'Seite {n}, leer',
  'pdf.org.thumb_from': 'Seite {n}, aus {file}, Seite {page}',
  'pdf.org.thumb_rotated': '{label}, um {deg}° gedreht',
  'pdf.org.blank_page': 'Leere Seite',
  'pdf.org.thumb_title': '{file} – Seite {page}',
  'pdf.org.to_redact': '{n} zu schwärzen',
  'pdf.org.redacted': 'Geschwärzt',

  // organize/drag.js
  'pdf.org.undo_move_page': 'Seite verschieben',
  'pdf.org.undo_move_pages': '{n} Seiten verschieben',
  'pdf.org.moved_page': 'Seite an Position {pos} verschoben',
  'pdf.org.moved_pages': '{n} Seiten an Position {pos} verschoben',

  // organize/keys.js
  'pdf.org.key_moved_page': 'Seite an Position {pos} von {total} verschoben',
  'pdf.org.key_moved_pages': '{n} Seiten an Position {pos} von {total} verschoben',

  // organize/zoom.js
  'pdf.org.thumb_size': 'Miniaturgröße',
  'pdf.org.thumb_presets': 'Vorgaben für die Miniaturgröße',
  'pdf.org.thumb_size_n': 'Miniaturgröße {size}',
  'pdf.org.thumb_size_tip': 'Miniaturgröße (Strg + Mausrad oder Zwei-Finger-Zoom auf den Seiten)',
  'pdf.org.one_per_row': 'Eine Seite pro Zeile',
});
