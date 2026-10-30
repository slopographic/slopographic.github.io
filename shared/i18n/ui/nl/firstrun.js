/* Shared components, Dutch: de melding bij het eerste gebruik (shared/firstrun/notice.js) en de meldingen van de gedeelde engines die eerst downloaden voordat ze starten (HEIC, camera-RAW, 3D-decoders). Terms: shared/i18n/glossary-nl.md. */
window.SlopI18n && window.SlopI18n.add('nl', {
  'ui.firstrun.privacy': 'Je bestanden blijven in deze browser. Er wordt niets geüpload: de site staat op GitHub Pages en heeft geen server of opslag in de backend.',
  'ui.firstrun.download_one': 'Dit wordt één keer gedownload, {size}, en door deze browser bewaard voor de volgende keer.',
  'ui.firstrun.download_many': 'Deze worden één keer gedownload, ongeveer {size} in totaal, en door deze browser bewaard voor de volgende keer.',
  'ui.firstrun.continue': 'Doorgaan',
  'ui.firstrun.heic_title': 'De HEIC-foto-decoder downloaden?',
  'ui.firstrun.heic_text': 'Deze browser kan HEIC-foto’s (het iPhone-formaat) niet zelf openen, dus voor het converteren van een foto is de HEIC-decoder nodig (libheif, gecompileerd om in je browser te draaien; licentie LGPL-3.0). Die wordt één keer gedownload van de bestandsopslag van {brand}, gecontroleerd en in deze browser bewaard. Je foto’s worden nooit geüpload.',
  'ui.firstrun.heic_name': 'HEIC-foto-decoder (libheif {version})',
  'ui.firstrun.raw_title': 'De camera-RAW-engine downloaden?',
  'ui.firstrun.raw_text': 'Voor het ontwikkelen van een camera-RAW-foto is de RAW-engine nodig (LibRaw, gecompileerd om in je browser te draaien; licentie LGPL-2.1 of CDDL-1.0). Die wordt één keer gedownload van de bestandsopslag van {brand}, gecontroleerd en in deze browser bewaard.',
  'ui.firstrun.raw_name': 'Camera-RAW-engine (LibRaw {version})',
  'ui.firstrun.d3_title': 'De 3D-decoder downloaden?',
  'ui.firstrun.d3_text': 'Dit model is gecomprimeerd. Om het te lezen is een decoder nodig, die één keer wordt gedownload van de cdn van {brand} en door deze browser wordt bewaard. Het model zelf wordt nog steeds op dit apparaat gelezen en nooit geüpload.',
});
