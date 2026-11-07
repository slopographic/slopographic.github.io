/* The iPhone and iPad app's own wording, English: a website line that talks about "the browser", Chrome or Edge, or
 * where the site is hosted reads like this in the App Store app instead. Each key is native.app.<the website's key>;
 * shared/i18n/i18n.js (appWord) reads it in the app only, so the website keeps its words. Other languages without a
 * table read English here. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  // the homepage and the footer
  'native.app.hero.accent': 'free on your device.',
  'native.app.plain.hero.title': 'Business and office tools that run on your device',
  'native.app.home.why_backup_d': 'Slop Drive saves everything your apps store on this device as a single .slop file.',
  'native.app.footer.office': 'Office and creative software that runs on your device.',
  'native.app.footer.creative': 'Creative software that runs on your device.',
  'native.app.mascot.tip_local': 'Your files stay on this device. Keep a backup now and then.',
  // the first-use notice and the notices of the engines that download first
  'native.app.ui.firstrun.privacy': 'Your files stay on this device. Nothing is uploaded, and there is no server or backend storage.',
  'native.app.ui.firstrun.download_one': 'This is downloaded once, {size}, from {brand}\'s file host and kept on this device for next time.',
  'native.app.ui.firstrun.download_many': 'These are downloaded once, about {size} in all, from {brand}\'s file host and kept on this device for next time.',
  'native.app.ui.firstrun.heic_text': 'Converting a HEIC photo needs the HEIC decoder (libheif, LGPL-3.0 licence). It is downloaded once from {brand}\'s file host, checked, and kept on this device. Your photos are never uploaded.',
  'native.app.ui.firstrun.raw_text': 'Developing a camera RAW photo needs the RAW engine (LibRaw, LGPL-2.1 or CDDL-1.0 licence). It is downloaded once from {brand}\'s file host, checked, and kept on this device.',
  'native.app.ui.firstrun.d3_text': 'This model is compressed. Reading it needs a decoder, which is downloaded once from {brand}\'s file host and kept on this device. The model itself is still read on this device and never uploaded.',
  'native.app.ui.ops.isolate.notice_line': 'Remove background runs an AI model on your device, the one SlopIsolate uses.',
  'native.app.ui.ops.upscale.notice_line': 'Upscale enlarges pictures with Slop Upscale’s models, which run on your device.',
  'native.app.ui.ops.speech.notice_line': 'The words are read by Whisper, an open speech model, here on your device. The sound never leaves this device.',
  // shared parts of every app
  'native.app.ui.drop.private': 'Everything happens on this device: nothing is uploaded, and your files stay private.',
  'native.app.ui.buddy.tip.local': 'Everything here runs on your device. No uploads. No watermarks.',
  'native.app.ui.dpick.note': 'Files shared between {brand} apps. Stored only on this device.',
  'native.app.ui.backup.intro': 'Everything you make in {brand} lives on this device. Deleting the app can delete it, so keep a backup.',
  // Settings
  'native.app.settings.page.privacy': 'Slopographic runs on your device and your files never leave it. Your choices on this page are stored in the app and nowhere else. Analytics and ads are off until you turn them on, and no third-party script loads until you do. You can change this at any time.',
  'native.app.storage.unknown': 'The system does not say how much the app uses.',
  'native.app.storage.kept': 'Kept: the system will not clear your files to free space.',
  'native.app.storage.not_kept': 'Not kept yet: the system may clear your files when the device runs low on space.',
  'native.app.storage.granted': 'Done. The system will keep your files and will not clear them to free space.',
  'native.app.storage.denied': 'The system did not promise to keep your files. It may clear them when the device runs low on space, so keep a backup.',
  'native.app.storage.unsupported': 'The system cannot promise to keep your files here. Keep a backup.',
  // Slop Drive (the Files app)
  'native.app.drive.empty.drive_p': 'Drop files here, upload a folder, or use “Send to…” in any Slopographic app. Everything stays on this device.',
  'native.app.drive.side.meter_note': 'Slop Drive: {size}. Everything stays on this device.',
  // SlopIsolate (the background remover)
  'native.app.cutout.app.empty_lead': 'The AI cuts out the subject right on your device.',
  'native.app.cutout.app.notice_line1': 'Slop Isolate removes the background from a picture with an AI model that runs on your device.',
  'native.app.cutout.app.clear_saved_tip': 'Remove the saved work in this app',
  'native.app.cutout.app.clear_saved_ask': 'Clear the saved work? The images and masks saved in this app will be removed.',
  'native.app.cutout.app.not_image_file': 'This file is not an image the app can read',
});
