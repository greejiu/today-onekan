# 할일·습관 직접 진입 검증

- 기준: 최신 origin/main e2c1bc1b47e39c8fa9193983484ea8a6ab3f1dfd. 기존 로컬 변경 보존, 관련 없는 습관 프로젝트명 표시 변경은 푸시에서 제외.
- index.html: 전체 메뉴에 할일·습관 직접 연결. 통합 작업 제목·전환부·활성화 예외 제거. 로컬의 마지막 작업 종류 기억 및 제목 영역으로 추가 버튼을 이동하던 이벤트 제거. 기존 제목·추가 버튼 재사용. work 식별자와 모바일 탐색 유지.
- tests/sidebar-navigation.cjs, tests/schedule-sidebar.cjs: 새 메뉴 순서와 개별 진입에 맞춰 기존 기대값 최소 수정.
- tests/direct-navigation.cjs: 직접 진입, 단일 제목, 과거 작업 종류 설정 무시, 하위 필터 보존, 추가창 입력 보존 검증 추가.

격리된 기존 fixture로 Chrome headless 실행. 모든 외부 요청 차단, 메모리 데이터만 사용.

통과: sidebar-navigation, schedule-sidebar, direct-navigation, tag-terminology, project-today. 최종 main 기반 푸시 대상 HTML에서 앞의 세 검증 재실행.

확인: 정확한 메뉴·구분선, 개별 활성화, 일정 진입·뒤로가기와 보기·스크롤·필터 보존, 목표 화면 프로젝트 접근·연결·수정, 기존 태그 저장·이름·색상·보관, 모바일 빠른 추가, 1366×768/1440×900/낮은 창/390px/760px/761px, 모바일 더보기 유지, 추가창 입력 보존, 세 테마, 중복 ID 없음, pageerror 없음, 탐색·취소만으로 DB 쓰기 없음.

미검증: 실제 DB·실기기, 모든 할일·습관 추가/수정/완료/반복/보관/기록 조합의 전체 회귀. 통합 작업 설계를 전제로 한 기존 로컬 task-management.cjs는 이번 설계에서 기대값이 유효하지 않아 실행하지 않고 보존.

화면 근거: test-results/direct-sidebar.png, direct-todos-1366.png, direct-habits-1366.png, direct-mobile-390.png (가짜 테스트 데이터).
