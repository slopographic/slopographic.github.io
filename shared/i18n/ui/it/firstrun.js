/* Componenti condivisi, italiano: l’avviso al primo uso (shared/firstrun/notice.js) e gli avvisi dei motori condivisi che
 * scaricano prima di partire (HEIC, RAW delle fotocamere, decodificatori 3D). Regole: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('it', {
  'ui.firstrun.privacy': 'I tuoi file restano in questo browser. Non viene caricato nulla: il sito è ospitato su GitHub Pages e non ha server né archiviazione lato server.',
  'ui.firstrun.download_one': 'Viene scaricato una sola volta, {size}, e conservato da questo browser per la prossima volta.',
  'ui.firstrun.download_many': 'Vengono scaricati una sola volta, circa {size} in tutto, e conservati da questo browser per la prossima volta.',
  'ui.firstrun.continue': 'Continua',
  'ui.firstrun.heic_title': 'Scarica il decodificatore di foto HEIC?',
  'ui.firstrun.heic_text': 'Questo browser non sa aprire da solo le foto HEIC (il formato dell’iPhone), quindi per convertirne una serve il decodificatore HEIC (libheif, compilato per funzionare nel browser; licenza LGPL-3.0). Viene scaricato una sola volta dall’archivio file di {brand}, controllato, e conservato in questo browser. Le tue foto non vengono mai caricate.',
  'ui.firstrun.heic_name': 'Decodificatore di foto HEIC (libheif {version})',
  'ui.firstrun.raw_title': 'Scarica il motore RAW delle fotocamere?',
  'ui.firstrun.raw_text': 'Per sviluppare una foto RAW di fotocamera serve il motore RAW (LibRaw, compilato per funzionare nel browser; licenza LGPL-2.1 o CDDL-1.0). Viene scaricato una sola volta dall’archivio file di {brand}, controllato, e conservato in questo browser.',
  'ui.firstrun.raw_name': 'Motore RAW delle fotocamere (LibRaw {version})',
  'ui.firstrun.d3_title': 'Scarica il decodificatore 3D?',
  'ui.firstrun.d3_text': 'Questo modello è compresso. Per leggerlo serve un decodificatore, che viene scaricato una sola volta dalla CDN di {brand} e conservato da questo browser. Il modello stesso viene comunque letto su questo dispositivo e non viene mai caricato.',
});
