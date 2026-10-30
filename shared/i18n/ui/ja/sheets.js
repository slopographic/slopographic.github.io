/* Shared components, Japanese: the spreadsheet reader (errors, the parts of a file that are not imported) and the sheet
 * table's column headers. Terms: shared/i18n/glossary-ja.md. */
window.SlopI18n && window.SlopI18n.add('ja', {
  'ui.sheets.xls_old': '古い .xls ファイルには対応していません。Excel または LibreOffice でファイルを開き、.xlsx、.ods、または .csv として保存してください。',
  'ui.sheets.ods_not_zip': 'この .ods ファイルは有効なスプレッドシートではありません（ZIP パッケージではありません）。',
  'ui.sheets.xlsx_not_zip': 'この .xlsx ファイルは有効なブックではありません（ZIP パッケージではありません）。',
  'ui.sheets.ods_no_content': 'OpenDocument のスプレッドシートではありません（content.xml がありません）',
  'ui.sheets.ods_not_sheet': 'この OpenDocument ファイルはスプレッドシートではありません',
  'ui.sheets.no_sheets': 'このブックにはワークシートがありません',
  'ui.sheets.xlsx_no_workbook': 'Excel のブックではありません（xl/workbook.xml がありません）',
  'ui.sheets.xlsx_missing': 'ブック内に {part} がありません',
  'ui.sheets.part_pictures': '画像',
  'ui.sheets.part_charts': 'グラフ',
  'ui.sheets.part_chart_sheets': 'グラフシート',
  'ui.sheets.part_pivots': 'ピボットテーブル（値は保持されます）',
  'ui.sheets.part_comments': 'コメント',
  'ui.sheets.part_macros': 'マクロ',
  'ui.sheets.part_cond': '条件付き書式',
  'ui.sheets.part_validation': 'データの入力規則',
  'ui.sheets.part_filters': 'フィルター',
  'ui.sheets.sort_col': '{col} 列を並べ替え',
  'ui.sheets.filter_col': '{col} 列をフィルター',
  'ui.sheets.col_filtered': '{col} 列はフィルターされています',
});
