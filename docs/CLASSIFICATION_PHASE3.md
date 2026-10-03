# 그룹·범주 3단계 작업 기록

## 구현 전 확인 (2026-10-03)

기준 main `2c1bcd0e43cb6a9e9e42ae633d433cbcb469099b`. 실제 앱 URL과 연결 프로젝트는 `https://mmpsyajgyufdxmmnxqba.supabase.co`, Supabase 목록의 `greejiu project`(ap-northeast-2, ACTIVE_HEALTHY)와 일치한다. 운영 스키마 컬럼·외래키·RLS·이동 RPC 및 migration history를 읽기 전용으로 확인했다. 날짜·시간 1단계는 원래 폴더의 미커밋 작업이며 이번 브랜치에 포함하지 않는다.

| 의미 | 기존 저장 구조 | 이번 추가 |
|---|---|---|
| 일정 그룹 | tok_event_categories, tok_events.category_id | 기존 이름·색·순서·보관·연결 유지 |
| 공용 범주 | tok_habit_categories, todos/someday.tag_id, habits.category_id | events.shared_category_id 추가 |
| 할일 그룹 | 없음 | tok_item_groups(kind=todo), todos/someday.group_id |
| 습관 그룹 | 없음 | tok_item_groups(kind=habit), habits.group_id |
| 목표/프로젝트 | todos/habits.project_id | someday.project_id 추가(할일↔담아두기 이동 시 연결 보존) |

기존 행을 재분류하거나 이름으로 병합하지 않는다. 기존 일정 카드색은 category_id의 그룹색, 할일·습관은 기존 범주색을 사용한다. 새 연결만으로 기존 색을 덮어쓰지 않는다. 그룹 0~1개, 범주 0~1개, 계층 없음.

새 그룹에는 소유자 RLS 및 명시적 authenticated 권한(조회·추가·수정만)을 적용한다. 기존 분류 연결도 소유자 복합 외래키로 보호하며 그룹 종류는 서버 트리거에서 검증한다. 기존 RLS를 확대하지 않는다. 기존 일정 그룹/공용 범주의 완전 삭제 RPC는 기존 정책 그대로 두되 페이지 내 새 삭제 진입점은 제공하지 않는다.

적용 순서: 격리 SQL/브라우저 검증 → 운영 복구 수단·연결 무결성·원본 행 fingerprint 확인 → 이번 마이그레이션만 적용 → 원본 행/권한 보존 확인 → 앱 PR/병합 → 기존 main:/ GitHub Pages 배포 → 실제 정적 파일/분류 읽기 확인. 전환 동안 이전 앱은 새 nullable 필드를 사용하지 않아 계속 동작한다. 새 앱은 분류 마이그레이션 감지 실패 시 기존 기능을 유지하고 새 연결을 조용히 버리지 않는다.


## 구현 및 검증

공통 `assets/classification.js` 어댑터가 종류별 그룹 선택·달력 눈 설정·폼 선택·분류 저장을 담당한다. 설정은 사용자+종류별 localStorage로 분리한다. 일정 눈 설정은 이전 값에서 읽되 목록 조회와 독립이며, 숨긴 그룹도 목록에서 선택할 수 있다. 관리 시트와 모바일 페이지 내 조회/관리 버튼을 사용한다. 새 페이지 내 그룹/범주 완전 삭제는 제공하지 않는다. 기존 습관 창의 분류 관리 및 삭제 RPC 정책은 유지한다.

`index.html`은 기존 페이지·폼·기간·프로젝트·완료·공유 경로에 새 nullable 연결만 추가한다. 선택 그룹 안에서의 추가만 그 그룹을 기본값으로 사용한다. 복제·반복 생성·양방향 담아두기 이동에서 연결을 유지한다. 새 저장소를 확인하지 못하면 새 연결 입력을 비활성화하고, 연결을 잃을 이동/저장을 막아 오류를 보여준다. 설정의 이전 분류 관리 영역은 세 페이지와 모바일의 대체 경로 확인 후 제거했다.

