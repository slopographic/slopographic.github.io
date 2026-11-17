/* Shared components, Arabic: the spreadsheet reader (errors, the parts of a file that are not imported) and the sheet
 * table's column headers. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('ar', {
  'ui.sheets.xls_old': 'ملفات .xls القديمة غير مدعومة. افتح الملف في Excel أو LibreOffice واحفظه بصيغة .xlsx أو .ods أو .csv.',
  'ui.sheets.ods_not_zip': 'ملف .ods هذا ليس جدول بيانات صالحًا (ليس حزمة zip).',
  'ui.sheets.xlsx_not_zip': 'ملف .xlsx هذا ليس مصنف بيانات صالحًا (ليس حزمة zip).',
  'ui.sheets.ods_no_content': 'ليس جدول بيانات OpenDocument (لا يوجد content.xml)',
  'ui.sheets.ods_not_sheet': 'ملف OpenDocument هذا ليس جدول بيانات',
  'ui.sheets.no_sheets': 'هذا المصنف لا يحتوي على أوراق عمل',
  'ui.sheets.xlsx_no_workbook': 'ليس مصنف Excel (لا يوجد xl/workbook.xml)',
  'ui.sheets.xlsx_missing': 'الجزء {part} مفقود من المصنف',
  'ui.sheets.part_pictures': 'الصور',
  'ui.sheets.part_charts': 'المخططات',
  'ui.sheets.part_chart_sheets': 'أوراق المخططات',
  'ui.sheets.part_pivots': 'الجداول المحورية (تُحفظ قيمها)',
  'ui.sheets.part_comments': 'التعليقات',
  'ui.sheets.part_macros': 'وحدات الماكرو',
  'ui.sheets.part_cond': 'التنسيق الشرطي',
  'ui.sheets.part_validation': 'التحقق من صحة البيانات',
  'ui.sheets.part_filters': 'عوامل التصفية',
  'ui.sheets.sort_col': 'فرز العمود {col}',
  'ui.sheets.filter_col': 'تصفية العمود {col}',
  'ui.sheets.col_filtered': 'العمود {col} مُصفّى',
});
