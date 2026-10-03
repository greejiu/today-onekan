# 탐색 구조 2단계 검증

## 기준과 분리

- 기준 main: `8c731091243a262a5cf3e7469fcf8b7e5b05d959`.
- 기존 `codex/desktop-sidebar` 작업 폴더의 미커밋 날짜·시간 1단계 및 다른 변경을 유지했다. 별도 `codex/navigation-phase2` 작업 공간에서 이번 탐색 변경만 작성했다.
- 날짜·시간 1단계는 배포에 포함하지 않는다. 기존 컬럼·인증·권한·데이터 저장 코드를 변경하지 않으며 마이그레이션이 없다.

## 구조

- 고정 지금한칸과 구분선 / 모두·일정·할일·습관 / 목표·추적·기록 / 같이한칸·커뮤니티 / 설정. 각 묶음 사이 구분선을 둔다.
- `currentPage`와 `sidebarDedicated`를 분리한다. 공통 전용 틀의 전체 메뉴 버튼은 사이드바만 바꾸며 본문 렌더, 날짜·보기·필터·스크롤·입력 변경을 하지 않는다. 같은 활성 메뉴로 재진입해도 본문을 다시 그리지 않는다.
- 상단 지금한칸과 계정·로그아웃은 스크롤 영역 밖에 두고 전체 메뉴·전용 메뉴 내용만 스크롤한다.
- 일정의 기존 달력·목록·범주 눈 필터·수정은 기존 노드를 재사용한다. 할일·습관의 기존 본문 필터는 유지하고 전용 메뉴가 같은 필터 버튼을 호출한다. 정렬·그룹화·추가·수정 경로는 유지한다.
- 목표는 기존 `work`와 프로젝트/정체성, 기록은 기존 날짜별/항목별, 설정은 기존 프로필/꾸미기/사용 설정으로 연결한다. 추적은 기존 준비 상태를 유지한다. 태그·범주 명칭과 데이터 연결을 유지한다.
- 모두와 커뮤니티는 준비 안내만 제공한다. 모두의 달력·목록·보드·종류 필터는 정적 안내이며 데이터 조회·완료·공개 저장 기능이 없다.
- 같이한칸의 친구들·방명록·내 방은 제목·준비 안내만 제공한다. 비공개 방은 기존 `Together`를 사용한다. 최초 진입은 기존 비공개 방이며 공유 이미지 전달의 `showPage('together', true)`는 선택한 준비 화면과 관계없이 비공개 방을 연다.
- 모바일 하단바 및 760px 조건을 유지한다. 더보기의 기존 진입점을 유지하고 모두·커뮤니티를 추가한다. 같이한칸 본문 전환은 모바일에서도 제공한다. 숨겨진 탐색 요소의 포커스를 보이는 대응 요소로 옮기며 입력창은 유지한다.

## 실행 결과

모든 로컬 브라우저 테스트는 외부 요청을 차단하고 mock 데이터를 사용한다. `together-ui`는 로컬 PGlite의 기존 마이그레이션/RPC/RLS와 mock Auth/Storage를 사용한다. 운영 사용자 데이터를 변경하지 않는다.

- `tests/common-navigation.cjs`: 모든 페이지 전용 틀·고정 지금한칸, 본문 HTML/스크롤/페이지 유지, 기존 필터 동기화, 준비 화면, 공유 이미지 비공개 진입, 키보드·포커스, 모바일 접근, 탐색 쓰기 0, 중복 ID 0, 새 JavaScript/콘솔 오류 0.
- `tests/sidebar-navigation.cjs`: 정확한 메뉴·구분선, 기존 탐색·모바일 빠른 입력, 목표 상세 선택, 테마·낮은 창 스크롤·계정 영역.
- `tests/direct-navigation.cjs`: 할일/습관 직접 진입, 필터·입력 유지, 불필요한 기존 통합 작업 전환 없음.
- `tests/schedule-sidebar.cjs`: 월·선택 날짜·보기·스크롤, 범주 눈 필터·수정·저장 실패 입력, 계정별 필터, 기존 일정 추가·수정.
- `tests/project-today.cjs`: 프로젝트 상세·연결·이름 수정·오늘하기·취소·저장 실패·390px.
- `tests/home-layout.cjs`: 기존 지금한칸 보기·날짜·스크롤·드래그·모바일 진입.
- `tests/tag-terminology.cjs`: 기존 태그/범주 명칭·설정 관리·정렬/그룹화·보관/복원.
- `tests/app-symbols.cjs`: 심볼·설정·계정 분리·테마·키보드·모바일.
- `tests/together-ui.cjs`: 2인 방·초대·사진·인증·점수·보상·교환일기·공유 PNG 전달·개인 데이터 분리·390px.
- 1366×768, 1440×900, 1440×320, 390×844, 760×768, 761×768. 기본(white)·검정(black)·치즈(cheese) 테마.
- 미배포 날짜·시간 1단계 HTML에 탐색 변경만 겹친 격리 사본에서도 `common-navigation` 통과. 사본은 git 무시된 test-results에만 두며 원본 작업 폴더와 배포 소스는 변경하지 않는다.
- `git diff --check` 통과.

## 배포와 적용

- 기존 GitHub Pages: `https://greejiu.github.io/today-onekan/`, `build_type=legacy`, source `main:/`. 새 호스팅·배포 설정·DB 적용은 없다.
- main 보호 및 ruleset 조회: 필수 체크·보호 없음. PR에서 변경 범위와 병합 가능 상태를 확인한 후 병합한다.
- 배포 후 Pages workflow의 성공과 반영 SHA를 확인하고 `DEPLOY_SHA=<반영 SHA>`로 `tests/deployed-navigation.cjs`를 실행한다. 실제 URL의 HTTP 200과 제공 HTML/기존 같이한칸 정적 파일이 검토한 파일과 일치하는지 확인한다. 실제 URL의 브라우저 화면에서는 Auth/DB를 격리해 주요 진입점·데스크톱/모바일·오류·탐색 쓰기 0을 확인한다.
- 운영 계정으로 실제 쓰기·사진 업로드·완료 처리는 하지 않는다. 해당 기능은 로컬 통합 테스트로 검증한다. 신규 통합 데이터/공개 공간/달력·보드·범위 드래그는 이번에 구현하지 않는다.

## 화면 근거

로컬 `test-results/`: `navigation-global.png`, `navigation-dedicated-{white,black,cheese}.png`, `navigation-together.png`, `navigation-mobile-together.png`, `navigation-mobile-all.png`, `navigation-mobile-community.png`, `navigation-short.png`.

배포 검증 실행 후: `deployed-global.png`, `deployed-dedicated.png`, `deployed-together.png`, `deployed-mobile.png`, `deployment-verification.json`.
