/* German words of the spreadsheet reader (errors, the parts of a file that are not imported) and the sheet
 * table's column headers. Rules: shared/i18n/APPS-HOWTO.md, terms: shared/i18n/glossary-de.md. */
window.SlopI18n && window.SlopI18n.add('de', {
  'ui.sheets.xls_old': 'Alte .xls-Dateien werden nicht unterstützt. Die Datei in Excel oder LibreOffice öffnen und als .xlsx, .ods oder .csv speichern.',
  'ui.sheets.ods_not_zip': 'Diese .ods-Datei ist keine gültige Tabelle (sie ist kein ZIP-Paket).',
  'ui.sheets.xlsx_not_zip': 'Diese .xlsx-Datei ist keine gültige Arbeitsmappe (sie ist kein ZIP-Paket).',
  'ui.sheets.ods_no_content': 'Keine OpenDocument-Tabelle (keine content.xml)',
  'ui.sheets.ods_not_sheet': 'Diese OpenDocument-Datei ist keine Tabelle',
  'ui.sheets.no_sheets': 'Diese Arbeitsmappe hat keine Tabellenblätter',
  'ui.sheets.xlsx_no_workbook': 'Keine Excel-Arbeitsmappe (keine xl/workbook.xml)',
  'ui.sheets.xlsx_missing': '{part} fehlt in der Arbeitsmappe',
  'ui.sheets.part_pictures': 'Bilder',
  'ui.sheets.part_charts': 'Diagramme',
  'ui.sheets.part_chart_sheets': 'Diagrammblätter',
  'ui.sheets.part_pivots': 'Pivot-Tabellen (ihre Werte bleiben erhalten)',
  'ui.sheets.part_comments': 'Kommentare',
  'ui.sheets.part_macros': 'Makros',
  'ui.sheets.part_cond': 'bedingte Formatierung',
  'ui.sheets.part_validation': 'Datenüberprüfung',
  'ui.sheets.part_filters': 'Filter',
  'ui.sheets.sort_col': 'Spalte {col} sortieren',
  'ui.sheets.filter_col': 'Spalte {col} filtern',
  'ui.sheets.col_filtered': 'Spalte {col} ist gefiltert',
});
