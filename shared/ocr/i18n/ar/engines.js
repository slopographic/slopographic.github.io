/* Text recognition engines, Arabic. Same keys as shared/ocr/i18n/en/engines.js. Terms: shared/i18n/glossary-ar.md. */
window.SlopI18n && window.SlopI18n.add('ar', {
  'ocrengine.label': 'محرك التعرف على النص',
  'ocrengine.auto': 'تلقائي (الأفضل لهذه اللغة)',
  'ocrengine.note': 'المحرك الذي يقرأ النص. يستخدم «تلقائي» الأدق للغة التي تختارها.',
  'ocrengine.hidden': '{name} غير متاح على هذا الموقع.',
  'ocrengine.unknown_model': '{model} ليس نموذج Tesseract.',
  'ocrengine.reading': 'جارٍ قراءة بيانات اللغة من هذا الجهاز…',
  'ocrengine.starting': 'جارٍ تشغيل Tesseract…',
  'ocrengine.model_name': 'Tesseract: {lang}',
  'ocrengine.model_note': 'بيانات Tesseract لهذه اللغة وحدها. تقرأ النص المطبوع الواضح بحروف اللغة وعلاماتها الخاصة.',
  'ocrengine.model_arch': 'التعرف على النص بتقنية Tesseract 5 LSTM (tesseract.js {version}، WebAssembly)',
  'ocrengine.model_source': 'tessdata_best من مشروع Tesseract OCR (من حزم @tesseract.js-data)، على خادم الملفات في Slopographic',
});
