/* Settings, 한국어: the page's own text (settings/index.html). The section titles shared with the chrome stay in
 * shared/i18n/strings.js. Same keys as settings/i18n/en/page.js. Rules: shared/i18n/APPS-HOWTO.md. Terms: shared/i18n/glossary-ko.md. */
window.SlopI18n && window.SlopI18n.add('ko', {
  'settings.page.kicker': '설정',
  'settings.page.home_aria': '{brand}, 홈',
  'settings.page.sections': '섹션',
  'settings.page.title_lead': '나의',
  'settings.page.title_em': '선택',
  'settings.page.privacy': 'Slopographic은 브라우저에서 실행되며, 파일은 기기를 벗어나지 않습니다. 이 페이지에서 한 선택은 이 브라우저의 로컬 저장소에만 저장되고 다른 곳에는 저장되지 않습니다. 분석과 광고는 직접 켜기 전까지 꺼져 있으며, 제3자 스크립트도 켜기 전에는 불러오지 않습니다. 언제든지 바꿀 수 있습니다.',
  'settings.page.agents': 'AI 에이전트',

  'settings.consent.analytics': '분석',
  'settings.consent.analytics_help': 'Google Analytics 4가 페이지 조회수를 집계하여 사람들이 어떤 앱을 쓰는지 알 수 있게 합니다. 기본값은 꺼짐입니다.',
  'settings.consent.ads': '광고',
  'settings.consent.ads_help': 'Google AdSense가 일부 페이지에 광고를 표시할 수 있습니다. 기본값은 꺼짐입니다.',

  'settings.defaults.lede': '새 청구서, 주문, 분개와 숫자, 통화, 날짜에 사용합니다. 이 설정으로 앱 텍스트의 언어는 바뀌지 않습니다.',
  'settings.defaults.currency': '기본 통화',
  'settings.defaults.currency_help': '원장의 기준 통화입니다. 다른 통화의 항목은 원래 금액을 유지하며, 날짜의 환율로 환산합니다.',
  'settings.defaults.locale': '지역',
  'settings.defaults.locale_help': '숫자, 통화와 날짜를 표시하는 방식입니다. 브라우저의 언어로 시작합니다.',

  'settings.folder.title': '로컬 폴더',
  'settings.folder.lede': '이 컴퓨터의 폴더에 Slopographic 설정 사본을 보관합니다. Slop Drive가 쓰는 폴더와 같으므로 어느 쪽에서든 연결할 수 있습니다. 파일은 이 폴더에만 기록되며, 어디에도 전송되지 않습니다.',
  'settings.folder.see_files': '이 폴더의 파일을 보려면:',
  'settings.folder.open_drive': 'Slop Drive 열기',

  'settings.storage.title': '저장공간',
  'settings.storage.lede': '이 사이트가 브라우저에서 차지하는 공간과 그 내용입니다. 파일, 문서와 저장된 프로젝트도 여기에 저장됩니다. 캐시를 지우면 필요할 때 다시 만들어지는 항목만 제거됩니다.',

  'settings.updates.title': '업데이트',
  'settings.updates.lede': '페이지를 열 때마다 Slopographic은 새 버전이 있는지 확인합니다. 페이지가 아직 예전 모습이면 최신 버전을 불러오세요. 오프라인 사본을 다시 받아 페이지를 새로 고칩니다. 파일, 문서, 설정과 다운로드한 팩은 유지됩니다.',
  'settings.updates.fresh': '아무 페이지에서나 주소에 {fresh}를 추가해도 같은 동작을 합니다.',
  'settings.updates.refresh': '최신 버전 불러오기',

  'settings.rates.lede': '환율은 직접 입력하거나, 유럽중앙은행(ECB)에서 의도적으로 다운로드할 수 있습니다. 이 기능을 켜고 버튼을 누르거나 “열 때 업데이트”를 체크하기 전에는 아무것도 다운로드하지 않습니다.',
  'settings.rates.switch_help': '아래 업데이트 버튼이 ECB의 일일 기준 환율을 다운로드할 수 있게 합니다. 기본값은 꺼짐입니다.',
  'settings.rates.on_open': '열 때 업데이트',
  'settings.rates.on_open_help': '이 페이지를 열 때마다 ECB 환율을 다운로드합니다. 환율 기능이 켜져 있어야 합니다.',
  'settings.rates.update': '유럽중앙은행에서 환율 업데이트',
  'settings.rates.add_title': '환율 추가',
  'settings.rates.base': '기준',
  'settings.rates.quote': '대상',
  'settings.rates.date': '날짜',
  'settings.rates.rate': '환율',
  'settings.rates.note': '메모',
  'settings.rates.save': '환율 저장',
  'settings.rates.explain': '기준 통화 1단위는 대상 통화의 환율과 같습니다. 저장된 환율은 수정할 수 없으므로, 고치려면 해당 날짜의 새 행을 추가하세요.',
  'settings.rates.recent': '최근 환율',
  'settings.rates.pair': '통화쌍',
  'settings.rates.source': '출처',

  'settings.apps.lede': '각 앱의 옵션입니다. 여기서 바꾸면 해당 앱만 바뀌며, 섹션에서 공유된다고 밝힌 경우는 예외입니다(얼굴 인식은 Slop Drive와 Slop Gallery가 함께 씁니다). 앱을 초기화하면 그 앱의 기본값으로 돌아갑니다.',
  'settings.donate.lede': 'Slopographic은 무료로 쓸 수 있습니다. 계속 운영하는 데 도움을 주고 싶다면 팁 항아리에 후원할 수 있습니다.',
});
