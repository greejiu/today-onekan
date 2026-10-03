# 공통 날짜·시간 1단계 — 구현·검증 보고 (2026-10-03)

> 최초 1단계 검증 기록과 후속 통합·운영 적용 기록을 함께 보관한다. 아래 최초 기록의 미배포 상태는 당시 상태이며, 최신 통합 결과는 문서 끝에 기록한다.

## 최초 확인 기준과 보존 범위

- `git fetch origin main`으로 최신 main `8c73109`를 확인했다. 현재 브랜치 `codex/desktop-sidebar`의 HEAD는 4개 커밋 뒤지만, 미커밋 작업 파일에는 main의 사이드바·직접 탐색 변경이 이미 반영되어 있었다. 최신 main 대비 실제 index 차이는 습관 프로젝트명 표시 등 5줄 수준이었다. 작업 파일을 reset/checkout/병합으로 덮어쓰지 않았다.
- 착수 시 README/index 및 app-symbols/sidebar-navigation 테스트의 수정, 직접 탐색·일정 사이드바·작업 관리 문서와 테스트의 미추적 파일을 확인했다. 기존 변경을 유지했다. AGENTS.md는 저장소와 상위 경로에서 발견되지 않았다. README, CODEX_HANDOFF, 관련 반복·기록 설계 및 실제 소스를 함께 확인했다.
- Supabase 운영 프로젝트에는 **컬럼·기본값·nullable·제약·RLS 정책·마이그레이션 이력 조회만** 실행했다. 사용자 행 조회·수정, 운영 마이그레이션 적용, 배포·커밋·push는 하지 않았다.
- 새 사이드바·그룹·보드·달력 보기·범위 드래그·특정 습관 회차 이동 UI를 추가하지 않았다. 이미 있는 날짜/시간 추가 및 드래그 진입점을 공통 모델에 연결했다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `index.html` | 기존 추가/수정창 재사용, `OnekanPeriod` 공통 모델과 폼 어댑터, 기간 검증·저장·표시, 날짜 이동·기존 드래그·복제·반복 생성·완료 기록 연결 |
| `supabase/migrations/20261003122925_tok_common_period.sql` | nullable 호환 필드, 기간 검증 트리거, 습관 완료 종료일 스냅샷, 기존 언젠가 이동 RPC의 종일 저장 |
| `tests/period-model.cjs` | 기본값·검증·로컬 날짜·DST·기간 이동·겹침·레거시 단위 검증 |
| `tests/period-fixture.cjs` | 외부 요청을 막는 가짜 Supabase CRUD/RPC 환경 |
| `tests/period-ui.cjs` | 세 입력창 저장/재열기·오류·반복·390px·화면 근거 |
| `tests/period-paths.cjs` | 목록/상세/달력/지금한칸, 날짜 변경·오늘하기/실행 취소·복제·실제 포인터 드래그·기록 보존 |
| `tests/period-sql.cjs` | PGlite에서 합성 데이터로 마이그레이션, 소유권·RLS·기간·중복·원자적 이동 검증 |
| `tests/project-today.cjs` | 오늘하기가 기존 시각을 유지한다는 새 확정 규칙으로 기대값 변경 |
| `tests/schedule-sidebar.cjs` | 없어지는 '여러 날' 스위치 대신 항상 표시되는 종료일로 기존 검증 연결 |
| 이 문서 | 모델 대응·검증·운영 적용 조건 |

README와 기존 사이드바·로고 관련 변경은 이번 작업에서 재작성하지 않았다.

## 공통 규칙과 입력 인터페이스

