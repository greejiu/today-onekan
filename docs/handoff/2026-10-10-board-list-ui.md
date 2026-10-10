# 인계: '모두' 주간 보드 UI를 지금 한칸 목록 줄과 통일

- 작성일 / 작성 AI: 2026-10-10 / Claude Code
- 상태: 완료(배포됨, 배포본 파일 비교는 결의 PC에서 확인 필요)
- PR: https://github.com/greejiu/today-onekan/pull/98 → 병합 커밋 `098754d`
- 브랜치: `codex/board-list-ui` (기준 `origin/main` 8ef799b)

## 결 요청
"보드 ui도 목록이랑 통일해"

## 한 일
- 보드 카드를 지금 한칸 목록 줄 함수(`homeTodayRowHtml`)로 그린다.
  - 손잡이, 체크(할일·습관), 일정 점, 그룹색 제목, 시각, ⋯이 지금 한칸과 같다.
  - `homeTodayRowHtml`에 보드용 속성(`attrs`)과 일정 시각 표시(`show_time`)를 선택 인자로 추가했다. 기존 호출은 그대로다.
- 규칙도 지금 한칸과 같다.
  - 체크 = `wireHomeTodayChecks`.
  - 줄 누르기 = 이름 수정.
  - 습관 건너뛰기·취소는 ⋯ 메뉴로 한다. 예전 보드 전용 습관 버튼(완료/건너뛰기)은 없앴다.
- 열이 좁아서 시각은 제목 아래 줄에 둔다. 같은 줄 부품을 격자로 배치만 바꾼 것이다.
- PC 끌어서 날짜 옮기기(시각·길이 보존, 반복은 안내)는 그대로다.
- 가운데에서 체크하면 빌려 간 오른쪽 다가오는도 바로 맞춘다(`renderLoanHosts`).
- 예전 보드 카드 CSS(`.awb-card`, `.awb-open` 등)는 삭제했다.

## 검증
- `tests/all-redesign.cjs` 전체 통과.
  - 보드 줄 = 지금 한칸 줄(손잡이 있음), 종일 먼저(시각 없음)→시각순, 일정 시각 표시.
  - 습관 체크 완료·취소, ⋯ 메뉴 건너뛰기·취소.
  - 제목 클릭 이름 수정, 끌기·실패 복원, 이미지 저장 개수.
- `all-sidebar-eyes`, `shared-view-tabs`, `home-layout` 통과.
- 전체 회귀(47개): 34개 통과. 실패 13개는 main에서도 실패하던 그 13개다(이번 범위 밖).
- 실행하지 못한 것: 실제 휴대폰, 실제 계정 데이터.

## 병합·배포 확인
- 병합 직전 `origin/main`은 8ef799b 그대로였다(다른 작업 변경 없음).
- GitHub Pages 배포 run 38025583030: `completed / success`, head_sha = 098754d.
- **미확인**: 배포 주소 파일 비교(이 환경은 `greejiu.github.io` 접속이 막힘).
  - 결의 PC에서 비교한다: `index.html`, `assets/all-views.js`, `assets/schedule-views.css`.

## 다음에 할 행동 1개
배포본 '모두' → 주 → 보드에서 할일 하나를 체크해 보고, 지금 한칸 목록과 같은 모양·반응인지 본다.
