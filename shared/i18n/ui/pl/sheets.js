/* Shared components, Polish: the spreadsheet reader (errors, the parts of a file that are not imported) and the sheet
 * table's column headers. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('pl', {
  'ui.sheets.xls_old': 'Stare pliki .xls nie są obsługiwane. Otwórz plik w Excelu lub LibreOffice i zapisz go jako .xlsx, .ods lub .csv.',
  'ui.sheets.ods_not_zip': 'Ten plik .ods nie jest prawidłowym arkuszem (nie jest pakietem zip).',
  'ui.sheets.xlsx_not_zip': 'Ten plik .xlsx nie jest prawidłowym skoroszytem (nie jest pakietem zip).',
  'ui.sheets.ods_no_content': 'To nie jest arkusz OpenDocument (brak content.xml)',
  'ui.sheets.ods_not_sheet': 'Ten plik OpenDocument nie jest arkuszem',
  'ui.sheets.no_sheets': 'Ten skoroszyt nie ma arkuszy',
  'ui.sheets.xlsx_no_workbook': 'To nie jest skoroszyt Excela (brak xl/workbook.xml)',
  'ui.sheets.xlsx_missing': 'Brak {part} w skoroszycie',
  'ui.sheets.part_pictures': 'obrazów',
  'ui.sheets.part_charts': 'wykresów',
  'ui.sheets.part_chart_sheets': 'arkuszy wykresów',
  'ui.sheets.part_pivots': 'tabel przestawnych (ich wartości są zachowane)',
  'ui.sheets.part_comments': 'komentarzy',
  'ui.sheets.part_macros': 'makr',
  'ui.sheets.part_cond': 'formatowania warunkowego',
  'ui.sheets.part_validation': 'walidacji danych',
  'ui.sheets.part_filters': 'filtrów',
  'ui.sheets.sort_col': 'Sortuj kolumnę {col}',
  'ui.sheets.filter_col': 'Filtruj kolumnę {col}',
  'ui.sheets.col_filtered': 'Kolumna {col} jest filtrowana',
});
