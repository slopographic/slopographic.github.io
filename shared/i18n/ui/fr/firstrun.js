/* Shared components, French: l’avis de première utilisation (shared/firstrun/notice.js) et les avis des moteurs communs qui se téléchargent avant de démarrer (HEIC, RAW d’appareil photo, décodeurs 3D). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('fr', {
  'ui.firstrun.privacy': 'Vos fichiers restent dans ce navigateur. Rien n’est envoyé : le site est hébergé sur GitHub Pages et n’a ni serveur ni stockage côté serveur.',
  'ui.firstrun.download_one': 'Ceci est téléchargé une seule fois, {size}, et conservé par ce navigateur pour la prochaine fois.',
  'ui.firstrun.download_many': 'Ceux-ci sont téléchargés une seule fois, environ {size} au total, et conservés par ce navigateur pour la prochaine fois.',
  'ui.firstrun.continue': 'Continuer',
  'ui.firstrun.heic_title': 'Télécharger le décodeur de photos HEIC ?',
  'ui.firstrun.heic_text': 'Ce navigateur ne sait pas ouvrir seul les photos HEIC (le format de l’iPhone) ; leur conversion demande donc le décodeur HEIC (libheif, compilé pour tourner dans votre navigateur ; licence LGPL-3.0). Il est téléchargé une seule fois depuis le stockage de fichiers de {brand}, vérifié, puis conservé dans ce navigateur. Vos photos ne sont jamais envoyées.',
  'ui.firstrun.heic_name': 'Décodeur de photos HEIC (libheif {version})',
  'ui.firstrun.raw_title': 'Télécharger le moteur RAW des appareils photo ?',
  'ui.firstrun.raw_text': 'Développer une photo RAW d’appareil photo demande le moteur RAW (LibRaw, compilé pour tourner dans votre navigateur ; licence LGPL-2.1 ou CDDL-1.0). Il est téléchargé une seule fois depuis le stockage de fichiers de {brand}, vérifié, puis conservé dans ce navigateur.',
  'ui.firstrun.raw_name': 'Moteur RAW d’appareil photo (LibRaw {version})',
  'ui.firstrun.d3_title': 'Télécharger le décodeur 3D ?',
  'ui.firstrun.d3_text': 'Ce modèle est compressé. Le lire demande un décodeur, téléchargé une seule fois depuis le CDN de {brand} et conservé par ce navigateur. Le modèle lui-même est toujours lu sur cet appareil et n’est jamais envoyé.',
});
