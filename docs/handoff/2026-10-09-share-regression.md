# 인계: 이미지로 공유 회귀 검증 (#84·#85)

- 작성일 / 작성 AI: 2026-10-09 / Claude Code
- 상태: 완료
- 브랜치 / 마지막 커밋: `codex/share-regression-2026-10-09` / 470f6c1 → 병합 커밋 `37be3a2`(main)
- PR: https://github.com/greejiu/today-onekan/pull/87

## 목표
#84(지난 날짜에 화면에서 완료로 보이는 할일 포함)와 #85(공유 타임라인을 앱 화면과 같은 위치·높이·겹침 열로)를 검토하고,
지금 한칸 화면과 공유 PNG가 같은 항목·같은 배치인지 회귀 검증한 뒤 검증 가능한 문제만 최소 범위로 고친다.

## 작업 환경 메모
- 이 작업은 클라우드 컨테이너의 새 클론에서 했다. 결의 PC 폴더(`C:\Users\admin\Projects\today-onekan`)는 볼 수 없다.
  - 그래서 그곳의 미커밋·미추적 파일(.sidebar-fixed-rail, .navigation-settings 관련)은 확인하지도 건드리지도 않았다.
- 시작 시 클론은 깨끗했다(변경 없음, worktree 1개).
  - `origin/main`(9e8903b)에서 이 브랜치를 새로 만들었다. reset·clean·stash·강제 push는 쓰지 않았다.
- 테스트의 Chrome 경로가 Windows용이다. 그래서 리눅스 크로미움 경로로 바꿔 주는 preload(`-r`)로 실행했다. 테스트 파일은 고치지 않았다.

## 검증 사례와 결과 (새 테스트 `tests/share-image.cjs`)
가짜 Supabase(`tests/period-fixture.cjs`)만 쓴다. 운영 DB·인증·SMTP는 건드리지 않았다.

비교 방법
- 화면: 지금 한칸 `#agendaTimeWrap .ag-tl-task`의 top·height·left·제목, `#agendaAllDayList`의 종일 행.
- 공유 PNG: 캔버스가 실제로 그린 카드 사각형과 글자를 기록했다.
- 두 쪽을 위→왼쪽 순서로 짝지어 비교했다.

| 사례 | 결과 |
|---|---|
| 오늘: 일정·할일·습관이 10:00에 겹침, 15분 짧은 항목, 긴 제목, 하루 범위(06:00~) 밖 04:30 항목, 완료/미완료, 종일 일정·할일 | 세로 위치·높이·열·제목·종일 카드가 화면과 같음 (PC 1440, 모바일 390) |
| 빈 시간 숨기기 켬 | 위아래 빈 시간만 잘리고 항목 간 상대 배치는 화면과 같음 |
| 옵션: 완료만 / 미완료만 / 일정만(완료·미완료 끔) | PNG에 그려진 카드가 옵션과 일치 |
| 지난 날짜: 완료일 같음 / 다음날 체크(완료일 다름) / 완료일 없음 / 다른 날 일정인데 그날 완료 / 미완료 | 앞의 4개 포함·각 1번만(중복 없음), 미완료 제외, 그날 일정·습관 완료 기록 포함, 배치가 화면과 같음 |
| 시간블럭 보기 | PNG 생성됨(내용은 PNG를 열어 눈으로 확인) |
| 빈 날짜 | ‘표시할 항목이 없어요’ + 저장 버튼 비활성 |
| 항목이 많은 날(28개, 최대 5열 겹침) | 위치·높이·열·제목이 화면과 같음 |
| 실제 ‘이미지 저장’ 다운로드 | PNG 헤더·크기가 캔버스와 같고, 미리보기 캔버스와 픽셀이 100% 같음 (PC·390) |
| 390px 시트 | 가로 넘침 없음, 저장 버튼 화면 안 |
| 공유 중 DB 쓰기 | 0건, 페이지 오류 0건 |

PNG 확인
- 생성된 PNG(`test-results/share-image/*.png`)를 직접 열어 화면 캡처와 비교했다.
  - pc-today-timeline, pc-sheet, m390-many-timeline, m390-past-timeline.

