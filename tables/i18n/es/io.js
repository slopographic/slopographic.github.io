/* Slop Tables, Spanish: opening and saving files, the import notes and the drop zone. Same keys as tables/i18n/en/io.js. Terms: shared/i18n/glossary-es.md. */
window.SlopI18n && window.SlopI18n.add('es', {
  'tables.file.open_failed': 'No se pudo abrir ese archivo',
  'tables.file.save_failed': 'No se pudo guardar',
  'tables.file.left_out': 'Se abrió dejando fuera algunas cosas',
  'tables.file.left_out_body': 'Guardar lo conserva como archivo de Slop Tables en Slop Drive; Archivo ▸ Descargar ▸ XLSX crea un archivo nuevo de Excel.',
  'tables.file.opened': 'Se abrió {name}',
  'tables.file.opened_it': 'Se abrió el archivo',
  'tables.file.not_ours': 'Este no es un archivo de Slop Tables.',
  'tables.file.kinds': 'Slop Tables abre archivos .stab, .xlsx, .ods, .csv y .tsv.',
  'tables.file.damaged': 'Este archivo de Slop Tables está dañado ({what}).',
  'tables.file.newer': 'Este archivo de Slop Tables es de una versión más nueva de Slop Tables.',

  'tables.import.unknown_fn': '{n} fórmulas usan una función que Slop Tables todavía no tiene, así que muestran #NOMBRE?.',
  'tables.import.unknown_fn#one': '{n} fórmula usa una función que Slop Tables todavía no tiene, así que muestra #NOMBRE?.',
  'tables.import.skipped': 'No se importó: {list}.',
  'tables.import.chart_kind': 'No se importaron {n} gráficos de tipo {kind}: Slop Tables dibuja gráficos de columnas, barras, líneas y circulares.',
  'tables.import.chart_kind#one': 'No se importó {n} gráfico de tipo {kind}: Slop Tables dibuja gráficos de columnas, barras, líneas y circulares.',
  'tables.import.chart_shape': 'No se importaron {n} gráficos: sus series no forman un único bloque de celdas.',
  'tables.import.chart_shape#one': 'No se importó {n} gráfico: sus series no forman un único bloque de celdas.',

  'tables.drop.label': 'Suelta una hoja de cálculo para abrirla',
  'tables.drop.noun': 'una hoja de cálculo',

  'tables.config.label': 'Libro',
  'tables.config.desc': 'Hojas y su contenido; una fórmula se escribe como texto que empieza por =',
  'tables.config.kept': 'se conservó el libro abierto',
});
