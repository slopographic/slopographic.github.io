/* Settings, English: the page's own text (settings/index.html). The section titles shared with the chrome stay in
 * shared/i18n/strings.js (settings.appearance, settings.privacy, ...). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  'settings.page.kicker': 'Settings',
  'settings.page.home_aria': '{brand}, home',
  'settings.page.sections': 'Sections',
  'settings.page.title_lead': 'Your',
  'settings.page.title_em': 'choices',
  'settings.page.privacy': 'Slopographic runs in your browser and your files never leave your device. Your choices on this page are stored in this browser\'s local storage and nowhere else. Analytics and ads are off until you turn them on, and no third-party script loads until you do. You can change this at any time.',
  'settings.page.agents': 'AI agents',

  'settings.consent.analytics': 'Analytics',
  'settings.consent.analytics_help': 'Google Analytics 4 counts page views, so we can see which apps people use. Off by default.',
  'settings.consent.ads': 'Ads',
  'settings.consent.ads_help': 'Google AdSense may show ads on some pages. Off by default.',

  'settings.defaults.lede': 'Used for new invoices, orders and journal entries, and for numbers, currencies and dates. Language of the app text is not changed by these.',
  'settings.defaults.currency': 'Default currency',
  'settings.defaults.currency_help': 'The ledger\'s base currency. Entries in other currencies keep their own amounts and are converted at the rate on their date.',
  'settings.defaults.locale': 'Locale',
  'settings.defaults.locale_help': 'How numbers, currencies and dates are written. Starts as your browser\'s language.',

  'settings.folder.title': 'Local folder',
  'settings.folder.lede': 'Keep a copy of your Slopographic settings in a folder on this computer. It is the same folder Slop Drive uses, so you can connect it in either place. Files are written only into that folder, and nothing is sent anywhere.',
  'settings.folder.see_files': 'To see the files in this folder:',
  'settings.folder.open_drive': 'Open Slop Drive',

  'settings.storage.title': 'Storage',
  'settings.storage.lede': 'How much room this site uses in your browser, and what uses it. Your files, documents and saved projects are stored here too. Clearing a cache removes only what is made again when needed.',

  'settings.updates.title': 'Updates',
  'settings.updates.lede': 'Slopographic checks for a new version each time you open a page. If a page still looks old, load the latest version: the offline copies are fetched again and the page reloads. Your files, documents, settings and downloaded packs are kept.',
  'settings.updates.fresh': 'On any page, adding {fresh} to the address does the same.',
  'settings.updates.refresh': 'Load the latest version',

  'settings.rates.lede': 'Rates are entered by you, or downloaded on purpose from the European Central Bank. Nothing is downloaded unless you turn this on and press the button, or tick "Update on open".',
  'settings.rates.switch_help': 'Allows the Update button below to download the ECB\'s daily reference rates. Off by default.',
  'settings.rates.on_open': 'Update on open',
  'settings.rates.on_open_help': 'Download the ECB rates each time this page opens. Needs Exchange rates on.',
  'settings.rates.update': 'Update rates from the European Central Bank',
  'settings.rates.add_title': 'Add a rate',
  'settings.rates.base': 'Base',
  'settings.rates.quote': 'Quote',
  'settings.rates.date': 'Date',
  'settings.rates.rate': 'Rate',
  'settings.rates.note': 'Note',
  'settings.rates.save': 'Save rate',
  'settings.rates.explain': 'One unit of the base currency equals the rate in the quote currency. Saved rates cannot be edited; to correct one, add a new row for the date.',
  'settings.rates.recent': 'Recent rates',
  'settings.rates.pair': 'Pair',
  'settings.rates.source': 'Source',

  'settings.apps.lede': 'Options for each app. Changing one here only changes that app, unless its section says it is shared (face detection is shared by Slop Drive and Slop Gallery). Reset an app to go back to its own defaults.',
  'settings.donate.lede': 'Slopographic is free to use. If you want to help keep it going, you can leave a tip in the Tip jar.',
});
