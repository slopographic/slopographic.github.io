/* Slop PDF, українська: відкриття, збереження й видобування (помилки, пропущені елементи, назви змін) та назви панелі «Шари»
 * (pdf/js/io, pdf/js/core). Правила: shared/i18n/APPS-HOWTO.md, shared/i18n/glossary-uk.md. */
window.SlopI18n && window.SlopI18n.add('uk', {
  // core/fonts-custom.js
  'pdf.core.font_missing': 'Шрифт {family} не встановлено.',

  // core/layers.js
  'pdf.core.layer_numbered': '{name} {n}',
  'pdf.core.layer_step_n': 'Крок {n}',
  'pdf.core.layer_text': 'Текст',
  'pdf.core.layer_callout': 'Виноска',
  'pdf.core.layer_comment': 'Коментар',
  'pdf.core.layer_rect': 'Прямокутник',
  'pdf.core.layer_ellipse': 'Еліпс',
  'pdf.core.layer_line': 'Лінія',
  'pdf.core.layer_arrow': 'Стрілка',
  'pdf.core.layer_drawing': 'Малюнок',
  'pdf.core.layer_highlighter': 'Маркер',
  'pdf.core.layer_highlight': 'Виділення',
  'pdf.core.layer_texthl': 'Виділення тексту',
  'pdf.core.layer_whiteout': 'Біла заливка',
  'pdf.core.layer_image': 'Зображення',
  'pdf.core.layer_redaction': 'Приховування',
  'pdf.core.layer_step': 'Крок',
  'pdf.core.layer_paragraph': 'Абзац',
  'pdf.core.layer_signature': 'Підпис',
  'pdf.core.layer_item': 'Елемент',

  // core/pdf-parts.js
  'pdf.io.meta_pages': 'сторінки {list}',
  'pdf.io.meta_page': 'сторінка {n}',
  'pdf.io.font_stream_raw': 'Цей потік шрифту збережено у спосіб, який не декодується',
  'pdf.io.not_embedded': 'не вбудовано',
  'pdf.io.font_composite': 'Складений ({type})',
  'pdf.io.not_decoded': 'Не декодовано',
  'pdf.io.image_undecodable': 'Дані зображення не вдалося розпакувати',
  'pdf.io.image_no_size': 'Зображення не має розміру',
  'pdf.io.image_short': 'Дані зображення коротші за його розмір',
  'pdf.io.att_raw': 'Це вкладення збережено у спосіб, який не декодується',

  // core/pdfjs.js
  'pdf.core.needs_password': 'Для цього PDF потрібен пароль.',
  'pdf.core.err_invalid': '«{name}» не є дійсним PDF або пошкоджено без можливості відновлення.',
  'pdf.core.err_empty': '«{name}» порожній.',
  'pdf.core.err_password': '«{name}» потребує правильного пароля.',
  'pdf.core.err_open': '«{name}» не вдалося відкрити: {msg}',
  'pdf.core.unsupported_encryption': 'Непідтримуване шифрування',
  'pdf.core.writer_missing': 'Модуль запису PDF не завантажився.',

  // io/assets-model.js
  'pdf.io.unknown': 'невідомо',
  'pdf.io.none': 'немає',
  'pdf.io.skip_stencil': 'Трафаретна маска (1 біт) не декодується',
  'pdf.io.skip_jpx': 'Зображення JPEG 2000 не декодуються',
  'pdf.io.skip_jbig2': 'Зображення JBIG2 не декодуються',
  'pdf.io.skip_ccitt': 'Факсимільні зображення CCITT не декодуються',
  'pdf.io.skip_filter': 'Фільтр {filter} не декодується',
  'pdf.io.skip_raw': 'Нестиснені зображення такого типу не декодуються',
  'pdf.io.skip_bpc': 'Вибірки {bpc} біт не декодуються',
  'pdf.io.skip_palette': 'Палітра у {cs} не декодується',
  'pdf.io.skip_colour': 'Колірний простір {cs} не декодується',
  'pdf.io.mask_excluded': 'маску не включено',
  'pdf.io.font_not_embedded': 'Не вбудовано: PDF посилається на шрифт, тож файлу для збереження немає',
  'pdf.io.font_subset': 'піднабір: може бути неповним',
  'pdf.io.att_on_page': 'прикріплено на сторінці {n}',
  'pdf.io.att_document': 'прикріплено до документа',
  'pdf.io.att_einvoice': 'е-рахунок (ZUGFeRD / Factur-X)',
  'pdf.io.att_rel': 'зв’язок: {rel}',

  // io/assets-save.js
  'pdf.io.assets_name': 'Ресурси PDF',
  'pdf.io.no_font_file': 'Не вбудовано, тому файлу шрифту немає',

  // io/decrypt.js
  'pdf.io.crypto_load_failed': 'Не вдалося завантажити код розшифрування PDF.',
  'pdf.io.crypto_not_loaded': 'Код розшифрування PDF не завантажився.',

  // io/doc-changes.js
  'pdf.io.changes_replayed': 'Відтворити збережені зміни',

  // io/edit-log.js
  'pdf.io.log_found_title': 'Знайдено збережені правки',
  'pdf.io.log_found_body': 'Slop PDF зберіг на цьому пристрої правок до «{name}»: {n}. Відтворіть їх у цьому файлі або відкиньте. «Зберегти» або «Експорт» у будь-якому разі створюють новий PDF.',
  'pdf.io.log_found_body#one': 'Slop PDF зберіг на цьому пристрої {n} правку до «{name}». Відтворіть її в цьому файлі або відкиньте. «Зберегти» або «Експорт» у будь-якому разі створюють новий PDF.',
  'pdf.io.log_found_body#few': 'Slop PDF зберіг на цьому пристрої {n} правки до «{name}». Відтворіть їх у цьому файлі або відкиньте. «Зберегти» або «Експорт» у будь-якому разі створюють новий PDF.',
  'pdf.io.log_found_body#many': 'Slop PDF зберіг на цьому пристрої правок до «{name}»: {n}. Відтворіть їх у цьому файлі або відкиньте. «Зберегти» або «Експорт» у будь-якому разі створюють новий PDF.',
  'pdf.io.log_discard': 'Відкинути',
  'pdf.io.log_replay': 'Відтворити',
  'pdf.io.log_replayed': 'Відтворити збережені правки',

  // io/export.js
  'pdf.io.no_pages': 'Немає сторінок для експорту.',
  'pdf.io.redact_pending': 'Позначено для приховання областей: {n}, але їх ще не приховано. Відкрийте «Приховати дані» й виберіть «Застосувати приховування» або вилучіть позначки.',
  'pdf.io.redact_pending#one': 'Позначено для приховання {n} область, але її ще не приховано. Відкрийте «Приховати дані» й виберіть «Застосувати приховування» або вилучіть позначку.',
  'pdf.io.redact_pending#few': 'Позначено для приховання {n} області, але їх ще не приховано. Відкрийте «Приховати дані» й виберіть «Застосувати приховування» або вилучіть позначки.',
  'pdf.io.redact_pending#many': 'Позначено для приховання областей: {n}, але їх ще не приховано. Відкрийте «Приховати дані» й виберіть «Застосувати приховування» або вилучіть позначки.',
  'pdf.io.source_missing': 'Бракує вихідного файлу.',
  'pdf.io.locked': '«{name}» використовує шифрування, яке Slop PDF не може зняти ({why}), тому його сторінки не можна експортувати.',

  // io/ocg.js
  'pdf.io.layer': 'Шар',
  'pdf.io.layer_hide': 'Приховати шар «{name}»',
  'pdf.io.layer_show': 'Показати шар «{name}»',
  'pdf.io.layer_delete': 'Видалити шар «{name}»',

  // io/sample.js
  'pdf.io.sample_busy_playful': 'Замішуємо свіжу партію слизу…',
  'pdf.io.sample_busy_plain': 'Готуємо приклад…',

  // io/session.js
  'pdf.io.restore': 'Відновити',
  'pdf.io.close_all': 'Закрити все',
});
