/* Shared components, Russian: the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that
 * download before they start (HEIC, camera RAW, 3D decoders). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('ru', {
  'ui.firstrun.privacy': 'Ваши файлы остаются в этом браузере. Ничего не отправляется: сайт размещён на GitHub Pages и не имеет сервера или хранилища на стороне сервера.',
  'ui.firstrun.download_one': 'Загружается один раз, {size}, и хранится в этом браузере для следующих раз.',
  'ui.firstrun.download_many': 'Загружается один раз, всего примерно {size}, и хранится в этом браузере для следующих раз.',
  'ui.firstrun.continue': 'Продолжить',
  'ui.firstrun.heic_title': 'Загрузить декодер фото HEIC?',
  'ui.firstrun.heic_text': 'Этот браузер сам не открывает фото HEIC (формат iPhone), поэтому для конвертации нужен декодер HEIC (libheif, скомпилированный для работы в браузере; лицензия LGPL-3.0). Он загружается один раз из файлового хранилища {brand}, проверяется и хранится в этом браузере. Ваши фото никуда не отправляются.',
  'ui.firstrun.heic_name': 'Декодер фото HEIC (libheif {version})',
  'ui.firstrun.raw_title': 'Загрузить движок RAW-файлов камеры?',
  'ui.firstrun.raw_text': 'Для обработки RAW-фото с камеры нужен движок RAW (LibRaw, скомпилированный для работы в браузере; лицензия LGPL-2.1 или CDDL-1.0). Он загружается один раз из файлового хранилища {brand}, проверяется и хранится в этом браузере.',
  'ui.firstrun.raw_name': 'Движок RAW-файлов камеры (LibRaw {version})',
  'ui.firstrun.d3_title': 'Загрузить декодер 3D?',
  'ui.firstrun.d3_text': 'Эта модель сжата. Для её чтения нужен декодер: он загружается один раз из CDN {brand} и хранится в этом браузере. Сама модель по-прежнему читается на этом устройстве и никуда не отправляется.',
});
