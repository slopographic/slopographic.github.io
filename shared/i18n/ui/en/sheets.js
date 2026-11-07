/* Shared components, English: the spreadsheet reader (errors, the parts of a file that are not imported) and the sheet
 * table's column headers. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  'ui.sheets.xls_old': 'Old .xls files are not supported. Open the file in Excel or LibreOffice and save it as .xlsx, .ods or .csv.',
  'ui.sheets.ods_not_zip': 'This .ods file is not a valid spreadsheet (it is not a zip package).',
  'ui.sheets.xlsx_not_zip': 'This .xlsx file is not a valid workbook (it is not a zip package).',
  'ui.sheets.ods_no_content': 'Not an OpenDocument spreadsheet (no content.xml)',
  'ui.sheets.ods_not_sheet': 'This OpenDocument file is not a spreadsheet',
  'ui.sheets.no_sheets': 'This workbook has no worksheets',
  'ui.sheets.xlsx_no_workbook': 'Not an Excel workbook (no xl/workbook.xml)',
  'ui.sheets.xlsx_missing': 'Missing {part} in the workbook',
  'ui.sheets.part_pictures': 'pictures',
  'ui.sheets.part_charts': 'charts',
  'ui.sheets.part_chart_sheets': 'chart sheets',
  'ui.sheets.part_pivots': 'pivot tables (their values are kept)',
  'ui.sheets.part_comments': 'comments',
  'ui.sheets.part_macros': 'macros',
  'ui.sheets.part_cond': 'conditional formatting',
  'ui.sheets.part_validation': 'data validation',
  'ui.sheets.part_filters': 'filters',
  'ui.sheets.sort_col': 'Sort column {col}',
  'ui.sheets.filter_col': 'Filter column {col}',
  'ui.sheets.col_filtered': 'Column {col} is filtered',
});
