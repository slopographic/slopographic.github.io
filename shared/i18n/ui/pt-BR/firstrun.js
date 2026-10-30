/* Shared components, Portuguese (Brazil): the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that
 * download before they start (HEIC, camera RAW, 3D decoders). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('pt-BR', {
  'ui.firstrun.privacy': 'Seus arquivos ficam neste navegador. Nada é enviado: o site é hospedado no GitHub Pages e não tem servidor nem armazenamento no backend.',
  'ui.firstrun.download_one': 'Isto é baixado uma vez, {size}, e guardado por este navegador para a próxima vez.',
  'ui.firstrun.download_many': 'Estes são baixados uma vez, cerca de {size} no total, e guardados por este navegador para a próxima vez.',
  'ui.firstrun.continue': 'Continuar',
  'ui.firstrun.heic_title': 'Baixar o decodificador de fotos HEIC?',
  'ui.firstrun.heic_text': 'Este navegador não consegue abrir fotos HEIC (o formato do iPhone) sozinho, então converter uma exige o decodificador HEIC (libheif, compilado para rodar no seu navegador; licença LGPL-3.0). Ele é baixado uma vez do armazenamento de arquivos do {brand}, verificado e guardado neste navegador. Suas fotos nunca são enviadas.',
  'ui.firstrun.heic_name': 'Decodificador de fotos HEIC (libheif {version})',
  'ui.firstrun.raw_title': 'Baixar o motor RAW de câmera?',
  'ui.firstrun.raw_text': 'Revelar uma foto RAW de câmera exige o motor RAW (LibRaw, compilado para rodar no seu navegador; licença LGPL-2.1 ou CDDL-1.0). Ele é baixado uma vez do armazenamento de arquivos do {brand}, verificado e guardado neste navegador.',
  'ui.firstrun.raw_name': 'Motor RAW de câmera (LibRaw {version})',
  'ui.firstrun.d3_title': 'Baixar o decodificador 3D?',
  'ui.firstrun.d3_text': 'Este modelo é compactado. Lê-lo exige um decodificador, que é baixado uma vez da CDN do {brand} e guardado por este navegador. O próprio modelo continua sendo lido neste dispositivo e nunca é enviado.',
});
