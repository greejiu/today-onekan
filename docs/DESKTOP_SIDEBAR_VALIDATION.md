# 데스크톱 사이드바 개편 검증 (2026-10-03)

## 기준과 변경

- `git fetch origin main`으로 원격 main을 직접 확인: `2e6c648a0363f55b84e07bedc9bf6b26e76f1eee`. 착수 시 HEAD도 같았고 작업 트리는 깨끗했다. 기존 브랜치와 커밋은 보존했다.
- `index.html`: 180px 사이드바에 지금한칸 / 시간추적 / 일정 / 작업 / 목표 / 같이한칸 / 기록 / 설정을 배치하고 세 구분선으로 네 그룹을 구분. 설정은 기록 바로 아래, 계정과 로그아웃만 하단. 전체 사이드바 스크롤과 flex 축소 방지로 낮은 창에서도 접근 가능.
- 메뉴는 기존 SVG와 활성 스타일을 사용하는 button으로 변경. Tab 이동, Enter/Space 실행, 포커스 표시와 실제 활성 상태의 aria-current 지원.
- 작업은 기존 todos/habits에 데스크톱 제목과 할일·습관 전환 버튼만 추가. showPage()에서 사이드바의 todos 항목만 habits도 대표한다. 모바일 하단바와 더보기는 기존 대상·순서·표시를 유지한다.
- 목표는 기존 work 프로젝트 화면의 데스크톱 제목만 변경. 모바일 제목은 작업. renderWork(), workSelectedId, 프로젝트 DOM ID 및 project_id 연결은 유지.
- 모바일 760px 경계, 64/120px 상단 높이, 본문 여백, safe-area, 900/1100/1180px 조건, 빠른 입력 이벤트, 일정 스크롤 복원, Together 연결은 유지. DB·인증·저장 로직 변경 없음. 타이머와 별도 목표 모델은 추가하지 않았다.

## 실행 결과

모두 통과. 실제 사용자 데이터에 접근하지 않는 기존 mock/PGlite 테스트를 사용했다.

- `node tests/home-layout.cjs`: 집 배치, 스크롤 복원, 드래그, 모바일 더보기와 추가·완료, 화면 접근, JavaScript 오류 없음.
- `node tests/project-today.cjs`: 1440px/390px 프로젝트 연결과 오늘하기·실행 취소·실패 복원·이름 변경·긴 제목.
- `node tests/together-ui.cjs`: 2인 공유·인증·상호 확인·점수/보상·교환일기, PNG 전달·기존 다운로드·사진·업로드 재시도·계정 변경·390px UI.
- `node tests/sidebar-navigation.cjs`: 정확한 메뉴·구분선·설정 위치, 1366×768/1440×900, 761/760/390px, 작업 전환, 화면 폭 변경 시 현재 페이지·입력·선택 프로젝트 유지, 키보드와 aria-current, 일정 달력/목록·선택·스크롤, 기록 진입, 1440×320 계정/로그아웃 스크롤 접근, 기본/검정/치즈 + 사용자 지정 Georgia 글꼴 메뉴 잘림 없음, 빠른 입력 양방향 동기화 및 오늘 추가, 탐색만으로 mockWrites 0, 중복 ID와 JavaScript 오류 없음.
- `git diff --check`: 통과.

실행 환경: Windows Chrome headless, Asia/Seoul. Playwright는 번들 NODE_PATH 사용. PGlite는 무시되는 `test-results/runtime/node_modules`에만 설치하여 기존 같이한칸 fixture를 실행했다. 운영 네트워크·DB·Storage 쓰기 없음.

## 화면 근거

스크린샷은 Git에서 제외되는 `test-results/`에 저장했다.

- `sidebar-1366x768.png`, `sidebar-1440x900.png`: 메뉴 순서·세 구분선·작업 활성·설정 위치와 전환 UI.
- `sidebar-761x768.png`, `sidebar-760x768.png`: 경계.
- `sidebar-390x844.png`, `sidebar-mobile-project.png`: 기존 모바일 습관·하단바·프로젝트 접근.
- `sidebar-short-account.png`: 낮은 창의 계정/로그아웃 접근.
- `sidebar-theme-white.png`, `sidebar-theme-black.png`, `sidebar-theme-cheese.png`: 테마와 사용자 지정 글꼴.
- `together-desktop.png`, `together-mobile-diary.png`, `together-image-composer-mobile.png`: 같이한칸 회귀 검증.

## 미검증

실제 휴대폰/Safari/Firefox, 모든 사용자 지정 글꼴, 운영 계정·배포 환경은 검증하지 않았다. 기존 할일·습관의 모든 CRUD·정렬·그룹 조합을 새로 전수 검사하지는 않았다. 관련 DOM·입력·ID·이벤트를 유지하고 기존 테스트와 이번 탐색 회귀 테스트로 변경 영향 범위를 확인했다.
