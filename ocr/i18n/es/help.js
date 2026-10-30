/* Slop OCR, Spanish: the help box under the text (languages, the models, the PDF text layer, accuracy). Every other
 * language copies these keys into ocr/i18n/<code>/help.js. Rules: shared/i18n/APPS-HOWTO.md. Terms: shared/i18n/glossary-es.md. */
window.SlopI18n && window.SlopI18n.add('es', {
  'ocr.help.summary': 'Idiomas, los modelos y la capa de texto del PDF',
  'ocr.help.lang_h': 'Idiomas.',
  'ocr.help.lang': ' Pulsa Idioma y modelo para elegir el idioma del texto. Un modelo lee cada escritura: el alfabeto latino con sus acentos (sueco å ä ö, alemán, francés, español, polaco, checo, rumano, turco y unos 50 más), chino (simplificado y tradicional) y japonés; cirílico (ruso, ucraniano, búlgaro, serbio, kazajo…); escritura árabe (árabe, persa, urdu…); devanagari (hindi, maratí, nepalí); coreano; griego; tailandés; tamil; telugu. Sin elegir nada, el modelo incluido lee primero chino e inglés (el resto del texto latino pierde sus acentos), y una línea bajo el texto ofrece el modelo adecuado cuando el texto parece de otra escritura.',
  'ocr.help.models_h': 'Los modelos.',
  'ocr.help.models': ' PaddleOCR (PP-OCRv4, PP-OCRv5 y PP-OCRv6), Apache 2.0. Cada uno se descarga solo cuando pulsas Descargar en el diálogo Idioma y modelo, que indica su tamaño y su licencia. Nada se descarga por su cuenta, y los archivos se comprueban antes de guardarse en este dispositivo.',
  'ocr.help.pdf_h': 'PDF con texto buscable.',
  'ocr.help.pdf': ' Se conserva la imagen de cada página, con una capa de texto invisible encima, para que puedas buscar y seleccionar el texto. La fuente PDF estándar solo dibuja letras latinas, así que los caracteres que no puede dibujar se omiten de la capa de texto (la imagen sigue mostrándolos). El texto se coloca en la posición de cada línea; si añades o quitas líneas, las líneas sobrantes van debajo del último recuadro.',
  'ocr.help.acc_h': 'Precisión.',
  'ocr.help.acc': ' Lee el texto antes de usarlo. Solo se leen las líneas horizontales; el texto girado no se gira antes.',
});
