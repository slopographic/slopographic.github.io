/* Shared components, Polish: the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that
 * download before they start (HEIC, camera RAW, 3D decoders). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('pl', {
  'ui.firstrun.privacy': 'Twoje pliki zostają w tej przeglądarce. Nic nie jest przesyłane: strona jest hostowana na GitHub Pages i nie ma serwera ani przechowywania danych po stronie serwera.',
  'ui.firstrun.download_one': 'Pobierane jednorazowo, {size}, i zapisywane przez tę przeglądarkę na następny raz.',
  'ui.firstrun.download_many': 'Pobierane jednorazowo, łącznie około {size}, i zapisywane przez tę przeglądarkę na następny raz.',
  'ui.firstrun.continue': 'Dalej',
  'ui.firstrun.heic_title': 'Pobrać dekoder zdjęć HEIC?',
  'ui.firstrun.heic_text': 'Ta przeglądarka sama nie otworzy zdjęć HEIC (formatu iPhone), więc konwersja wymaga dekodera HEIC (libheif, skompilowanego do działania w przeglądarce; licencja LGPL-3.0). Jest pobierany jednorazowo z magazynu plików {brand}, sprawdzany i zapisywany w tej przeglądarce. Twoje zdjęcia nigdy nie są przesyłane.',
  'ui.firstrun.heic_name': 'Dekoder zdjęć HEIC (libheif {version})',
  'ui.firstrun.raw_title': 'Pobrać silnik RAW aparatów?',
  'ui.firstrun.raw_text': 'Wywołanie zdjęcia RAW z aparatu wymaga silnika RAW (LibRaw, skompilowanego do działania w przeglądarce; licencja LGPL-2.1 lub CDDL-1.0). Jest pobierany jednorazowo z magazynu plików {brand}, sprawdzany i zapisywany w tej przeglądarce.',
  'ui.firstrun.raw_name': 'Silnik RAW aparatów (LibRaw {version})',
  'ui.firstrun.d3_title': 'Pobrać dekoder 3D?',
  'ui.firstrun.d3_text': 'Ten model jest skompresowany. Jego odczyt wymaga dekodera, który jest pobierany jednorazowo z CDN {brand} i zapisywany przez tę przeglądarkę. Sam model nadal jest odczytywany na tym urządzeniu i nigdy nie jest przesyłany.',
});
