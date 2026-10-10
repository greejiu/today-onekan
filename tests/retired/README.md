# 은퇴한 테스트 (실행 대상 아님)

2026-10-10 '모두'를 일정에 합치면서, 일정 메뉴는 통합 화면(page `all`)을 연다. 옛 일정 화면(page `schedule`)은 코드만 남아 있고 사용자가 열 수 없다.

- `schedule-views.cjs`: 옛 일정 화면의 표시 일수 1~7·숨은 기간 버튼·끌기 검증.
- `schedule-sidebar.cjs`: 옛 일정 화면 사이드바(범주 눈·목록 모드) 검증.

다른 테스트가 같은 내용을 현재 화면에서 검증한다.
- 공용 줄 나누기 계산(`lanes`): `tests/view-math.cjs`.
- 일정이 포함된 주 타임라인 끌기·겹침·자정: `tests/all-views.cjs`, `tests/all-redesign.cjs`.
- 범주 눈: `tests/all-sidebar-eyes.cjs`, `tests/all-redesign.cjs`.

옛 일정 화면 코드를 지울 때 이 폴더도 같이 지운다. 경로가 바뀌어 이대로는 실행되지 않는다(`./period-fixture.cjs`).
