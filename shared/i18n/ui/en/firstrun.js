/* Shared components, English: the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that
 * download before they start (HEIC, camera RAW, 3D decoders). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  'ui.firstrun.privacy': 'Your files stay in this browser. Nothing is uploaded: the site is hosted on GitHub Pages and has no server or backend storage.',
  'ui.firstrun.download_one': 'This is downloaded once, {size}, and kept by this browser for next time.',
  'ui.firstrun.download_many': 'These are downloaded once, about {size} in all, and kept by this browser for next time.',
  'ui.firstrun.continue': 'Continue',
  'ui.firstrun.heic_title': 'Download the HEIC photo decoder?',
  'ui.firstrun.heic_text': 'This browser cannot open HEIC photos (the iPhone format) by itself, so converting one needs the HEIC decoder (libheif, compiled to run in your browser; LGPL-3.0 licence). It is downloaded once from {brand}\'s file store, checked, and kept in this browser. Your photos are never uploaded.',
  'ui.firstrun.heic_name': 'HEIC photo decoder (libheif {version})',
  'ui.firstrun.raw_title': 'Download the camera RAW engine?',
  'ui.firstrun.raw_text': 'Developing a camera RAW photo needs the RAW engine (LibRaw, compiled to run in your browser; LGPL-2.1 or CDDL-1.0 licence). It is downloaded once from {brand}\'s file store, checked, and kept in this browser.',
  'ui.firstrun.raw_name': 'Camera RAW engine (LibRaw {version})',
  'ui.firstrun.d3_title': 'Download the 3D decoder?',
  'ui.firstrun.d3_text': 'This model is compressed. Reading it needs a decoder, which is downloaded once from the {brand} cdn and kept by this browser. The model itself is still read on this device and never uploaded.',
});
