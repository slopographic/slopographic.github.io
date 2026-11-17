/* Slop Tables, Ukrainian: opening, importing and saving files, the drop strip and the Config kind. Same keys as
 * tables/i18n/en/io.js. Rules: shared/i18n/APPS-HOWTO.md, words: shared/i18n/glossary-uk.md. */
window.SlopI18n && window.SlopI18n.add('uk', {
  'tables.file.open_failed': 'Не вдалося відкрити цей файл',
  'tables.file.save_failed': 'Не вдалося зберегти',
  'tables.file.left_out': 'Відкрито з деякими пропущеними елементами',
  'tables.file.left_out_body': 'Збереження зберігає її як файл Slop Tables у Slop Drive; «Файл ▸ Завантажити ▸ XLSX» записує новий файл Excel.',
  'tables.file.opened': 'Відкрито {name}',
  'tables.file.opened_it': 'Файл відкрито',
  'tables.file.not_ours': 'Це не файл Slop Tables.',
  'tables.file.kinds': 'Slop Tables відкриває файли .stab, .xlsx, .ods, .csv і .tsv.',
  'tables.file.damaged': 'Цей файл Slop Tables пошкоджено ({what}).',
  'tables.file.newer': 'Цей файл Slop Tables створено в новішій версії Slop Tables.',

  'tables.import.unknown_fn': '{n} формул використовують функцію, якої Slop Tables ще немає, тож вони показують #NAME?.',
  'tables.import.unknown_fn#one': '{n} формула використовує функцію, якої Slop Tables ще немає, тож вона показує #NAME?.',
  'tables.import.unknown_fn#few': '{n} формули використовують функцію, якої Slop Tables ще немає, тож вони показують #NAME?.',
  'tables.import.unknown_fn#many': '{n} формул використовують функцію, якої Slop Tables ще немає, тож вони показують #NAME?.',
  'tables.import.skipped': 'Не імпортовано: {list}.',
  'tables.import.chart_kind': '{n} діаграм типу {kind} не імпортовано: Slop Tables малює стовпчасті, стрижневі, лінійні та кругові діаграми.',
  'tables.import.chart_kind#one': '{n} діаграму типу {kind} не імпортовано: Slop Tables малює стовпчасті, стрижневі, лінійні та кругові діаграми.',
  'tables.import.chart_kind#few': '{n} діаграми типу {kind} не імпортовано: Slop Tables малює стовпчасті, стрижневі, лінійні та кругові діаграми.',
  'tables.import.chart_kind#many': '{n} діаграм типу {kind} не імпортовано: Slop Tables малює стовпчасті, стрижневі, лінійні та кругові діаграми.',
  'tables.import.chart_shape': '{n} діаграм не імпортовано: їхні ряди не є одним блоком клітинок.',
  'tables.import.chart_shape#one': '{n} діаграму не імпортовано: її ряд не є одним блоком клітинок.',
  'tables.import.chart_shape#few': '{n} діаграми не імпортовано: їхні ряди не є одним блоком клітинок.',
  'tables.import.chart_shape#many': '{n} діаграм не імпортовано: їхні ряди не є одним блоком клітинок.',

  'tables.drop.label': 'Перетягніть таблицю, щоб відкрити її',
  'tables.drop.noun': 'таблицю',

  'tables.config.label': 'Книга',
  'tables.config.desc': 'Аркуші та вміст їхніх клітинок; формула записується як текст, що починається з =',
  'tables.config.kept': 'відкриту книгу збережено',
});