- 직접 추가는 종일이며 시작일=종료일=오늘. 화면 날짜나 날짜 범위가 전달되면 해당 날짜를 사용한다.
- 공통 호출은 `openAddWindowFor(kind, context)`. `context`는 `{startDate, endDate, startTime, endTime, allDay, durationMinutes}`이며 기존 문자열 날짜, `date`, `time`, `startMinute` 호출도 받아들인다. `openTodoSheet`, `openHabitAddSheet`, `openEventEditor`도 같은 기본값 계산을 사용한다.
- 시각 맥락이 있으면 종일을 끄고, 종료가 없으면 명시적 `durationMinutes`, 없으면 기존 추가 기본값 30분으로 종료를 **제안**한다. 일반 추가에서 종일만 끄면 두 시각 모두 빈칸이다.
- 종일일 때는 날짜만 표시한다. 숨은 시각 입력은 같은 창 안에서 복원할 수 있으나 저장할 때 시작 시각·종료 시각·소요시간을 모두 NULL로 보낸다.
- 종일 종료일은 마지막 포함 날짜. 시간 항목은 시작/종료 날짜·시각을 모두 요구하며 끝이 시작보다 엄격히 뒤여야 한다. 이른 종료 시각을 다음 날로 추정하지 않는다.
- 날짜 없음 체크는 할일의 기존 날짜 없는 상태를 보존한다. 기존 날짜 없는 항목을 열어 제목만 바꾸어도 오늘로 배정하지 않는다.
- 시작 날짜를 바꾸면 종료 날짜도 같은 일수만큼 이동한다. 사용자는 종료 날짜를 별도로 수정할 수 있다. 오늘하기·기존 날짜 드롭·복제에서도 기간과 시각을 보존한다.
- 날짜와 시각은 로컬 달력 날짜 및 벽시계 분으로 처리한다. 날짜 차이는 날짜 성분의 일수 인덱스로 계산하고, 소요시간은 `날짜 차이×1440 + 종료 분 - 시작 분`이다. UTC 문자열로 날짜를 직렬화하지 않는다. DST가 있는 지역에서도 날짜 차이가 23/25시간에 의해 밀리지 않는 것을 확인했다.

## 기존 필드와 신규 모델

| 종류 | 시작 | 회차 종료 | 반복 기간 |
|---|---|---|---|
| 일정 | 기존 `event_date`, `event_time` | 기존 `end_date` + 신규 `end_time` | 기존 반복 규칙 유지 |
| 할일 | 기존 `start_date`, `todo_time` | 신규 `occurrence_end_date`, `end_time` | 신규 `repeat_start_date`(레거시는 start_date 기준), 기존 `end_date`를 반복 종료일로 유지 |
| 습관 | 신규 `occurrence_start_date`(레거시는 start_date 기준), 기존 `start_minute` | 신규 `occurrence_end_date`, `end_time` | 기존 `start_date`, `end_date` 유지 |
| 습관 완료 기록 | 기존 `done_date`, `start_minute`, `duration_minutes` | 신규 `occurrence_end_date` 스냅샷 | 과거 기록과 반복 창을 수정하지 않음 |

세 항목에 nullable `all_day`를 추가한다. NULL은 기존 데이터 호환 상태로, 기존 시작 시각 유무로 읽는다. 신규 저장은 true/false를 명시한다. `tok_habits.duration_minutes`의 NOT NULL과 30분 default는 제거하고 기존 값은 그대로 둔다. `tok_todos.start_date`는 날짜 없는 할일 저장을 위해 nullable로 허용한다. 사용자 소유자·외래 키·RLS·완료/건너뛰기 unique는 변경하지 않는다.

시간 항목의 명시적 양 끝이 기준값이며 `duration_minutes`는 계산된 보조 값이다. DB 트리거도 끝점으로 소요시간을 계산한다. 종일에는 시간 관련 값이 남으면 DB에서도 거절한다. `all_day=NULL`인 기존 행은 새 검증에 의해 제목 수정이 막히지 않는다.

반복 없는 기존 할일의 end_date는 기간으로 읽어 보존하며, 기간을 새로 저장하면 occurrence_end_date를 사용한다. 비반복 저장의 end_date는 기존 읽기 경로와 호환되도록 종료 날짜를 함께 반영한다. 반복 할일의 end_date는 회차 종료로 읽거나 이동시키지 않는다. 반복을 새로 켤 때는 기존 실제 회차 기간을 별도 필드로 옮긴 뒤 반복 기간을 설정한다.

## 기존 데이터와 화면·조작

