# 인계: 옛 일정 화면 코드 삭제 (검토 5번)

- 작성일 / 작성 AI: 2026-10-10 / Claude Code
- 브랜치: `codex/remove-old-schedule` (기준 `origin/main` ed58d19)

## 배경
'모두'를 일정에 합친 뒤(일정 메뉴 = page `all`), 옛 일정 화면(page `schedule`)은 메뉴로 열 수 없는데 코드만 남아 있었다. 매번 같이 그려지고(`renderSchedule`·`renderScheduleCalendar`) 테스트도 옛 화면을 기준으로 돌고 있었다.

## 지운 것
- `index.html`
  - 옛 화면 본문(`.page[data-page=schedule]`).
  - 사이드바 범주 패널(`#scheduleSidebarNav`), 모바일 범주 시트(`#scheduleFilterBg`), 범주 수정 시트(`#scheduleCategoryEditBg`).
  - 옛 화면 전용 함수 약 30개(목록·달력·날짜 패널·연월 선택·범주 눈·범주 수정·보기 전환 등)와 연결 코드.
  - 상태값(`scheduleMode`·`calCursor`·`calSelected`·`scheduleHiddenCategories` 등).
- `assets/schedule-views.js`(옛 화면 어댑터). 주 계산 함수 `lanes`는 원래 `item-views.js`에 있어서 그대로다.
- `tests/retired/` 전체, `tests/schedule-panels.cjs`, `tests/schedule-simple-views.cjs`.

## 남긴 것 (공용)
- 일정 상세 창·편집 창(`openEventDetail`, `openEventEditor`, `saveCalEvent`), 확인 창, `trapFocusIn`.
- `calDateLabel`, `evEndDate`, `scheduleEventVisible` 등 다른 화면이 쓰는 도우미.
- 연·월 선택 틀 `#schedMonthPicker`: 일정·할일·습관 화면이 복사해 쓰므로 빈 틀로 남겼다.
- `release-policy.js`의 `schedule` 항목: 그대로 둔다(운영자 전용, 공개 범위 변경 없음).

## 함께 고친 것
- `showPage('schedule')`(예전 이름)로 열면 통합 일정 화면(`all`)으로 연다. 빈 화면이 되지 않게.
- 앱 버그(합치기 때부터 있던 것): 일정 화면을 보던 중 설정에서 '일정' 메뉴를 숨겨도 지금 한칸으로 돌아가지 않았다.
  - 원인: 메뉴 id(`schedule`)와 화면 이름(`all`)이 달랐다.
  - `navigation.js`에서 화면 이름을 메뉴 id로 바꿔서 비교한다.
- `classification.js`: 옛 일정 화면에 붙이던 모바일 범주 줄을 뺐다(화면이 없어 앱이 켜지지 않았음).

## 테스트
- 새 `tests/schedule-merged.cjs`: 예전 이름 열기 → 통합 화면, 옛 DOM 없음, 월 막대 누르기 = 상세, 막대 끌기 = 기간 그대로 이동, 편집창 이름만 수정 시 나머지 유지(옛 화면 테스트가 지키던 공용 규칙).
- 옛 화면 기준이던 테스트를 통합 화면 또는 할일 화면 기준으로 고쳤다. 확인하는 내용은 유지했다.
  - `week-fit`: 통합 화면 주·타임라인에서 7일 보임·축·겹침 확인.
  - `tabs-like-home`, `period-paths`, `period-ui`(일정 '선택 범주' 기본값은 통합 화면에 없어 할일·습관만), `classification-ui`, `group-defaults`(일정 기본 범주 색은 '내 일정' ⋯로), `tag-terminology`, `goal-ui`, `navigation-settings`(화면 수 11 → 10).
- 옮기지 않은 검증:
  - 옛 주간 시간 보기의 일정 끌어 날짜 옮기기. 통합 화면 주 타임라인 끌기는 이번에 따로 확인하지 않았다.
  - 옛 PC 월 칸 빈 곳 끌어 기간 선택. 통합 화면은 빈 곳 클릭 = 추가 종류 메뉴(`all-redesign`)다.
- 전체 `tests/*.cjs` 46개 모두 통과(가짜 Supabase).
- 실행하지 못한 것: 실제 휴대폰, 실제 계정 데이터.
- 남은 정리: CSS에 옛 화면 선택자(`#scheduleModeToggle`, `.schedule-cat-*` 등)가 일부 남아 있다. 동작에는 영향이 없다.

## 다음에 할 행동 1개
배포본에서 일정 → 월 → 일정 막대를 눌러 상세 창이 열리는지, 막대를 다른 날짜로 끌어 옮겨지는지 본다.
