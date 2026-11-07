/* File ocr, Italian: the help text on languages, models and the PDF text layer. Same keys as ocr/i18n/en/help.js. Terms: shared/i18n/glossary-it.md. */
window.SlopI18n && window.SlopI18n.add('it', {
  'ocr.help.summary': 'Lingue, modelli e strato di testo del PDF',
  'ocr.help.lang_h': 'Lingue.',
  'ocr.help.lang': ' Premi Lingua e modello per scegliere la lingua del testo. Un modello legge ogni sistema di scrittura: alfabeto latino con i suoi accenti (svedese å ä ö, tedesco, francese, spagnolo, polacco, ceco, rumeno, turco e circa altre 50), cinese (semplificato e tradizionale) e giapponese; cirillico (russo, ucraino, bulgaro, serbo, kazako …); alfabeto arabo (arabo, persiano, urdu …); devanagari (hindi, marathi, nepali); coreano; greco; thai; tamil; telugu. Senza una scelta, il modello incluso legge prima il cinese e l’inglese (il resto del testo latino perde gli accenti), e una riga sotto il testo propone il modello giusto quando il testo sembra in un altro sistema di scrittura.',
  'ocr.help.models_h': 'I modelli.',
  'ocr.help.models': ' PaddleOCR (PP-OCRv4, PP-OCRv5 e PP-OCRv6), Apache 2.0. Ogni modello si scarica solo quando premi Scarica nella finestra Lingua e modello, che indica dimensione e licenza. Non si scarica nulla da solo, e i file vengono controllati prima di essere conservati su questo dispositivo.',
  'ocr.help.pdf_h': 'PDF ricercabile.',
  'ocr.help.pdf': ' L’immagine di ogni pagina viene conservata, con sopra uno strato di testo invisibile, così puoi cercare e selezionare il testo. Il font PDF standard disegna solo lettere latine, quindi i caratteri che non sa disegnare vengono esclusi dallo strato di testo (l’immagine li mostra comunque). Il testo è posizionato nella posizione di ogni riga; se aggiungi o rimuovi righe, le righe in più finiscono sotto l’ultimo riquadro.',
  'ocr.help.acc_h': 'Precisione.',
  'ocr.help.acc': ' Controlla il testo prima di usarlo. Vengono lette solo le righe orizzontali; il testo ruotato non viene prima raddrizzato.',
});
