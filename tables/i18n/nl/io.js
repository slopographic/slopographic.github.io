/* Slop Tables, Dutch: opening, importing and saving files, the drop strip and the Config kind. Same keys as tables/i18n/en/io.js. Terms: shared/i18n/glossary-nl.md. */
window.SlopI18n && window.SlopI18n.add('nl', {
  'tables.file.open_failed': 'Dat bestand kon niet worden geopend',
  'tables.file.save_failed': 'Opslaan lukte niet',
  'tables.file.left_out': 'Geopend, met een paar dingen weggelaten',
  'tables.file.left_out_body': 'Opslaan bewaart het als Slop Tables-bestand in Slop Drive; Bestand ▸ Downloaden ▸ XLSX schrijft een nieuw Excel-bestand.',
  'tables.file.opened': '{name} geopend',
  'tables.file.opened_it': 'Het bestand is geopend',
  'tables.file.not_ours': 'Dit is geen Slop Tables-bestand.',
  'tables.file.kinds': 'Slop Tables opent .stab-, .xlsx-, .ods-, .csv- en .tsv-bestanden.',
  'tables.file.damaged': 'Dit Slop Tables-bestand is beschadigd ({what}).',
  'tables.file.newer': 'Dit Slop Tables-bestand komt van een nieuwere versie van Slop Tables.',

  'tables.import.unknown_fn': '{n} formules gebruiken een functie die Slop Tables nog niet heeft, dus ze tonen #NAAM?.',
  'tables.import.unknown_fn#one': '{n} formule gebruikt een functie die Slop Tables nog niet heeft, dus die toont #NAAM?.',
  'tables.import.skipped': 'Niet geïmporteerd: {list}.',
  'tables.import.chart_kind': '{n} grafieken van het type {kind} zijn niet geïmporteerd: Slop Tables tekent kolom-, staaf-, lijn- en cirkelgrafieken.',
  'tables.import.chart_kind#one': '{n} grafiek van het type {kind} is niet geïmporteerd: Slop Tables tekent kolom-, staaf-, lijn- en cirkelgrafieken.',
  'tables.import.chart_shape': '{n} grafieken zijn niet geïmporteerd: hun reeksen zijn geen blok cellen.',
  'tables.import.chart_shape#one': '{n} grafiek is niet geïmporteerd: de reeksen ervan zijn geen blok cellen.',

  'tables.drop.label': 'Zet een spreadsheet neer om hem te openen',
  'tables.drop.noun': 'een spreadsheet',

  'tables.config.label': 'Werkmap',
  'tables.config.desc': 'Bladen en hun celinhoud; een formule wordt geschreven als tekst die begint met =',
  'tables.config.kept': 'de geopende werkmap is bewaard',
});
