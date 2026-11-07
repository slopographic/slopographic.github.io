/* Slop PDF, français : la recherche dans le document, le remplacement et la grille d’organisation des pages. Règles : shared/i18n/APPS-HOWTO.md, shared/i18n/glossary-fr.md. */
window.SlopI18n && window.SlopI18n.add('fr', {
  // find/bar.js
  'pdf.find.input': 'Rechercher dans le document',
  'pdf.find.match_case': 'Respecter la casse',
  'pdf.find.whole_word': 'Mot entier',
  'pdf.find.prev_tip': 'Précédent (Maj+Entrée)',
  'pdf.find.prev': 'Résultat précédent',
  'pdf.find.next_tip': 'Suivant (Entrée)',
  'pdf.find.next': 'Résultat suivant',
  'pdf.find.list_tip': 'Afficher la liste des résultats',
  'pdf.find.list': 'Liste',
  'pdf.find.replace_tip': 'Remplacer dans le document',
  'pdf.find.replace': 'Remplacer…',
  'pdf.find.close_tip': 'Fermer (Échap)',
  'pdf.find.close': 'Fermer la recherche',
  'pdf.find.matches': 'Résultats',
  'pdf.find.page_short': 'p. {page}',

  // find/search.js
  'pdf.find.searching': 'Recherche…',
  'pdf.find.no_results': 'Aucun résultat',
  'pdf.find.count': '{cur} sur {total}',

  // find/replace-ui.js
  'pdf.find.rep_find': 'Rechercher',
  'pdf.find.rep_with': 'Remplacer par',
  'pdf.find.rep_go': 'Remplacer les cochés',
  'pdf.find.rep_go_n': 'Remplacer les cochés ({n})',
  'pdf.find.rep_type': 'Saisissez le texte à rechercher.',
  'pdf.find.rep_match': 'Remplacer le résultat {n}',
  'pdf.find.rep_unplaced': 'La position ne peut pas être localisée exactement : non remplacé',
  'pdf.find.rep_status': '{matches} · {n} cochés',
  'pdf.find.rep_matches': '{n} résultats',
  'pdf.find.rep_matches#one': '{n} résultat',
  'pdf.find.rep_none': 'Aucun résultat.',
  'pdf.find.rep_done': '{done} remplacements sur {total}.',
  'pdf.find.rep_skipped': '{n} non remplacés : la position n’a pas pu être localisée exactement.',
  'pdf.find.rep_unticked': '{n} laissés non cochés.',
  'pdf.find.rep_wide': '{n} plus large que l’original et pourrait chevaucher le texte voisin.',
  'pdf.find.rep_unsupported': 'Certains caractères ne figurent pas dans la police standard et ont été écrits « ? ».',

  // find/replace.js
  'pdf.find.undo_replace': 'Remplacer « {text} »',

  // organize/grid.js
  'pdf.org.toggle_sel': 'Basculer la sélection',
  'pdf.org.rotate_left': 'Pivoter à gauche',
  'pdf.org.rotate_right': 'Pivoter à droite',
  'pdf.org.open_page': 'Ouvrir la page',
  'pdf.org.dup_page': 'Dupliquer la page',
  'pdf.org.move_up': 'Monter',
  'pdf.org.move_page_up': 'Monter la page',
  'pdf.org.move_down': 'Descendre',
  'pdf.org.move_page_down': 'Descendre la page',
  'pdf.org.extract_page': 'Extraire cette page',
  'pdf.org.delete_page': 'Supprimer la page',
  'pdf.org.src_blank': 'vierge',
  'pdf.org.src_file_page': '{file} · p{page}',
  'pdf.org.src_page': 'p{page}',
  'pdf.org.thumb_blank': 'Page {n}, vierge',
  'pdf.org.thumb_from': 'Page {n}, de {file} page {page}',
  'pdf.org.thumb_rotated': '{label}, pivotée de {deg}°',
  'pdf.org.blank_page': 'Page vierge',
  'pdf.org.thumb_title': '{file} — page {page}',
  'pdf.org.to_redact': '{n} à biffer',
  'pdf.org.redacted': 'Biffée',

  // organize/drag.js
  'pdf.org.undo_move_page': 'Déplacer la page',
  'pdf.org.undo_move_pages': 'Déplacer {n} pages',
  'pdf.org.moved_page': 'Page déplacée à la position {pos}',
  'pdf.org.moved_pages': '{n} pages déplacées à la position {pos}',

  // organize/keys.js
  'pdf.org.key_moved_page': 'Page déplacée à la position {pos} sur {total}',
  'pdf.org.key_moved_pages': '{n} pages déplacées à la position {pos} sur {total}',

  // organize/zoom.js
  'pdf.org.thumb_size': 'Taille des miniatures',
  'pdf.org.thumb_presets': 'Tailles de miniatures prédéfinies',
  'pdf.org.thumb_size_n': 'Taille des miniatures {size}',
  'pdf.org.thumb_size_tip': 'Taille des miniatures (Ctrl + molette ou pincement sur les pages)',
  'pdf.org.one_per_row': 'Une page par ligne',
});
