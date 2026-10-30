/* Slop PDF, 한국어: the find bar, the Replace dialog and the page grid (thumbnails, drag, keys, size). Same keys as pdf/i18n/en/find.js. Rules: shared/i18n/APPS-HOWTO.md. Terms: shared/i18n/glossary-ko.md. */
window.SlopI18n && window.SlopI18n.add('ko', {
  // find/bar.js
  'pdf.find.input': '문서에서 찾기',
  'pdf.find.match_case': '대소문자 구분',
  'pdf.find.whole_word': '온전한 단어',
  'pdf.find.prev_tip': '이전 (Shift+Enter)',
  'pdf.find.prev': '이전 일치 항목',
  'pdf.find.next_tip': '다음 (Enter)',
  'pdf.find.next': '다음 일치 항목',
  'pdf.find.list_tip': '결과 목록 보기',
  'pdf.find.list': '목록',
  'pdf.find.replace_tip': '문서에서 바꾸기',
  'pdf.find.replace': '바꾸기…',
  'pdf.find.close_tip': '닫기 (Esc)',
  'pdf.find.close': '찾기 닫기',
  'pdf.find.matches': '일치 항목',
  'pdf.find.page_short': '{page}페이지',

  // find/search.js
  'pdf.find.searching': '찾는 중…',
  'pdf.find.no_results': '결과 없음',
  'pdf.find.count': '{total}개 중 {cur}번째',

  // find/replace-ui.js
  'pdf.find.rep_find': '찾을 내용',
  'pdf.find.rep_with': '다음으로 바꾸기',
  'pdf.find.rep_go': '선택한 항목 바꾸기',
  'pdf.find.rep_go_n': '선택한 항목 바꾸기 ({n})',
  'pdf.find.rep_type': '찾을 텍스트를 입력하세요.',
  'pdf.find.rep_match': '일치 항목 {n} 바꾸기',
  'pdf.find.rep_unplaced': '위치를 정확히 찾을 수 없어 바꾸지 않았습니다',
  'pdf.find.rep_status': '{matches} · {n}개 선택됨',
  'pdf.find.rep_matches': '일치 항목 {n}개',
  'pdf.find.rep_none': '일치 항목이 없습니다.',
  'pdf.find.rep_done': '{total}개 중 {done}개를 바꿨습니다.',
  'pdf.find.rep_skipped': '{n}개는 바꾸지 않았습니다: 위치를 정확히 찾을 수 없습니다.',
  'pdf.find.rep_unticked': '{n}개는 선택하지 않은 채 남겼습니다.',
  'pdf.find.rep_wide': '{n}개는 원래보다 넓어서 근처 텍스트와 겹칠 수 있습니다.',
  'pdf.find.rep_unsupported': '일부 문자는 표준 글꼴에 없어 “?”로 썼습니다.',

  // find/replace.js
  'pdf.find.undo_replace': '“{text}” 바꾸기',

  // organize/grid.js
  'pdf.org.toggle_sel': '선택 전환',
  'pdf.org.rotate_left': '왼쪽으로 회전',
  'pdf.org.rotate_right': '오른쪽으로 회전',
  'pdf.org.open_page': '페이지 열기',
  'pdf.org.dup_page': '페이지 복제',
  'pdf.org.move_up': '위로 이동',
  'pdf.org.move_page_up': '페이지를 위로 이동',
  'pdf.org.move_down': '아래로 이동',
  'pdf.org.move_page_down': '페이지를 아래로 이동',
  'pdf.org.extract_page': '이 페이지 추출',
  'pdf.org.delete_page': '페이지 삭제',
  'pdf.org.src_blank': '빈 페이지',
  'pdf.org.src_file_page': '{file} · {page}p',
  'pdf.org.src_page': '{page}p',
  'pdf.org.thumb_blank': '{n}페이지, 빈 페이지',
  'pdf.org.thumb_from': '{n}페이지, {file}의 {page}페이지',
  'pdf.org.thumb_rotated': '{label}, {deg}° 회전',
  'pdf.org.blank_page': '빈 페이지',
  'pdf.org.thumb_title': '{file} — {page}페이지',
  'pdf.org.to_redact': '교정할 항목 {n}개',
  'pdf.org.redacted': '교정됨',

  // organize/drag.js
  'pdf.org.undo_move_page': '페이지 이동',
  'pdf.org.undo_move_pages': '페이지 {n}개 이동',
  'pdf.org.moved_page': '페이지를 {pos}번 위치로 옮겼습니다',
  'pdf.org.moved_pages': '페이지 {n}개를 {pos}번 위치로 옮겼습니다',

  // organize/keys.js
  'pdf.org.key_moved_page': '페이지를 {total}개 중 {pos}번 위치로 옮겼습니다',
  'pdf.org.key_moved_pages': '페이지 {n}개를 {total}개 중 {pos}번 위치로 옮겼습니다',

  // organize/zoom.js
  'pdf.org.thumb_size': '축소판 크기',
  'pdf.org.thumb_presets': '축소판 크기 프리셋',
  'pdf.org.thumb_size_n': '축소판 크기 {size}',
  'pdf.org.thumb_size_tip': '축소판 크기 (Ctrl + 휠 또는 페이지에서 핀치)',
  'pdf.org.one_per_row': '한 행에 한 페이지',
});
