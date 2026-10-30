/* Slop Tables, Polish: opening, importing and saving files, the drop strip and the Config kind. Same keys as tables/i18n/en/io.js. Terms: shared/i18n/glossary-pl.md. */
window.SlopI18n && window.SlopI18n.add('pl', {
  'tables.file.open_failed': 'Nie udało się otworzyć tego pliku',
  'tables.file.save_failed': 'Nie udało się zapisać',
  'tables.file.left_out': 'Otwarto, ale kilka rzeczy zostało pominiętych',
  'tables.file.left_out_body': 'Zapis zachowuje go jako plik Slop Tables w Slop Drive; Plik ▸ Pobierz ▸ XLSX zapisuje nowy plik Excel.',
  'tables.file.opened': 'Otwarto {name}',
  'tables.file.opened_it': 'Otwarto plik',
  'tables.file.not_ours': 'To nie jest plik Slop Tables.',
  'tables.file.kinds': 'Slop Tables otwiera pliki .stab, .xlsx, .ods, .csv i .tsv.',
  'tables.file.damaged': 'Ten plik Slop Tables jest uszkodzony ({what}).',
  'tables.file.newer': 'Ten plik Slop Tables pochodzi z nowszej wersji Slop Tables.',

  'tables.import.unknown_fn': '{n} formuł używa funkcji, której Slop Tables jeszcze nie ma, więc pokazują #NAME?.',
  'tables.import.unknown_fn#one': '{n} formuła używa funkcji, której Slop Tables jeszcze nie ma, więc pokazuje #NAME?.',
  'tables.import.unknown_fn#few': '{n} formuły używają funkcji, której Slop Tables jeszcze nie ma, więc pokazują #NAME?.',
  'tables.import.unknown_fn#many': '{n} formuł używa funkcji, której Slop Tables jeszcze nie ma, więc pokazują #NAME?.',
  'tables.import.skipped': 'Nie zaimportowano: {list}.',
  'tables.import.chart_kind': '{n} wykresów typu {kind} nie zaimportowano: Slop Tables rysuje wykresy kolumnowe, słupkowe, liniowe i kołowe.',
  'tables.import.chart_kind#one': '{n} wykres typu {kind} nie został zaimportowany: Slop Tables rysuje wykresy kolumnowe, słupkowe, liniowe i kołowe.',
  'tables.import.chart_kind#few': '{n} wykresy typu {kind} nie zostały zaimportowane: Slop Tables rysuje wykresy kolumnowe, słupkowe, liniowe i kołowe.',
  'tables.import.chart_kind#many': '{n} wykresów typu {kind} nie zaimportowano: Slop Tables rysuje wykresy kolumnowe, słupkowe, liniowe i kołowe.',
  'tables.import.chart_shape': '{n} wykresów nie zaimportowano: ich serie nie są jednym blokiem komórek.',
  'tables.import.chart_shape#one': '{n} wykres nie został zaimportowany: jego serie nie są jednym blokiem komórek.',
  'tables.import.chart_shape#few': '{n} wykresy nie zostały zaimportowane: ich serie nie są jednym blokiem komórek.',
  'tables.import.chart_shape#many': '{n} wykresów nie zaimportowano: ich serie nie są jednym blokiem komórek.',

  'tables.drop.label': 'Upuść arkusz, aby go otworzyć',
  'tables.drop.noun': 'arkusz kalkulacyjny',

  'tables.config.label': 'Skoroszyt',
  'tables.config.desc': 'Arkusze i ich zawartość; formuła zapisana jako tekst zaczynający się od =',
  'tables.config.kept': 'otwarty skoroszyt został zachowany',
});