통과: classification-sql(로컬 Postgres/PGlite), classification-ui(분류 CRUD/보관/복원/실제 손잡이 순서 변경/공용 수정/기본값/양방향 이동/복제/반복/기간·프로젝트/미적용/계정 분리), schedule-sidebar(달력·목록 독립 필터/보관/편집/공유/키보드/6개 화면폭·높이/기본·검정·치즈), tag-terminology(사용자 표시 명칭과 기존 컬럼 연결), common-navigation, sidebar-navigation, direct-navigation, project-today, app-symbols, home-layout, together-ui. 브라우저의 Auth/DB/외부 요청을 격리된 합성 데이터로 대체했으며 콘솔·중복 ID·조회만으로 DB 쓰기 없음도 검증했다. 1366×768, 1440×900, 1440×320, 390px, 760/761px 경계를 포함한다.

실제 사용자 항목의 생성/수정/완료/이동으로 운영을 테스트하지 않았다. 운영 인증을 이용한 CRUD는 미검증이며 격리 브라우저·로컬 DB에서 검증했다. 미병합 날짜/시간 1단계와 신규 보드·달력 드래그·공개 공간은 이번 범위에 포함하지 않았다.

## 운영 적용 (2026-10-03)

운영 프로젝트 `mmpsyajgyufdxmmnxqba`의 Supabase 백업 화면에서 Free Plan 자동 백업 미제공을 확인했다. 사용자가 관련 운영 데이터의 로컬 암호화 복구본 저장을 명시적으로 승인했다. 원문 셸 인자 방식은 자동 검토에 의해 거절되어 사용하지 않았다. 세션 안에서 RSA 공개키로 암호화하고 암호문만 파일로 전달했다. 비공개 키는 현재 Windows 사용자의 보호 키 컨테이너 `TodayOnekan-Classification-Recovery-20261003`에 보관된다. Git 제외 `test-results/classification-production-backup.rsa`의 복호화/프로젝트/JSON 구조를 `tests/classification-recovery.ps1`로 검증했다. 원문 파일·공개 저장소·배포에 데이터는 남기지 않았다. 검증 SHA256: `89e8331e421172df7afd8000f235140c04f620bad0b84ceec6c17391e338fe71`.

적용한 것은 `20261003114452_tok_groups_shared_categories.sql` 하나뿐이다. CLI `migration new`로 생성·로컬 검증한 후 MCP 적용 결과의 실제 버전 `20261003114452`와 파일명을 맞췄다. 다른 대기 마이그레이션은 적용하지 않았다. 적용 직전 분류 연결의 타 사용자/고아 연결은 모두 0이었다. 적용 후 기존 10개 테이블 200행(할일 122, 습관 4, 일정 12, 담아두기 24, 공용 범주 15, 일정 그룹 8, 프로젝트 8, 완료 기록 7, 건너뛰기 0, 일시정지 0)의 새 컬럼을 제외한 원본 전체 행 fingerprint가 적용 전과 같았다. 기존 24개 RLS 정책도 동일했다. 새 그룹 RLS 활성화·authenticated 조회/추가/수정 허용·anon 조회 및 authenticated 삭제 금지·소유자 FK 전체 validation을 실제 catalog에서 확인했다.

Security advisor 신규 경고 0. Performance advisor 신규 표시는 이번에 만든 인덱스의 아직 사용되지 않음 INFO만이며 외래키용 인덱스는 유지한다. 기존 인증의 유출 비밀번호 보호 미설정 및 이전 RLS/인덱스 안내는 이번 변경에 의해 생긴 것이 아니다. 참고: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

배포 순서는 검증/복구 확인 → 이번 DB 변경 → 원본·권한 비교 → 앱 PR 병합 → 기존 main:/ Pages 배포이다. 이전 앱은 추가 nullable 필드를 무시하고 같은 RPC 서명을 사용하므로 DB 선적용 동안 계속 동작한다. 문제가 생기면 앱을 기준 main으로 되돌려도 새 연결 컬럼/데이터는 유지하며, 새 테이블/컬럼을 삭제하는 롤백은 하지 않는다. 데이터 복구가 필요할 경우 같은 Windows 계정에서 복호화하여 메모리에 원본 행·정책·RPC 정의를 확인하고 별도 검토 후 복구한다. 복구 검증 스크립트는 운영 DB 쓰기를 실행하지 않는다.
