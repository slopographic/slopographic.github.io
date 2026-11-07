/* Slop Press, English (the source of truth for the app's keys): About, the Fonts panel note and the fallback palette (ui/help.js). Every other language copies these
 * keys into press/i18n/<code>/help.js. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  'press.help.about_body': '{app} is a page layout app that runs entirely in your browser: spreads and master pages, threaded text frames with its own line breaker (greedy and Knuth–Plass), English hyphenation, paragraph and character styles, text wrap, and print-ready PDF with embedded, subset fonts, bleed and crop marks.',
  'press.help.about_privacy': 'Nothing is uploaded. Work is autosaved in this browser; save .slpress files to keep them. Fonts: the bundled Liberation Sans (embedded in PDFs), your system fonts, and any .ttf/.otf you load.',
  'press.help.about_keys': 'Press {key} to search every command.',
  'press.help.fonts_title': 'Fonts',
  'press.help.fonts_note': 'Downloads from the library are off in Slop Press: it embeds Liberation Sans and the font files you load into the document. Use the closest family, or add your own TTF or OTF file (WOFF is not supported yet).',
  'press.help.type_command': 'Type a command…',
  'press.help.search_title': 'Search Commands',
});
