/* Конвертація файлів, українська: маршрути, діапазони сторінок і запуски. Правила: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('uk', {
  'convert.chain.cancelled': 'Скасовано',
  'convert.chain.no_file': 'Файл не створено.',
  'convert.chain.step_failed': 'Крок {i} з {n} ({label}) не вдався: {message}',
  'convert.chain.via': '{to} · через {steps}',
  'convert.chain.step': 'Крок {i} · {from} → {to}',
  'convert.chain.pdf_lib': 'Не вдалося завантажити бібліотеку PDF',
  'convert.chain.range_bad': '«{part}» не є номером сторінки або діапазоном. Використовуйте 1, 3-5 або 7-.',
  'convert.chain.range_start': 'Номери сторінок починаються з 1.',
  'convert.chain.range_back': '«{part}» іде у зворотному порядку.',
  'convert.chain.range_past': 'Сторінка {page} за межами файлу. У цьому файлі сторінок: {n}.',
  'convert.chain.range_past#one': 'Сторінка {page} за межами файлу. У цьому файлі {n} сторінка.',
  'convert.chain.range_past#few': 'Сторінка {page} за межами файлу. У цьому файлі {n} сторінки.',
  'convert.chain.range_past#many': 'Сторінка {page} за межами файлу. У цьому файлі {n} сторінок.',
  'convert.chain.range_none': 'Сторінок не вибрано.',
});
