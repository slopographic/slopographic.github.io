/* Shared components, Arabic: the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that
 * download before they start (HEIC, camera RAW, 3D decoders). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('ar', {
  'ui.firstrun.privacy': 'تبقى ملفاتك في هذا المتصفح. لا يُرفع أي شيء: الموقع مستضاف على GitHub Pages ولا يملك خادمًا أو تخزينًا خلفيًا.',
  'ui.firstrun.download_one': 'يُنزَّل هذا مرة واحدة، بحجم {size}، ويحتفظ به هذا المتصفح للمرات القادمة.',
  'ui.firstrun.download_many': 'تُنزَّل هذه الملفات مرة واحدة، بحجم {size} تقريبًا في المجموع، ويحتفظ بها هذا المتصفح للمرات القادمة.',
  'ui.firstrun.continue': 'متابعة',
  'ui.firstrun.heic_title': 'هل تريد تنزيل مفكك صور HEIC؟',
  'ui.firstrun.heic_text': 'لا يستطيع هذا المتصفح فتح صور HEIC (صيغة الآيفون) بمفرده، لذا يتطلب تحويل إحداها مفكك HEIC (libheif، مُترجم ليعمل في متصفحك؛ ترخيص LGPL-3.0). يُنزَّل مرة واحدة من مخزن ملفات {brand}، ويُتحقق منه، ويُحفظ في هذا المتصفح. لا تُرفع صورك أبدًا.',
  'ui.firstrun.heic_name': 'مفكك صور HEIC (libheif {version})',
  'ui.firstrun.raw_title': 'هل تريد تنزيل محرك RAW للكاميرا؟',
  'ui.firstrun.raw_text': 'معالجة صورة RAW من الكاميرا تحتاج إلى محرك RAW (LibRaw، مُترجم ليعمل في متصفحك؛ ترخيص LGPL-2.1 أو CDDL-1.0). يُنزَّل مرة واحدة من مخزن ملفات {brand}، ويُتحقق منه، ويُحفظ في هذا المتصفح.',
  'ui.firstrun.raw_name': 'محرك RAW للكاميرا (LibRaw {version})',
  'ui.firstrun.d3_title': 'هل تريد تنزيل مفكك ثلاثي الأبعاد؟',
  'ui.firstrun.d3_text': 'هذا النموذج مضغوط. لقراءته يلزم مفكك يُنزَّل مرة واحدة من شبكة {brand} ويحتفظ به هذا المتصفح. يُقرأ النموذج نفسه على هذا الجهاز ولا يُرفع أبدًا.',
});
