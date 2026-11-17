/* Shared components, Ukrainian: the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that
 * download before they start (HEIC, camera RAW, 3D decoders). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('uk', {
  'ui.firstrun.privacy': 'Ваші файли залишаються в цьому браузері. Нічого не завантажується: сайт розміщено на GitHub Pages, у нього немає сервера чи сховища на боці сервера.',
  'ui.firstrun.download_one': 'Це завантажується один раз, {size}, і браузер зберігає це для наступного разу.',
  'ui.firstrun.download_many': 'Це завантажується один раз, загалом близько {size}, і браузер зберігає це для наступного разу.',
  'ui.firstrun.continue': 'Продовжити',
  'ui.firstrun.heic_title': 'Завантажити декодер фото HEIC?',
  'ui.firstrun.heic_text': 'Цей браузер сам не відкриває фото HEIC (формат iPhone), тож для перетворення потрібен декодер HEIC (libheif, скомпільований для роботи у вашому браузері; ліцензія LGPL-3.0). Його буде завантажено один раз із файлового сховища {brand}, перевірено й збережено в цьому браузері. Ваші фото ніколи не завантажуються.',
  'ui.firstrun.heic_name': 'Декодер фото HEIC (libheif {version})',
  'ui.firstrun.raw_title': 'Завантажити рушій RAW камер?',
  'ui.firstrun.raw_text': 'Щоб обробити фото RAW з камери, потрібен рушій RAW (LibRaw, скомпільований для роботи у вашому браузері; ліцензія LGPL-2.1 або CDDL-1.0). Його буде завантажено один раз із файлового сховища {brand}, перевірено й збережено в цьому браузері.',
  'ui.firstrun.raw_name': 'Рушій RAW камер (LibRaw {version})',
  'ui.firstrun.d3_title': 'Завантажити декодер 3D?',
  'ui.firstrun.d3_text': 'Ця модель стиснута. Щоб її прочитати, потрібен декодер; його буде завантажено один раз із CDN {brand}, і браузер зберігатиме його. Сама модель і далі читається на цьому пристрої та ніколи не завантажується.',
});
