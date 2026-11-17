/* Shared components, Ukrainian: the spreadsheet reader (errors, the parts of a file that are not imported) and the sheet
 * table's column headers. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('uk', {
  'ui.sheets.xls_old': 'Старі файли .xls не підтримуються. Відкрийте файл в Excel або LibreOffice і збережіть його як .xlsx, .ods або .csv.',
  'ui.sheets.ods_not_zip': 'Це недійсна електронна таблиця .ods (це не пакет zip).',
  'ui.sheets.xlsx_not_zip': 'Це недійсна книга .xlsx (це не пакет zip).',
  'ui.sheets.ods_no_content': 'Це не електронна таблиця OpenDocument (немає content.xml)',
  'ui.sheets.ods_not_sheet': 'Цей файл OpenDocument не є електронною таблицею',
  'ui.sheets.no_sheets': 'Ця книга не має аркушів',
  'ui.sheets.xlsx_no_workbook': 'Це не книга Excel (немає xl/workbook.xml)',
  'ui.sheets.xlsx_missing': 'У книзі бракує {part}',
  'ui.sheets.part_pictures': 'зображення',
  'ui.sheets.part_charts': 'діаграми',
  'ui.sheets.part_chart_sheets': 'аркуші діаграм',
  'ui.sheets.part_pivots': 'зведені таблиці (їхні значення збережено)',
  'ui.sheets.part_comments': 'коментарі',
  'ui.sheets.part_macros': 'макроси',
  'ui.sheets.part_cond': 'умовне форматування',
  'ui.sheets.part_validation': 'перевірка даних',
  'ui.sheets.part_filters': 'фільтри',
  'ui.sheets.sort_col': 'Сортувати стовпець {col}',
  'ui.sheets.filter_col': 'Фільтрувати стовпець {col}',
  'ui.sheets.col_filtered': 'Стовпець {col} відфільтровано',
});
