# 사용자별 앱 심볼 — 구현 및 검증 (2026-09-28)

## 현재 상태

한칸·치즈·한걸음·체크 4종의 구현 및 로컬 검증을 완료했다. 사용자가 번호를 정정하여 첨부 03(둥근 귀와 오른쪽 아래 빈 사각형)을 치즈로 확정했다. 기본값은 한칸이다.

이전 전체 맞춤 실험(PR #27)은 포함하지 않았다. 기준 main은 f86a2d2이다.

## 변경 파일과 적용 위치

- `index.html`: 꾸미기 → 앱 심볼 선택, 한칸·치즈·한걸음·체크 SVG, 로그인 후 상단 브랜드 심볼, 계정별 읽기/부분 저장/오류 복원.
- `assets/symbol-hankan.svg`: 공식 소개·공유에서 사용할 수 있는 기본 심볼 단독 SVG. 번호·문구·배경 없이 심볼만 포함한다.
- `supabase/migrations/20260927223540_tok_app_symbol.sql`: CLI가 생성한 파일. 기존 `tok_settings`에 `app_symbol`만 추가한다.
- `tests/app-symbols.cjs`: 네트워크 차단 브라우저 테스트.
- `tests/app-symbols-sql.cjs`: PGlite로 실행하는 로컬 PostgreSQL 테스트.

현재 앱에는 ‘꾸미기’ 상위 그룹이 없어 기존 테마·글꼴을 그 그룹 안에 묶고 심볼을 앞에 추가했다. 테마·글꼴의 기존 저장 방식은 바꾸지 않았다. 기존 파비콘과 설치 아이콘도 바꾸지 않았다.

## 저장 방식

테마·글꼴의 공유 localStorage 대신 이미 사용자 설정에 쓰이는 `tok_settings`의 `user_id`별 행을 재사용한다. 이 테이블의 실제 컬럼·RLS 메타데이터만 읽기 전용으로 확인했다. SELECT/INSERT/UPDATE 정책은 `auth.uid() = user_id`, UPDATE의 WITH CHECK도 같은 조건이며 RLS가 활성화되어 있다.

- `app_symbol`: `hankan | cheese | step | check`, NOT NULL, 기본 `hankan`.
- 저장은 `{user_id, app_symbol}`만 `upsert(..., {onConflict: 'user_id'})`하고 반환된 사용자·값까지 확인한다. 하루 시간·기본 색상 등을 덮어쓰지 않는다.
- 행/값이 없거나 알 수 없는 값이면 한칸.
- 계정 전환/로그아웃 시 즉시 기본값으로 초기화한다. 계정 세대와 선택/조회 버전으로 이전 사용자의 늦은 응답 및 저장 중 오래된 조회를 무시한다.
- 선택 즉시 로고를 바꾸고 저장 실패 시 마지막 확인된 값으로 복원한다. 로그인 정보 불일치·저장 반환값 불일치도 성공 처리하지 않는다.
- 심볼 선택값은 전역 localStorage에 저장하지 않는다.

사용자의 후속 푸시·배포 승인에 따라 운영 DB 마이그레이션을 프런트엔드보다 먼저 적용했다. 실제 컬럼의 NOT NULL·기본값 hankan·허용 값 제약·RLS 활성화를 확인했다. 컬럼이 없는 다른 환경에서는 읽기 실패 안내와 다시 불러오기 버튼이 표시된다.

## 검증

필요한 라이브러리를 Node 모듈 경로에 둔 상태에서:

```text
node tests/app-symbols.cjs
node tests/app-symbols-sql.cjs
```

- Playwright/Chrome: 네 심볼, 즉시 반영, 새로고침 유지, 신규/알 수 없는 값 기본값, 키보드 화살표 선택, 저장 실패 복원 통과.
- 동일 브라우저 Alice/Bob 전환, 로그아웃 기본값, 늦은 조회·저장 응답 처리 통과.
- 하양·검정·하늘·보라·분홍·치즈의 6개 테마에서 `--accent-text` 사용. 상단 배경 대비 3:1 이상을 수치 검증하고 선택 UI를 이미지로 확인했다.
- 320px·390px 심볼 그리드 줄바꿈, 가로 넘침 없음. 전체 설정 화면에 이미 존재하는 가로 넘침은 이번 검증 대상 심볼 그리드와 구분한다.
- 기존 파비콘 문자열이 main과 동일함을 검증했다.
- 기존 tests/home-layout.cjs 전체 회귀 테스트와 git diff --check도 통과했다.
- 로컬 PGlite 0.5.8: SQL 실행/재실행, 기존·신규 기본값, 네 ID 저장, 잘못된 값 거부, 기존 설정 보존, 실제 RLS 정책을 재현한 계정 간 조회/쓰기 차단 통과.
- Supabase CLI 2.118.0으로 migration new 실행. 운영 DB에는 사용자 승인 후 이 컬럼 추가만 적용했다. 사용자 행을 테스트 목적으로 조회·수정하지 않았다.

실기기·운영 API 연결 저장은 미검증.


## 운영 DB 배포 확인

2026-09-28: tok_app_symbol 적용 성공. 스키마 메타데이터 재조회로 기본값·네 ID 제약·RLS 활성화를 확인했다. 보안 Advisor에는 tok_settings 관련 항목이 없었다. 프로젝트 전체에는 이번 패치에서 변경하지 않은 Google Calendar 두 테이블의 [RLS 정책 없음 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)와 [유출 비밀번호 보호 비활성 경고](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)가 반환되었다. 해당 설정·테이블은 수정하지 않았다.
