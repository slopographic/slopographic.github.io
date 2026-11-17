/* Shared components, Swedish: the spreadsheet reader (errors, the parts of a file that are not imported) and the sheet
 * table's column headers. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('sv', {
  'ui.sheets.xls_old': 'Gamla .xls-filer stöds inte. Öppna filen i Excel eller LibreOffice och spara den som .xlsx, .ods eller .csv.',
  'ui.sheets.ods_not_zip': 'Den här .ods-filen är inget giltigt kalkylark (den är inget zip-paket).',
  'ui.sheets.xlsx_not_zip': 'Den här .xlsx-filen är ingen giltig arbetsbok (den är inget zip-paket).',
  'ui.sheets.ods_no_content': 'Inget OpenDocument-kalkylark (content.xml saknas)',
  'ui.sheets.ods_not_sheet': 'Den här OpenDocument-filen är inget kalkylark',
  'ui.sheets.no_sheets': 'Arbetsboken har inga kalkylblad',
  'ui.sheets.xlsx_no_workbook': 'Ingen Excel-arbetsbok (xl/workbook.xml saknas)',
  'ui.sheets.xlsx_missing': '{part} saknas i arbetsboken',
  'ui.sheets.part_pictures': 'bilder',
  'ui.sheets.part_charts': 'diagram',
  'ui.sheets.part_chart_sheets': 'diagramblad',
  'ui.sheets.part_pivots': 'pivottabeller (värdena behålls)',
  'ui.sheets.part_comments': 'kommentarer',
  'ui.sheets.part_macros': 'makron',
  'ui.sheets.part_cond': 'villkorsstyrd formatering',
  'ui.sheets.part_validation': 'dataverifiering',
  'ui.sheets.part_filters': 'filter',
  'ui.sheets.sort_col': 'Sortera kolumn {col}',
  'ui.sheets.filter_col': 'Filtrera kolumn {col}',
  'ui.sheets.col_filtered': 'Kolumn {col} är filtrerad',
});
