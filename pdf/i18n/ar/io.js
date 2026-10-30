/* Slop PDF, Arabic: opening, saving and extracting (errors, skipped items, change labels) and the Layers panel names (pdf/js/io, pdf/js/core). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('ar', {
  // core/fonts-custom.js
  'pdf.core.font_missing': 'الخط {family} غير مثبَّت.',

  // core/layers.js
  'pdf.core.layer_numbered': '{name} {n}',
  'pdf.core.layer_step_n': 'الخطوة {n}',
  'pdf.core.layer_text': 'نص',
  'pdf.core.layer_callout': 'وسيلة شرح',
  'pdf.core.layer_comment': 'تعليق',
  'pdf.core.layer_rect': 'مستطيل',
  'pdf.core.layer_ellipse': 'شكل بيضاوي',
  'pdf.core.layer_line': 'خط',
  'pdf.core.layer_arrow': 'سهم',
  'pdf.core.layer_drawing': 'رسم',
  'pdf.core.layer_highlighter': 'قلم تمييز',
  'pdf.core.layer_highlight': 'تمييز',
  'pdf.core.layer_texthl': 'تمييز نص',
  'pdf.core.layer_whiteout': 'تغطية بيضاء',
  'pdf.core.layer_image': 'صورة',
  'pdf.core.layer_redaction': 'تنقيح',
  'pdf.core.layer_step': 'خطوة',
  'pdf.core.layer_paragraph': 'فقرة',
  'pdf.core.layer_signature': 'توقيع',
  'pdf.core.layer_item': 'عنصر',

  // core/pdf-parts.js
  'pdf.io.meta_pages': 'الصفحات {list}',
  'pdf.io.meta_page': 'الصفحة {n}',
  'pdf.io.font_stream_raw': 'دفق هذا الخط مخزَّن بطريقة لا يُفك ترميزها',
  'pdf.io.not_embedded': 'غير مضمَّن',
  'pdf.io.font_composite': 'مركَّب ({type})',
  'pdf.io.not_decoded': 'لم يُفك ترميزه',
  'pdf.io.image_undecodable': 'تعذّر فك ضغط بيانات الصورة',
  'pdf.io.image_no_size': 'الصورة بلا حجم',
  'pdf.io.image_short': 'بيانات الصورة أقصر من حجمها',
  'pdf.io.att_raw': 'هذا المرفق مخزَّن بطريقة لا يُفك ترميزها',

  // core/pdfjs.js
  'pdf.core.needs_password': 'يحتاج ملف PDF هذا إلى كلمة مرور.',
  'pdf.core.err_invalid': '“{name}” ليس ملف PDF صالحاً، أو أنه تالف بشكل يتعذّر إصلاحه.',
  'pdf.core.err_empty': '“{name}” فارغ.',
  'pdf.core.err_password': '“{name}” يحتاج إلى كلمة المرور الصحيحة.',
  'pdf.core.err_open': 'تعذّر فتح “{name}”: {msg}',
  'pdf.core.unsupported_encryption': 'تشفير غير مدعوم',
  'pdf.core.writer_missing': 'لم يُحمَّل كاتب PDF.',

  // io/assets-model.js
  'pdf.io.unknown': 'غير معروف',
  'pdf.io.none': 'لا شيء',
  'pdf.io.skip_stencil': 'لا يُفك ترميز قناع الاستنسل (1 بت)',
  'pdf.io.skip_jpx': 'لا يُفك ترميز صور JPEG 2000',
  'pdf.io.skip_jbig2': 'لا يُفك ترميز صور JBIG2',
  'pdf.io.skip_ccitt': 'لا يُفك ترميز صور الفاكس CCITT',
  'pdf.io.skip_filter': 'لا يُفك ترميز المرشِّح {filter}',
  'pdf.io.skip_raw': 'لا يُفك ترميز الصور غير المضغوطة من هذا النوع',
  'pdf.io.skip_bpc': 'لا يُفك ترميز العينات ذات {bpc} بت',
  'pdf.io.skip_palette': 'لا يُفك ترميز لوحة الألوان في {cs}',
  'pdf.io.skip_colour': 'لا يُفك ترميز مساحة الألوان {cs}',
  'pdf.io.mask_excluded': 'القناع غير مضمَّن',
  'pdf.io.font_not_embedded': 'غير مضمَّن: يشير ملف PDF إلى الخط فقط، فلا يوجد ملف لحفظه',
  'pdf.io.font_subset': 'مجموعة جزئية: قد يكون غير كامل',
  'pdf.io.att_on_page': 'مرفق في الصفحة {n}',
  'pdf.io.att_document': 'مرفق بالمستند',
  'pdf.io.att_einvoice': 'فاتورة إلكترونية (ZUGFeRD / Factur-X)',
  'pdf.io.att_rel': 'العلاقة: {rel}',

  // io/assets-save.js
  'pdf.io.assets_name': 'محتويات PDF',
  'pdf.io.no_font_file': 'غير مضمَّن، فلا يوجد ملف خط',

  // io/decrypt.js
  'pdf.io.crypto_load_failed': 'تعذّر تحميل شيفرة كلمة مرور PDF.',
  'pdf.io.crypto_not_loaded': 'لم تُحمَّل شيفرة كلمة مرور PDF.',

  // io/doc-changes.js
  'pdf.io.changes_replayed': 'إعادة تطبيق التغييرات المحفوظة',

  // io/edit-log.js
  'pdf.io.log_found_title': 'تم العثور على تعديلات محفوظة',
  'pdf.io.log_found_body': 'احتفظ Slop PDF بـ {n} تعديل على “{name}” في هذا الجهاز. أعد تطبيقها على هذا الملف، أو تجاهلها. في الحالتين يكتب الحفظ أو التصدير ملف PDF جديداً.',
  'pdf.io.log_found_body#zero': 'لم يحتفظ Slop PDF بأي تعديل على “{name}” في هذا الجهاز. الحفظ أو التصدير يكتب ملف PDF جديداً في الحالتين.',
  'pdf.io.log_found_body#one': 'احتفظ Slop PDF بتعديل واحد على “{name}” في هذا الجهاز. أعد تطبيقه على هذا الملف، أو تجاهله. في الحالتين يكتب الحفظ أو التصدير ملف PDF جديداً.',
  'pdf.io.log_found_body#two': 'احتفظ Slop PDF بتعديلين على “{name}” في هذا الجهاز. أعد تطبيقهما على هذا الملف، أو تجاهلهما. في الحالتين يكتب الحفظ أو التصدير ملف PDF جديداً.',
  'pdf.io.log_found_body#few': 'احتفظ Slop PDF بـ {n} تعديلات على “{name}” في هذا الجهاز. أعد تطبيقها على هذا الملف، أو تجاهلها. في الحالتين يكتب الحفظ أو التصدير ملف PDF جديداً.',
  'pdf.io.log_found_body#many': 'احتفظ Slop PDF بـ {n} تعديلًا على “{name}” في هذا الجهاز. أعد تطبيقها على هذا الملف، أو تجاهلها. في الحالتين يكتب الحفظ أو التصدير ملف PDF جديداً.',
  'pdf.io.log_discard': 'تجاهل',
  'pdf.io.log_replay': 'إعادة التطبيق',
  'pdf.io.log_replayed': 'إعادة تطبيق التعديلات المحفوظة',

  // io/export.js
  'pdf.io.no_pages': 'لا توجد صفحات لتصديرها.',
  'pdf.io.redact_pending': '{n} منطقة عليها علامة التنقيح لكنها لم تُنقَّح بعد. افتح التنقيح واختر “تطبيق التنقيحات”، أو أزل العلامات.',
  'pdf.io.redact_pending#zero': 'لا توجد مناطق عليها علامات تنقيح لم تُنقَّح بعد.',
  'pdf.io.redact_pending#many': '{n} منطقةً عليها علامة تنقيح لم تُنقَّح بعد. افتح التنقيح واختر “تطبيق التنقيحات”، أو أزل العلامات.',
  'pdf.io.redact_pending#one': 'منطقة واحدة عليها علامة التنقيح لكنها لم تُنقَّح بعد. افتح التنقيح واختر “تطبيق التنقيحات”، أو أزل العلامة.',
  'pdf.io.redact_pending#two': 'منطقتان عليهما علامة التنقيح لكنهما لم تُنقَّحا بعد. افتح التنقيح واختر “تطبيق التنقيحات”، أو أزل العلامتين.',
  'pdf.io.redact_pending#few': '{n} مناطق عليها علامة التنقيح لكنها لم تُنقَّح بعد. افتح التنقيح واختر “تطبيق التنقيحات”، أو أزل العلامات.',
  'pdf.io.source_missing': 'أحد الملفات المصدر مفقود.',
  'pdf.io.locked': 'يستخدم “{name}” تشفيراً لا يستطيع Slop PDF إزالته ({why})، لذا لا يمكن تصدير صفحاته.',

  // io/ocg.js
  'pdf.io.layer': 'طبقة',
  'pdf.io.layer_hide': 'إخفاء الطبقة “{name}”',
  'pdf.io.layer_show': 'إظهار الطبقة “{name}”',
  'pdf.io.layer_delete': 'حذف الطبقة “{name}”',

  // io/sample.js
  'pdf.io.sample_busy_playful': 'جارٍ خلط دفعة طازجة من الهلام…',
  'pdf.io.sample_busy_plain': 'جارٍ إنشاء العينة…',

  // io/session.js
  'pdf.io.restore': 'استعادة',
  'pdf.io.close_all': 'إغلاق الكل',
});