- 실제 종료 날짜/소요시간이 있으면 보존한다. 실제 소요시간으로 종료 시각을 계산해 폼에 보여줄 수 있다. 종료 없는 기존 항목에는 안내를 표시하고, 기간을 바꾸기 전에는 실제 종료를 만들지 않는다.
- 제목/메모/태그만 수정하면 폼의 원본 기간 스냅샷을 비교하여 시간 필드를 쓰지 않는다. 타임라인의 30분 표시 fallback은 복제·단순 이동·제목 수정의 저장값이 되지 않는다.
- 일정 상세·목록, 할일·습관 목록은 양 끝 또는 종료 미지정을 표시한다. 달력과 지금한칸은 각 날짜와 겹치는 구간으로 처리한다. 23:00→다음 날 01:00은 23:00→24:00 / 00:00→01:00으로 표시하고, 자정 00:00에 끝나면 다음 날에는 표시하지 않는다.
- 반복 습관의 계속되는 구간은 원본 habit ID와 시작 날짜 회차를 체크박스·메뉴에 전달한다. 일일 반복으로 전 회차 끝과 새 회차 시작이 같은 날에 있으면 각각의 회차 날짜를 유지한다. 완료 unique 및 완료/건너뛰기 상호 배제는 기존 DB 구조를 사용한다.
- 새 습관 완료는 그 회차의 실제 시작 시각/소요시간/종료 날짜를 스냅샷으로 남긴다. 이후 기간을 줄이거나 종일로 바꾸어도 완료한 야간 회차 및 여러 날 종일 회차가 원래 기간으로 표시된다. 기존 로그·건너뛰기·보관 이력은 backfill하지 않는다.
- 반복 할일은 기존 완료 시 다음 행 생성 및 repeat_source_id unique 정책을 유지한다. 다음 행의 회차 끝은 시작 날짜 이동량만큼 함께 옮기고 반복 종료일은 그대로 이어받는다.
- 기존 지금한칸 드래그는 전체 기간을 평행 이동한다. 다른 날짜의 계속되는 구간을 옮겨도 원본 시작 날짜와의 차이를 유지한다. 잘린 중간 구간에는 길이 조절을 적용하지 않고 전체 기간은 수정창에서 바꾼다. 습관 드래그는 기존처럼 전체 설정을 바꾸며 특정 회차 이동 기능은 추가하지 않았다.
- 최신 소스에는 프로젝트/남아 있는 할일의 오늘하기와 임의 날짜 드롭이 있다. 별도의 내일하기 메뉴/함수는 없으므로 새 메뉴를 추가하지 않았다. 실제 내일 날짜를 전달하는 공통 이동 경로로 기간 보존을 검증했다.
- 저장 실패 시 창과 입력을 유지한다. 760px 전환과 하단바를 유지하고 날짜/시간 두 열은 `minmax(0,1fr)`로 좁은 화면 안에 들어가도록 했다.

## 실행한 검증

외부 요청을 차단한 Chromium headless(Windows Chrome), Asia/Seoul과 합성 데이터의 로컬 PGlite에서 실행했다. 테스트 의존성은 번들 Playwright와 기존 `test-results/runtime/node_modules`의 PGlite를 사용한다.

- `period-model`: 세 종류 기본값, 날짜/시각 범위, 실제 소요시간 기반 종료 제안, 종일/시간 필수값·역전, 여러 날/자정/정각 끝, 로컬 날짜·DST, 레거시 종료 없는 값과 반복 종료일 분리, 이동 시 저장용 fallback 없음 — 통과.
- `period-ui`: 세 추가·수정창의 직접/맥락 추가, 하루/여러 날 종일, 같은 날/자정/여러 날 시간, 오류 후 입력 유지, 종일 전환/복원/저장·재열기, 제목만 수정, 날짜 없는 할일, 기간 변경 시 종료 요구, 반복 회차/반복 종료 분리, 두 야간 회차 표시, 중복 완료 방지·건너뛰기/취소, 복제/날짜 이동, 1366px/390px, 페이지 오류와 앱 콘솔 오류 없음 — 통과.
- `period-paths`: 달력·상세·다가오는·지금한칸의 겹침, 자정 exclusive 끝, 실제 레거시 복제와 표시용 fallback 분리, 종일 기간 이동, 내일/오늘하기·실행 취소의 양 끝 보존, 날짜 변경창, 프로젝트·완료 상태·기록 보존, 완료 후 기간 변경에도 스냅샷 유지, 실제 포인터로 다음 날 구간 15분 이동 — 통과.
- `period-sql`: 마이그레이션 전후 기존 행/정책 동일, 종일 NULL 저장, 날짜 없음, 필수값/역전 차단, 시작·종료 기준 소요시간 정규화, 여러 날 시간, 반복 종료일 보존, 소유자 변경/다른 사용자/anon 차단, 완료 unique·건너뛰기 충돌, 기존 언젠가 RPC의 원자적 이동과 재시도 중복 차단 — 통과.
- 기존 `home-layout`, `project-today`, `schedule-sidebar`, `direct-navigation`, `together-ui` 회귀 — 통과. 지금한칸 레이아웃·기존 포인터 이동·모바일·프로젝트·일정 필터/범주·같이한칸 동작을 확인했다.
- JavaScript 구문 검증과 `git diff --check` — 통과. 테스트가 의도적으로 차단한 외부 정적 리소스의 `ERR_FAILED` 콘솔 메시지는 앱 오류 검사에서 제외했다.

