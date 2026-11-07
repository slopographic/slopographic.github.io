/* Slop Tables, English: opening, importing and saving files, the drop strip and the Config kind.
 * Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  'tables.file.open_failed': 'Could not open that file',
  'tables.file.save_failed': 'Could not save',
  'tables.file.left_out': 'Opened with a few things left out',
  'tables.file.left_out_body': 'Save keeps it as a Slop Tables file in Slop Drive; File ▸ Download ▸ XLSX writes a new Excel file.',
  'tables.file.opened': 'Opened {name}',
  'tables.file.opened_it': 'Opened the file',
  'tables.file.not_ours': 'This is not a Slop Tables file.',
  'tables.file.kinds': 'Slop Tables opens .stab, .xlsx, .ods, .csv and .tsv files.',
  'tables.file.damaged': 'This Slop Tables file is damaged ({what}).',
  'tables.file.newer': 'This Slop Tables file is from a newer version of Slop Tables.',

  'tables.import.unknown_fn': '{n} formulas use a function Slop Tables does not have yet, so they show #NAME?.',
  'tables.import.unknown_fn#one': '{n} formula uses a function Slop Tables does not have yet, so it shows #NAME?.',
  'tables.import.skipped': 'Not imported: {list}.',
  'tables.import.chart_kind': '{n} {kind} charts were not imported: Slop Tables draws column, bar, line and pie charts.',
  'tables.import.chart_kind#one': '{n} {kind} chart was not imported: Slop Tables draws column, bar, line and pie charts.',
  'tables.import.chart_shape': '{n} charts were not imported: their series are not one block of cells.',
  'tables.import.chart_shape#one': '{n} chart was not imported: its series are not one block of cells.',

  'tables.drop.label': 'Drop a spreadsheet to open it',
  'tables.drop.noun': 'a spreadsheet',

  'tables.config.label': 'Workbook',
  'tables.config.desc': 'Sheets and their cell contents; a formula is written as text starting with =',
  'tables.config.kept': 'the open workbook was kept',
});
