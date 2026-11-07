/* Shared components, Korean: the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that download before they start (HEIC, camera RAW, 3D decoders). Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('ko', {
  'ui.firstrun.privacy': '파일은 이 브라우저에 그대로 남습니다. 아무것도 업로드되지 않습니다. 이 사이트는 GitHub Pages에서 호스팅되며 서버나 백엔드 저장소가 없습니다.',
  'ui.firstrun.download_one': '한 번만 다운로드하며, 크기는 {size}입니다. 이 브라우저가 다음번을 위해 보관합니다.',
  'ui.firstrun.download_many': '한 번만 다운로드하며, 전체 약 {size}입니다. 이 브라우저가 다음번을 위해 보관합니다.',
  'ui.firstrun.continue': '계속',
  'ui.firstrun.heic_title': 'HEIC 사진 디코더를 다운로드할까요?',
  'ui.firstrun.heic_text': '이 브라우저는 HEIC 사진(iPhone 형식)을 혼자서는 열 수 없으므로, 변환하려면 HEIC 디코더(libheif, 브라우저에서 실행되도록 컴파일됨, LGPL-3.0 라이선스)가 필요합니다. {brand}의 파일 저장소에서 한 번 다운로드해 검사한 뒤 이 브라우저에 보관합니다. 사진은 절대 업로드되지 않습니다.',
  'ui.firstrun.heic_name': 'HEIC 사진 디코더 (libheif {version})',
  'ui.firstrun.raw_title': '카메라 RAW 엔진을 다운로드할까요?',
  'ui.firstrun.raw_text': '카메라 RAW 사진을 현상하려면 RAW 엔진(LibRaw, 브라우저에서 실행되도록 컴파일됨, LGPL-2.1 또는 CDDL-1.0 라이선스)이 필요합니다. {brand}의 파일 저장소에서 한 번 다운로드해 검사한 뒤 이 브라우저에 보관합니다.',
  'ui.firstrun.raw_name': '카메라 RAW 엔진 (LibRaw {version})',
  'ui.firstrun.d3_title': '3D 디코더를 다운로드할까요?',
  'ui.firstrun.d3_text': '이 모델은 압축되어 있습니다. 읽으려면 디코더가 필요하며, {brand} CDN에서 한 번 다운로드해 이 브라우저에 보관합니다. 모델 자체는 이 기기에서만 읽히며 업로드되지 않습니다.',
});
