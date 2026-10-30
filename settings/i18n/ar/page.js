/* Settings, Arabic: the page's own text (settings/index.html). The section titles shared with the chrome stay in
 * shared/i18n/ar.js. Same keys as settings/i18n/en/page.js. Terms: shared/i18n/glossary-ar.md. */
window.SlopI18n && window.SlopI18n.add('ar', {
  'settings.page.kicker': 'الإعدادات',
  'settings.page.home_aria': '{brand}، الصفحة الرئيسية',
  'settings.page.sections': 'الأقسام',
  'settings.page.title_lead': 'اختياراتك',
  'settings.page.title_em': 'الخاصة',
  'settings.page.privacy': 'يعمل Slopographic في متصفحك، ولا تغادر ملفاتك جهازك أبدًا. تُحفظ اختياراتك في هذه الصفحة في التخزين المحلي لهذا المتصفح، ولا تُحفظ في أي مكان آخر. تبقى التحليلات والإعلانات متوقفة إلى أن تشغّلها، ولا تُحمَّل أي نصوص من أطراف ثالثة قبل ذلك. يمكنك تغيير هذا في أي وقت.',
  'settings.page.agents': 'وكلاء الذكاء الاصطناعي',

  'settings.consent.analytics': 'التحليلات',
  'settings.consent.analytics_help': 'يحصي Google Analytics 4 مشاهدات الصفحات، فنرى التطبيقات التي يستخدمها الناس. متوقف افتراضيًا.',
  'settings.consent.ads': 'الإعلانات',
  'settings.consent.ads_help': 'قد يعرض Google AdSense إعلانات في بعض الصفحات. متوقف افتراضيًا.',

  'settings.defaults.lede': 'تُستخدم للفواتير والطلبات وقيود الدفتر الجديدة، ولصيغ الأرقام والعملات والتواريخ. لا تغيّر هذه الإعدادات لغة نصوص التطبيق.',
  'settings.defaults.currency': 'العملة الافتراضية',
  'settings.defaults.currency_help': 'العملة الأساسية للدفتر. تحتفظ القيود بعملات أخرى بمبالغها الأصلية وتُحوَّل بسعر يوم القيد.',
  'settings.defaults.locale': 'اللغة والمنطقة',
  'settings.defaults.locale_help': 'طريقة كتابة الأرقام والعملات والتواريخ. تبدأ بلغة متصفحك.',

  'settings.folder.title': 'مجلد محلي',
  'settings.folder.lede': 'احتفظ بنسخة من إعدادات Slopographic في مجلد على هذا الحاسوب. وهو المجلد نفسه الذي يستخدمه Slop Drive، فيمكنك ربطه من أيّ المكانين. تُكتب الملفات في ذلك المجلد فقط، ولا يُرسل شيء إلى أي مكان.',
  'settings.folder.see_files': 'لرؤية الملفات في هذا المجلد:',
  'settings.folder.open_drive': 'فتح Slop Drive',

  'settings.storage.title': 'التخزين',
  'settings.storage.lede': 'مقدار المساحة التي يستخدمها هذا الموقع في متصفحك، وما الذي يستخدمها. ملفاتك ومستنداتك ومشاريعك المحفوظة مخزّنة هنا أيضًا. مسح الذاكرة المؤقتة يزيل فقط ما يُعاد إنشاؤه عند الحاجة.',

  'settings.updates.title': 'التحديثات',
  'settings.updates.lede': 'يتحقق Slopographic من وجود إصدار جديد في كل مرة تفتح فيها صفحة. إذا بدت صفحة قديمة، فحمّل أحدث إصدار: تُعاد جلب النسخ غير المتصلة وتُعاد تحميل الصفحة. تبقى ملفاتك ومستنداتك وإعداداتك وحزمك المنزّلة كما هي.',
  'settings.updates.fresh': 'في أي صفحة، إضافة {fresh} إلى العنوان تفعل الشيء نفسه.',
  'settings.updates.refresh': 'تحميل أحدث إصدار',

  'settings.rates.lede': 'تُدخل الأسعار بنفسك، أو تُنزَّل عمدًا من البنك المركزي الأوروبي. لا يُنزَّل شيء إلا إذا فعّلت هذا الخيار واضغطت الزر، أو حددت «تحديث عند الفتح».',
  'settings.rates.switch_help': 'يسمح لزر التحديث أدناه بتنزيل أسعار المرجع اليومية من ECB. متوقف افتراضيًا.',
  'settings.rates.on_open': 'تحديث عند الفتح',
  'settings.rates.on_open_help': 'تنزيل أسعار ECB في كل مرة تُفتح فيها هذه الصفحة. يتطلب تفعيل أسعار الصرف.',
  'settings.rates.update': 'تحديث الأسعار من البنك المركزي الأوروبي',
  'settings.rates.add_title': 'إضافة سعر',
  'settings.rates.base': 'الأساس',
  'settings.rates.quote': 'المقابل',
  'settings.rates.date': 'التاريخ',
  'settings.rates.rate': 'السعر',
  'settings.rates.note': 'ملاحظة',
  'settings.rates.save': 'حفظ السعر',
  'settings.rates.explain': 'وحدة واحدة من العملة الأساسية تساوي السعر بالعملة المقابلة. الأسعار المحفوظة لا تُعدَّل؛ ولتصحيح سعر، أضف صفًا جديدًا لذلك التاريخ.',
  'settings.rates.recent': 'أحدث الأسعار',
  'settings.rates.pair': 'الزوج',
  'settings.rates.source': 'المصدر',

  'settings.apps.lede': 'خيارات كل تطبيق. تغيير خيار هنا يغيّر ذلك التطبيق وحده، ما لم يذكر قسمه أنه مشترك (الكشف عن الوجوه مشترك بين Slop Drive وSlop Gallery). أعد ضبط التطبيق للعودة إلى إعداداته الافتراضية.',
  'settings.donate.lede': 'Slopographic مجاني الاستخدام. إن أردت المساعدة في استمراره، يمكنك ترك بقشيش في صندوق البقشيش.',
});