기존 `tests/task-management.cjs`는 `[data-work-page]` 통합 전환 UI를 기대하여 실패했다. 최신 main과 착수 시 작업 파일에는 이미 그 노드가 없으며, 이번 기간 변경 이전의 테스트/최신 UI 불일치다. 해당 기존 파일을 재작성하지 않았고 현재 UI의 직접 탐색은 direct-navigation으로 검증했다. 모든 저장소 테스트가 통과했다고 주장하지 않는다.

미검증: 운영 Auth/PostgREST 통합과 실제 계정, Docker 기반 전체 Supabase 스택·advisors, 실제 모바일 기기 및 Safari/Firefox. 사용자 데이터가 없는 PGlite fixture는 조회한 실제 핵심 컬럼/제약/소유 정책을 재현하나 운영 전체 스키마와 인증 서비스를 대체하지 않는다.

## 운영 적용 순서와 호환 조건

이번 요청에서 운영 적용/배포는 하지 않았다.

1. 기존 운영 마이그레이션 이력과 저장소 이력을 먼저 대조한다. 조회 결과 일부 기존 마이그레이션은 저장소 파일과 운영 version이 다르다. 전체 디렉터리를 무조건 db push하여 기존 변경을 재적용하지 않는다.
2. 승인된 적용 절차로 이번 `20261003122925_tok_common_period.sql`만 적용하고 이력을 기록한다. 기존 행 수정은 없다. migration은 PostgREST 스키마 캐시 갱신 notification도 보낸다.
3. 새 컬럼·nullable·트리거·권한·RPC 응답 및 스키마 캐시를 확인한 뒤 새 index.html을 배포한다. **DB 먼저, 프런트엔드 다음**이다. DB 변경 전 신규 기간 저장은 지원되지 않으며 실패 시 입력은 유지된다.
4. 사용 중인 오래된 탭을 새로고침한 뒤 신규 기간 데이터를 작성하게 한다. 기존 all_day=NULL 행은 옛 프런트엔드에서도 기존 방식으로 사용할 수 있지만, 새로 명시적 기간을 저장한 행을 옛 클라이언트로 날짜/시간 조작하는 것은 지원하지 않는다. 새 클라이언트는 기존·신규 행을 모두 읽는다.
5. 종일/야간/반복 종료 분리/언젠가 이동의 소수 검증용 항목으로 적용 후 확인한다. 기존 사용자 항목을 자동 변환하는 작업은 하지 않는다.

## 입력창 화면 근거

산출물은 Git에서 제외되는 `test-results/period/`에 있다. 모두 합성 데이터이며 추가창의 종일/시간 모드와 실제 수정창을 촬영했다.

