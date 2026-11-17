/* Shared components, Swedish: the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that
 * download before they start (HEIC, camera RAW, 3D decoders). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('sv', {
  'ui.firstrun.privacy': 'Dina filer stannar i den här webbläsaren. Inget laddas upp: webbplatsen ligger på GitHub Pages och har ingen server eller lagring på serversidan.',
  'ui.firstrun.download_one': 'Den laddas ned en gång, {size}, och sparas i webbläsaren till nästa gång.',
  'ui.firstrun.download_many': 'De laddas ned en gång, ungefär {size} totalt, och sparas i webbläsaren till nästa gång.',
  'ui.firstrun.continue': 'Fortsätt',
  'ui.firstrun.heic_title': 'Ladda ned HEIC-avkodaren?',
  'ui.firstrun.heic_text': 'Den här webbläsaren kan inte öppna HEIC-foton (iPhone-formatet) själv, så för att konvertera ett behövs HEIC-avkodaren (libheif, kompilerad för att köras i webbläsaren; licens LGPL-3.0). Den laddas ned en gång från {brand}s fillager, kontrolleras och sparas i webbläsaren. Dina foton laddas aldrig upp.',
  'ui.firstrun.heic_name': 'HEIC-avkodare (libheif {version})',
  'ui.firstrun.raw_title': 'Ladda ned motorn för kamera-RAW?',
  'ui.firstrun.raw_text': 'För att framkalla ett RAW-foto från en kamera behövs RAW-motorn (LibRaw, kompilerad för att köras i webbläsaren; licens LGPL-2.1 eller CDDL-1.0). Den laddas ned en gång från {brand}s fillager, kontrolleras och sparas i webbläsaren.',
  'ui.firstrun.raw_name': 'RAW-motor för kameror (LibRaw {version})',
  'ui.firstrun.d3_title': 'Ladda ned 3D-avkodaren?',
  'ui.firstrun.d3_text': 'Modellen är komprimerad. För att läsa den behövs en avkodare, som laddas ned en gång från {brand}s cdn och sparas i webbläsaren. Själva modellen läses fortfarande på den här enheten och laddas aldrig upp.',
});
