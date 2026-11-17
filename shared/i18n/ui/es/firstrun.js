/* Shared components, Spanish: the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that
 * download before they start (HEIC, camera RAW, 3D decoders). Terms: shared/i18n/glossary-es.md.
 * Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('es', {
  'ui.firstrun.privacy': 'Tus archivos se quedan en este navegador. No se sube nada: el sitio está alojado en GitHub Pages y no tiene servidor ni almacenamiento en un backend.',
  'ui.firstrun.download_one': 'Se descarga una vez, {size}, y este navegador lo guarda para la próxima vez.',
  'ui.firstrun.download_many': 'Se descargan una vez, unos {size} en total, y este navegador los guarda para la próxima vez.',
  'ui.firstrun.continue': 'Continuar',
  'ui.firstrun.heic_title': '¿Descargar el decodificador de fotos HEIC?',
  'ui.firstrun.heic_text': 'Este navegador no puede abrir fotos HEIC (el formato del iPhone) por sí solo, así que para convertir una hace falta el decodificador HEIC (libheif, compilado para ejecutarse en tu navegador; licencia LGPL-3.0). Se descarga una vez desde el almacén de archivos de {brand}, se comprueba y se guarda en este navegador. Tus fotos nunca se suben.',
  'ui.firstrun.heic_name': 'Decodificador de fotos HEIC (libheif {version})',
  'ui.firstrun.raw_title': '¿Descargar el motor RAW de cámara?',
  'ui.firstrun.raw_text': 'Revelar una foto RAW de cámara necesita el motor RAW (LibRaw, compilado para ejecutarse en tu navegador; licencia LGPL-2.1 o CDDL-1.0). Se descarga una vez desde el almacén de archivos de {brand}, se comprueba y se guarda en este navegador.',
  'ui.firstrun.raw_name': 'Motor RAW de cámara (LibRaw {version})',
  'ui.firstrun.d3_title': '¿Descargar el decodificador 3D?',
  'ui.firstrun.d3_text': 'Este modelo está comprimido. Para leerlo hace falta un decodificador, que se descarga una vez desde la CDN de {brand} y guarda este navegador. El propio modelo se sigue leyendo en este dispositivo y nunca se sube.',
});