## 발견한 문제와 수정 (index.html 공유 타임라인)
1. **좁은 겹침 열에서 제목이 ‘…’만 남음.**
   - 상황: 같은 시간에 4~5개가 겹쳐 열이 좁아지면 말줄임 루프가 글자를 모두 지워 PNG 카드에 ‘…’만 그렸다. 화면은 첫 글자 이상이 보인다.
   - 수정: 마지막 줄에서 최소 1글자는 남기고 말줄임한다(넘치는 부분은 카드 안에서 잘림 — 화면과 같음).
2. **색이 없는 할일·습관 카드 바탕이 회색.**
   - 상황: 앱 화면은 그룹색이 없으면 종류와 관계없이 흰 카드(`OnekanAgendaMarkup.colorStyle`)인데, PNG는 accent 14% 회색으로 칠했다.
   - 수정: 화면과 같이 카드색으로 칠한다.
- 두 문제 모두 수정 전 코드에서는 새 테스트가 실패하고 수정 후 통과함을 확인했다.
- `docs/SHARE_V1.md`도 고쳤다: 바탕색·말줄임 규칙을 반영하고, #85 이후 없어진 ‘세로 막대’ 설명을 지웠다.

## 의도된 차이로 보고 고치지 않은 것
- 화면은 프로젝트에 연결된 할일을 `프로젝트명 - 할일명`으로 보이지만, 공유 이미지는 할일명만 쓴다.
  - `docs/PROJECT_TODAY_LINK.md`에 “공유 이미지에는 프로젝트명을 붙이지 않음(범위 밖)”으로 적혀 있다.
  - 바꿀지는 결이 정한다.
- 화면 카드는 오른쪽 ⋯ 버튼 자리를 비우고 폭에서 4px를 빼지만, PNG는 버튼이 없어 그 여백이 없다(편집 UI 제외 규칙).

## 검증 상태
- 통과
  - `tests/share-image.cjs`(신규)
  - `tests/home-layout.cjs`, `tests/project-today.cjs`, `tests/beta-release.cjs`, `tests/app-symbols.cjs`
  - `git diff --check`
- 실패(기존 문제, 이번 수정과 무관): `tests/together-ui.cjs`
  - 증상: `appSymbolReady is not defined`.
  - 원인: 이 테스트의 가짜 서버가 허용 목록에 없는 새 스크립트(release-policy.js·navigation.js 등)를 빈 내용으로 돌려줘서 앱이 시작되지 않는다.
  - 수정 전 main에서도 같은 오류로 실패했다.
- 그 밖에 전체 실행 때 main에서 이미 실패하던 테스트가 있었다: all-views, calendar-ui, schedule-views 등.
  - 원인: 사이드바·보기 탭 개편 뒤 바뀐 선택자.
  - 이번 범위가 아니어서 손대지 않았다.
- 실행하지 못한 것
  - 실제 휴대폰의 공유창·사진 저장
  - 운영 계정 데이터로 만든 이미지
  - 결의 로컬 Windows Chrome에서의 실행

## 병합·배포 확인
- PR #87 병합 커밋: `37be3a23cc5c20a87aeffd072c74b74363c5889f`. 병합 직전 `origin/main`은 9e8903b 그대로였다(다른 작업 변경 없음, 충돌 없음).
- GitHub Pages 배포 실행: [run 37873557836](https://github.com/greejiu/today-onekan/actions/runs/37873557836) → `completed / success`, head_sha = 37be3a2.
- **미확인**: 배포 주소의 `index.html`이 main 파일과 같은지 직접 비교하지 못했다.
  - 이유: 이 작업 환경(클라우드 컨테이너)의 네트워크 정책이 `greejiu.github.io` 접속을 403으로 막는다.
  - Pages 산출물 zip도 외부 저장소 주소라 내려받을 수 없었다.
  - 결의 PC에서 `docs/AI_WORKFLOW.md`의 PowerShell 비교 명령으로 확인하면 된다. 비교할 파일은 `index.html`(이번 변경 정적 파일은 이것 하나, 테스트·문서는 배포 화면과 무관)이다.

## 주의할 점
- DB 변경 없음.
- 결의 PC 폴더에 있는 미커밋 작업(.sidebar-fixed-rail, .navigation-settings)은 이 브랜치와 무관하다. 병합 후 로컬에서 `git pull` 할 때 충돌 여부만 확인하면 된다.

## 다음에 할 행동 1개
배포 후 휴대폰에서 같은 시간에 3개 이상 겹친 날을 ‘이미지로 공유’해 보고, 좁은 카드에 제목 첫 글자가 보이는지 확인한다.
