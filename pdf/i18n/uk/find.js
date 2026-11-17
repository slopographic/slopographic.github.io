/* Slop PDF, українська: панель пошуку, діалог «Замінити» і сітка сторінок (ескізи, перетягування, клавіші, розмір).
 * Правила: shared/i18n/APPS-HOWTO.md, shared/i18n/glossary-uk.md. */
window.SlopI18n && window.SlopI18n.add('uk', {
  // find/bar.js
  'pdf.find.input': 'Пошук у документі',
  'pdf.find.match_case': 'Враховувати регістр',
  'pdf.find.whole_word': 'Цілі слова',
  'pdf.find.prev_tip': 'Попередній (Shift+Enter)',
  'pdf.find.prev': 'Попередній збіг',
  'pdf.find.next_tip': 'Наступний (Enter)',
  'pdf.find.next': 'Наступний збіг',
  'pdf.find.list_tip': 'Показати список результатів',
  'pdf.find.list': 'Список',
  'pdf.find.replace_tip': 'Замінити в документі',
  'pdf.find.replace': 'Замінити…',
  'pdf.find.close_tip': 'Закрити (Esc)',
  'pdf.find.close': 'Закрити пошук',
  'pdf.find.matches': 'Збіги',
  'pdf.find.page_short': 'с. {page}',

  // find/search.js
  'pdf.find.searching': 'Шукаємо…',
  'pdf.find.no_results': 'Результатів немає',
  'pdf.find.count': '{cur} з {total}',

  // find/replace-ui.js
  'pdf.find.rep_find': 'Знайти',
  'pdf.find.rep_with': 'Замінити на',
  'pdf.find.rep_go': 'Замінити позначені',
  'pdf.find.rep_go_n': 'Замінити позначені ({n})',
  'pdf.find.rep_type': 'Введіть текст для пошуку.',
  'pdf.find.rep_match': 'Замінити збіг {n}',
  'pdf.find.rep_unplaced': 'Місце не вдається точно визначити: не замінено',
  'pdf.find.rep_status': '{matches} · позначено: {n}',
  'pdf.find.rep_matches': 'Збігів: {n}',
  'pdf.find.rep_matches#one': 'Збіг: {n}',
  'pdf.find.rep_matches#few': 'Збіги: {n}',
  'pdf.find.rep_matches#many': 'Збігів: {n}',
  'pdf.find.rep_none': 'Збігів немає.',
  'pdf.find.rep_done': 'Замінено {done} із {total}.',
  'pdf.find.rep_skipped': 'Не замінено: {n}. Місце не вдалося точно визначити.',
  'pdf.find.rep_unticked': 'Без позначки лишилося: {n}.',
  'pdf.find.rep_wide': 'Ширші за оригінал: {n}. Можуть перекривати сусідній текст.',
  'pdf.find.rep_unsupported': 'Деяких символів немає в стандартному шрифті, тому їх записано як «?».',

  // find/replace.js
  'pdf.find.undo_replace': 'Замінити «{text}»',

  // organize/grid.js
  'pdf.org.toggle_sel': 'Перемкнути вибір',
  'pdf.org.rotate_left': 'Повернути ліворуч',
  'pdf.org.rotate_right': 'Повернути праворуч',
  'pdf.org.open_page': 'Відкрити сторінку',
  'pdf.org.dup_page': 'Дублювати сторінку',
  'pdf.org.move_up': 'Вгору',
  'pdf.org.move_page_up': 'Перемістити сторінку вгору',
  'pdf.org.move_down': 'Вниз',
  'pdf.org.move_page_down': 'Перемістити сторінку вниз',
  'pdf.org.extract_page': 'Видобути цю сторінку',
  'pdf.org.delete_page': 'Видалити сторінку',
  'pdf.org.src_blank': 'порожня',
  'pdf.org.src_file_page': '{file} · с{page}',
  'pdf.org.src_page': 'с{page}',
  'pdf.org.thumb_blank': 'Сторінка {n}, порожня',
  'pdf.org.thumb_from': 'Сторінка {n}, із файлу {file}, сторінка {page}',
  'pdf.org.thumb_rotated': '{label}, повернуто на {deg}°',
  'pdf.org.blank_page': 'Порожня сторінка',
  'pdf.org.thumb_title': '{file} — сторінка {page}',
  'pdf.org.to_redact': 'Для приховання: {n}',
  'pdf.org.redacted': 'Приховано',

  // organize/drag.js
  'pdf.org.undo_move_page': 'Перемістити сторінку',
  'pdf.org.undo_move_pages': 'Перемістити сторінок: {n}',
  'pdf.org.moved_page': 'Сторінку переміщено на місце {pos}',
  'pdf.org.moved_pages': 'Сторінок переміщено на місце {pos}: {n}',

  // organize/keys.js
  'pdf.org.key_moved_page': 'Сторінку переміщено на місце {pos} з {total}',
  'pdf.org.key_moved_pages': 'Переміщено сторінок: {n} на місце {pos} з {total}',

  // organize/zoom.js
  'pdf.org.thumb_size': 'Розмір ескізів',
  'pdf.org.thumb_presets': 'Готові розміри ескізів',
  'pdf.org.thumb_size_n': 'Розмір ескізів {size}',
  'pdf.org.thumb_size_tip': 'Розмір ескізів (Ctrl + коліщатко або щипок по сторінках)',
  'pdf.org.one_per_row': 'Одна сторінка в рядку',
});
