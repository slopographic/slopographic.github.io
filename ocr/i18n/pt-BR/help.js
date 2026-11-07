/* Slop OCR, Brazilian Portuguese: the help text on languages, the models, the PDF text layer and accuracy. Same keys as ocr/i18n/en/help.js. Terms: shared/i18n/glossary-pt-BR.md. */
window.SlopI18n && window.SlopI18n.add('pt-BR', {
  'ocr.help.summary': 'Idiomas, os modelos e a camada de texto do PDF',
  'ocr.help.lang_h': 'Idiomas.',
  'ocr.help.lang': ' Clique em Idioma e modelo para escolher o idioma do texto. Um modelo lê cada escrita: alfabeto latino com seus acentos (sueco å ä ö, alemão, francês, espanhol, polonês, tcheco, romeno, turco e cerca de 50 outros), chinês (simplificado e tradicional) e japonês; cirílico (russo, ucraniano, búlgaro, sérvio, cazaque …); escrita árabe (árabe, persa, urdu …); devanágari (hindi, marata, nepalês); coreano; grego; tailandês; tâmil; télugu. Sem uma escolha, o modelo incluído lê primeiro chinês e inglês (outros textos latinos perdem os acentos), e uma linha embaixo do texto oferece o modelo certo quando o texto parece ser de outra escrita.',
  'ocr.help.models_h': 'Os modelos.',
  'ocr.help.models': ' PaddleOCR (PP-OCRv4, PP-OCRv5 e PP-OCRv6), Apache 2.0. Cada um é baixado somente quando você clica em Baixar no diálogo Idioma e modelo, que informa o tamanho e a licença. Nada é baixado sozinho, e os arquivos são verificados antes de serem guardados neste dispositivo.',
  'ocr.help.pdf_h': 'PDF pesquisável.',
  'ocr.help.pdf': ' A imagem de cada página é mantida, com uma camada de texto invisível por cima, para que você possa pesquisar e selecionar o texto. A fonte padrão do PDF desenha só letras latinas, então os caracteres que ela não consegue desenhar ficam de fora da camada de texto (a imagem ainda os mostra). O texto é posicionado na posição de cada linha; se você adicionar ou remover linhas, as linhas extras ficam abaixo da última caixa.',
  'ocr.help.acc_h': 'Precisão.',
  'ocr.help.acc': ' Confira o texto antes de usá-lo. Só linhas horizontais são lidas; o texto girado não é endireitado antes.',
});