| 입력창 | 데스크톱 | 390px 모바일 |
|---|---|---|
| 일정 시간 지정 | [화면](../test-results/period/event-timed-1366.png) | [화면](../test-results/period/event-timed-390.png) |
| 할일 시간 지정 | [화면](../test-results/period/todo-timed-1366.png) | [화면](../test-results/period/todo-timed-390.png) |
| 습관 시간 지정 | [화면](../test-results/period/habit-timed-1366.png) | [화면](../test-results/period/habit-timed-390.png) |
| 일정 종일 | [화면](../test-results/period/event-allday-1366.png) | [화면](../test-results/period/event-allday-390.png) |
| 할일 종일 | [화면](../test-results/period/todo-allday-1366.png) | [화면](../test-results/period/todo-allday-390.png) |
| 습관 종일 | [화면](../test-results/period/habit-allday-1366.png) | [화면](../test-results/period/habit-allday-390.png) |
| 일정 수정 | [화면](../test-results/period/event-edit-1366.png) | [화면](../test-results/period/event-edit-390.png) |
| 할일 수정 | [화면](../test-results/period/todo-edit-1366.png) | [화면](../test-results/period/todo-edit-390.png) |
| 습관 수정 | [화면](../test-results/period/habit-edit-1366.png) | [화면](../test-results/period/habit-edit-390.png) |


## 1·2·3단계 통합 및 운영 적용 (2026-10-03)

사용자가 날짜·시간 1단계까지 포함한 배포를 명시적으로 승인했다. 최신 main `4d4f4bf`의 탐색 구조·그룹·공용 범주에 원래 폴더의 기간 작업만 병합했다. 원래 `codex/desktop-sidebar`의 미커밋·미추적 파일은 그대로 보존했고, 분리된 기존 관리 worktree에서 통합했다.

- 날짜·시간 입력과 그룹·범주 선택을 함께 유지한다. 시간 지정 항목의 복제·반복·날짜 이동은 실제 기간과 분류·프로젝트 연결을 보존한다. `tok_move_someday_to_todo`는 그룹·공용 범주·프로젝트를 함께 복사하면서 명시적 하루 종일 기간을 만든다.
- 적용 순서: 운영의 기존 `20261003114452_tok_groups_shared_categories` → 이번 `20261003122925_tok_common_period` → 통합 앱. 대기 마이그레이션 일괄 적용 없이 이번 기간 마이그레이션 하나만 `mmpsyajgyufdxmmnxqba`에 적용했다.
- 사용자 승인 범위 안에서 11개 테이블의 200개 행과 기존 스키마·RPC·정책을 Windows 계정 RSA 암호화 복구본에 저장했다. 평문 파일·Git·배포에는 포함하지 않는다. 복호화 가능 여부를 확인했고 SHA256은 `71fb0ca074a07fd7e5d33b73fd2212e3932f8e84ce9b3ec8c7c9277d0770c2d4`다. 복구본은 작업 worktree의 `test-results/period-production-backup.rsa`에 보존한다.
- 적용 직전과 직후 기존 필드 전체의 행 지문을 비교했다. 200개 행·11개 테이블의 값과 RLS 정책이 동일했다. 신규 nullable 컬럼·3개 기간 검증 트리거·RPC 정의를 확인했다. 보안·성능 advisor 신규 항목은 0개다. 기존 권한을 넓히거나 사용자 항목을 자동 보정하지 않았다.
- 격리 검증 통과: `period-model`, `period-ui`, `period-paths`, `period-sql`, `classification-ui`, `classification-sql`, `app-symbols`, `sidebar-navigation`, `common-navigation`, `schedule-sidebar`, `direct-navigation`, `home-layout`, `project-today`, `tag-terminology`, `together-ui`.
- 기간 SQL 검증은 실제 운영 적용 순서대로 그룹·범주 이후 기간을 적용하며, 타 사용자·미지정·중복 완료·원자적 이동·기록 보존·기간 정규화를 확인한다. 브라우저 통합 검증은 새 야간 기간+선택 그룹+공용 범주+복제를 함께 확인한다. 1366×768/1440×900/낮은 창/390px/760·761px 및 기본·검정·치즈 테마와 기존 공유 이미지 전달을 검증했다.
- 운영에서는 사용자 항목을 생성·수정하는 CRUD 검증을 하지 않는다. 해당 동작은 합성 데이터와 격리 DB에서 검증한다. 배포 파일 대조·로그인 진입·실제 URL의 격리된 화면 확인은 배포 후 수행한다.
- 기존에 열어 둔 탭은 새로고침 후 새 기간 항목을 수정해야 한다. `all_day=NULL` 레거시 행은 그대로 읽으며, 오래된 앱의 신규 명시적 기간 조작은 기간 검증으로 거절될 수 있다. 새 달력·보드·범위 드래그 UI를 추가하지 않았다.
