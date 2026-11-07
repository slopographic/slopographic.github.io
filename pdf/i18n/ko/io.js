/* Slop PDF, 한국어: opening, saving and extracting (errors, skipped items, change labels) and the Layers panel names (pdf/js/io, pdf/js/core). Same keys as pdf/i18n/en/io.js. Rules: shared/i18n/APPS-HOWTO.md. Terms: shared/i18n/glossary-ko.md. */
window.SlopI18n && window.SlopI18n.add('ko', {
  // core/fonts-custom.js
  'pdf.core.font_missing': '{family}이(가) 설치되어 있지 않습니다.',

  // core/layers.js
  'pdf.core.layer_numbered': '{name} {n}',
  'pdf.core.layer_step_n': '단계 {n}',
  'pdf.core.layer_text': '텍스트',
  'pdf.core.layer_callout': '설명 상자',
  'pdf.core.layer_comment': '댓글',
  'pdf.core.layer_rect': '사각형',
  'pdf.core.layer_ellipse': '타원',
  'pdf.core.layer_line': '선',
  'pdf.core.layer_arrow': '화살표',
  'pdf.core.layer_drawing': '그리기',
  'pdf.core.layer_highlighter': '형광펜',
  'pdf.core.layer_highlight': '강조',
  'pdf.core.layer_texthl': '텍스트 강조',
  'pdf.core.layer_whiteout': '흰색 덮기',
  'pdf.core.layer_image': '이미지',
  'pdf.core.layer_redaction': '교정',
  'pdf.core.layer_step': '단계',
  'pdf.core.layer_paragraph': '단락',
  'pdf.core.layer_signature': '서명',
  'pdf.core.layer_item': '항목',

  // core/pdf-parts.js
  'pdf.io.meta_pages': '{list} 페이지',
  'pdf.io.meta_page': '{n}페이지',
  'pdf.io.font_stream_raw': '이 글꼴 스트림은 해석되지 않는 방식으로 저장되어 있습니다',
  'pdf.io.not_embedded': '포함되지 않음',
  'pdf.io.font_composite': '복합 ({type})',
  'pdf.io.not_decoded': '해석되지 않음',
  'pdf.io.image_undecodable': '이미지 데이터의 압축을 풀 수 없습니다',
  'pdf.io.image_no_size': '이미지에 크기가 없습니다',
  'pdf.io.image_short': '이미지 데이터가 크기보다 짧습니다',
  'pdf.io.att_raw': '이 첨부 파일은 해석되지 않는 방식으로 저장되어 있습니다',

  // core/pdfjs.js
  'pdf.core.needs_password': '이 PDF에는 비밀번호가 필요합니다.',
  'pdf.core.err_invalid': '“{name}”은(는) 올바른 PDF가 아니거나 복구할 수 없을 만큼 손상되었습니다.',
  'pdf.core.err_empty': '“{name}”이(가) 비어 있습니다.',
  'pdf.core.err_password': '“{name}”에는 올바른 비밀번호가 필요합니다.',
  'pdf.core.err_open': '“{name}”을(를) 열 수 없습니다: {msg}',
  'pdf.core.unsupported_encryption': '지원하지 않는 암호화',
  'pdf.core.writer_missing': 'PDF 작성기를 불러오지 못했습니다.',

  // io/assets-model.js
  'pdf.io.unknown': '알 수 없음',
  'pdf.io.none': '없음',
  'pdf.io.skip_stencil': '스텐실 마스크(1비트)는 해석되지 않습니다',
  'pdf.io.skip_jpx': 'JPEG 2000 이미지는 해석되지 않습니다',
  'pdf.io.skip_jbig2': 'JBIG2 이미지는 해석되지 않습니다',
  'pdf.io.skip_ccitt': 'CCITT 팩스 이미지는 해석되지 않습니다',
  'pdf.io.skip_filter': '필터 {filter}는 해석되지 않습니다',
  'pdf.io.skip_raw': '이 종류의 압축되지 않은 이미지는 해석되지 않습니다',
  'pdf.io.skip_bpc': '{bpc}비트 샘플은 해석되지 않습니다',
  'pdf.io.skip_palette': '{cs}의 팔레트는 해석되지 않습니다',
  'pdf.io.skip_colour': '색 공간 {cs}은(는) 해석되지 않습니다',
  'pdf.io.mask_excluded': '마스크 제외됨',
  'pdf.io.font_not_embedded': '포함되지 않음: PDF는 글꼴을 참조만 하므로 저장할 파일이 없습니다',
  'pdf.io.font_subset': '일부만 포함: 불완전할 수 있음',
  'pdf.io.att_on_page': '{n}페이지에 첨부됨',
  'pdf.io.att_document': '문서에 첨부됨',
  'pdf.io.att_einvoice': '전자 청구서 (ZUGFeRD / Factur-X)',
  'pdf.io.att_rel': '관계: {rel}',

  // io/assets-save.js
  'pdf.io.assets_name': 'PDF 자산',
  'pdf.io.no_font_file': '포함되지 않아 글꼴 파일이 없습니다',

  // io/decrypt.js
  'pdf.io.crypto_load_failed': 'PDF 비밀번호 코드를 불러올 수 없습니다.',
  'pdf.io.crypto_not_loaded': 'PDF 비밀번호 코드가 불러와지지 않았습니다.',

  // io/doc-changes.js
  'pdf.io.changes_replayed': '저장된 변경 사항 다시 적용',

  // io/edit-log.js
  'pdf.io.log_found_title': '저장된 편집 내용 발견',
  'pdf.io.log_found_body': 'Slop PDF가 이 기기에 “{name}”에 대한 편집 {n}개를 보관하고 있습니다. 이 파일에 다시 적용하거나 버릴 수 있습니다. 저장이나 내보내기는 어느 쪽이든 새 PDF를 만듭니다.',
  'pdf.io.log_discard': '버리기',
  'pdf.io.log_replay': '다시 적용',
  'pdf.io.log_replayed': '저장된 편집 다시 적용',

  // io/export.js
  'pdf.io.no_pages': '내보낼 페이지가 없습니다.',
  'pdf.io.redact_pending': '{n}개 영역이 교정으로 표시되었지만 아직 교정되지 않았습니다. 교정을 열고 “교정 적용”을 고르거나 표시를 지우세요.',
  'pdf.io.source_missing': '원본 파일이 없습니다.',
  'pdf.io.locked': '“{name}”은(는) Slop PDF가 제거할 수 없는 암호화({why})를 사용하므로 페이지를 내보낼 수 없습니다.',

  // io/ocg.js
  'pdf.io.layer': '레이어',
  'pdf.io.layer_hide': '“{name}” 레이어 숨기기',
  'pdf.io.layer_show': '“{name}” 레이어 표시',
  'pdf.io.layer_delete': '“{name}” 레이어 삭제',

  // io/sample.js
  'pdf.io.sample_busy_playful': '끈적이는 새 샘플을 섞는 중…',
  'pdf.io.sample_busy_plain': '샘플을 만드는 중…',

  // io/session.js
  'pdf.io.restore': '복원',
  'pdf.io.close_all': '모두 닫기',
});
