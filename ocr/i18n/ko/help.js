/* Slop OCR, Korean: the help box under the text (languages, the models, the PDF text layer, accuracy). Same keys as ocr/i18n/en/help.js. Terms: shared/i18n/glossary-ko.md. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('ko', {
  'ocr.help.summary': '언어, 모델 및 PDF 텍스트 층',
  'ocr.help.lang_h': '언어.',
  'ocr.help.lang': ' 언어 및 모델을 눌러 텍스트의 언어를 고르세요. 문자 체계마다 모델 하나가 읽습니다: 악센트가 있는 라틴 문자(스웨덴어 å ä ö, 독일어, 프랑스어, 스페인어, 폴란드어, 체코어, 루마니아어, 터키어 등 약 50개 언어), 중국어(간체와 번체), 일본어; 키릴 문자(러시아어, 우크라이나어, 불가리아어, 세르비아어, 카자흐어 …); 아랍 문자(아랍어, 페르시아어, 우르두어 …); 데바나가리 문자(힌디어, 마라티어, 네팔어); 한국어; 그리스어; 태국어; 타밀어; 텔루구어. 고르지 않으면 기본 모델이 중국어와 영어를 먼저 읽습니다(다른 라틴 문자는 악센트를 잃습니다). 텍스트가 다른 문자 체계처럼 보이면 텍스트 아래 줄에서 알맞은 모델을 알려 줍니다.',
  'ocr.help.models_h': '모델.',
  'ocr.help.models': ' PaddleOCR (PP-OCRv4, PP-OCRv5, PP-OCRv6), Apache 2.0 라이선스. 언어 및 모델 대화 상자에서 다운로드를 누를 때만 각 모델을 다운로드하며, 이 대화 상자에 크기와 라이선스가 표시됩니다. 자동으로 다운로드하는 파일은 없으며, 파일은 이 기기에 저장하기 전에 검사됩니다.',
  'ocr.help.pdf_h': '검색 가능한 PDF.',
  'ocr.help.pdf': ' 각 페이지의 그림을 유지하고 그 위에 보이지 않는 텍스트 층을 올려, 텍스트를 검색하고 선택할 수 있습니다. 표준 PDF 글꼴은 라틴 문자만 그리므로, 그리지 못하는 문자는 텍스트 층에서 빠집니다(그림에는 그대로 보입니다). 텍스트는 각 줄의 위치에 놓이며, 줄을 추가하거나 삭제하면 추가된 줄은 마지막 상자 아래에 놓입니다.',
  'ocr.help.acc_h': '정확도.',
  'ocr.help.acc': ' 사용하기 전에 텍스트를 확인하세요. 가로 줄만 읽으며, 회전된 텍스트는 먼저 돌리지 않습니다.',
});
