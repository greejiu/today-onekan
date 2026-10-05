# 지금 한칸 1차 베타 준비

기준 main: 58576bbaaa1debb0f9c320312b967c345c5dd78c. 작업 브랜치: codex/home-only-beta.
이번 작업에서 배포, 푸시, 운영 DB/인증 설정 변경은 하지 않았다.

## 구현

- `assets/release-policy.js`: 탭별 서비스 공개 정책. 현재 일반 계정은 home/settings만 허용한다. 이후 공개는 pages의 해당 항목으로 관리한다.
- 운영자는 `auth.getUser()`로 서버에서 확인한 `app_metadata.today_onekan_operator === true`만 인정한다. 사용자 편집 가능 user_metadata, 이메일 문자열, 로컬 세션의 권한 주장은 사용하지 않는다. 확인 전/오류/계정 전환은 일반 공개 범위다.
- `assets/navigation.js`: 저장된 navigation_config와 공개 정책의 교집합으로 데스크톱 레일/전체 메뉴/모바일/더보기를 렌더링한다. 일반 사용자에게 home은 항상 제공한다. 미공개 항목은 비활성화하고 준비 중 문구를 표시한다. 기존 개인 설정은 덮어쓰지 않는다.
- `index.html`: showPage에서 미공개 진입을 home으로 돌린다. 타이머 우클릭 메뉴, 프로젝트 연결 입력/진입, 같이한칸 업로드를 제한한다. 계정/로그아웃/꾸미기/시간/홈에서 사용하는 분류 설정은 유지한다. 운영자 미리보기는 세션 메모리에만 존재한다.
- `assets/tracking.js`, `assets/together.js`: 일반 공개 범위에서 비공개 기능의 조회/실행을 막는다. 홈의 일정/할일/습관/그룹/범주/프로젝트 연결 데이터 로딩은 유지해 기존 항목 표시와 수정에 필요한 데이터가 끊기지 않는다. 가려진 프로젝트 선택값을 초기화하지 않는다.
- `assets/password-recovery.js`: 메일 요청, PASSWORD_RECOVERY 이벤트의 서버 사용자 확인, 새 비밀번호/확인 입력, 성공 후 현재 기기 로그아웃, 잘못된/만료 링크 및 재발송을 제공한다. boot/인증 이벤트보다 재설정 화면이 우선한다. 유효 링크에서 시작한 거래는 해당 탭의 sessionStorage에 사용자/만료시각만 보관하여 새로고침 후 이어간다. 비밀번호/토큰은 저장하지 않는다.
- 가입 메일 확인이 필요한 경우 안내하고, 즉시 세션이 생성되면 앱을 연다.
- 회귀 검증 중 발견한 기본 그룹 눈 아이콘의 잘못된 SVG 경로를 수정했고, 기간 테스트의 일정 범주 선택을 최신 main의 그룹 전용 구조에 맞췄다.

이 정책은 앱의 메뉴/진입/연결 동작을 제한하는 공개 정책이다. 프런트엔드는 Supabase RLS의 대체물이 아니며, 자신의 데이터에 대한 직접 API 접근을 금지하는 신규 백엔드 권한 모델을 추가한 것은 아니다. 기존 소유자 RLS와 개인 데이터는 그대로 유지한다.

## 운영에서 직접 확인한 상태

프로젝트: mmpsyajgyufdxmmnxqba.

- 운영자 이메일 monggreee@naver.com의 확인된 계정 UUID는 SQL 스크립트에 명시했다. 현재 운영자 플래그는 없다. 아직 스크립트를 실행하지 않았으므로 실제 운영 계정의 전체 기능 검증은 완료하지 않았다.
- Auth Site URL: `https://greejiu.github.io/when-did-i-do-it/`.
- Redirect allowlist: 위의 예전 주소 1개만 등록되어 있다.
- Custom SMTP: 꺼져 있다. 기본 발송 서비스는 팀 구성원 주소 등에 제한되어 공개 가입 검증에 충분하지 않다. 공식 안내: https://supabase.com/docs/guides/auth/auth-smtp
- 대시보드에 quota grace period 종료 경고가 표시된다. 실제 사용량과 서비스 지속 가능 여부를 공개 전에 확인해야 한다.

## 배포 전 남은 작업

1. trusted 관리자 환경에서 `supabase/manual/provision_beta_operator.sql`을 실행한다. 본 작업에서는 적용하지 않았다. 기존 app_metadata의 다른 키는 보존한다.
2. Site URL을 `https://greejiu.github.io/today-onekan/`으로 변경하고 redirect allowlist에 아래를 정확히 등록한다.
   - `https://greejiu.github.io/today-onekan/`
   - `https://greejiu.github.io/today-onekan/?auth=recovery`
3. 공개 가입에 사용할 SMTP와 발신 도메인/주소를 설정하고 가입 확인/재설정 템플릿의 ConfirmationURL 링크 및 실제 발송 제한을 확인한다. 문서: https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
4. 새 코드의 테스트 호스팅 주소를 제공한다. 테스트 주소를 사용할 경우 해당 주소와 recovery callback도 정확히 허용하고 코드의 redirect 주소를 일치시켜야 한다. 기존 운영 코드는 새 재설정 화면을 처리하지 않으므로 현재 주소로 재설정 메일을 보내는 것만으로 새 흐름을 검증할 수 없다.
5. 일반 신규 테스트 계정 yejjin21@naver.com으로 가입 확인 메일 수신 → 로그인 → 홈 할일 추가/완료 → 로그아웃/재로그인 후 유지 → 재설정 메일 수신/링크 열기/새 비밀번호 변경을 직접 검증한다. 비밀번호는 사용자가 직접 입력한다. 현재 실제 가입/메일 발송/비밀번호 변경은 수행하지 않았다.
6. 실제 운영자 계정으로 모든 탭과 연결 기능, 미리보기, 일반 계정으로 전환 후 메뉴/데이터/권한 응답의 격리를 검증한다. 자동 테스트는 모의 인증/데이터로 검증한 것이며 실제 계정의 검증을 대체하지 않는다.

## 자동 검증

테스트는 운영 네트워크를 차단하고 모의 Supabase로 실행한다.

- beta-release: 초기 차단, user_metadata 권한 위조 무시, 계정 전환의 늦은 응답 무시, 운영자/미리보기, 일반 PC/390px 모바일 메뉴/진입, 준비 중 설정, 타이머 실행 차단, 홈 할일 추가/완료/재로딩, 재설정 중 boot 차단.
- password-recovery: 유효 이벤트, 확인값 불일치, 변경/현재 기기 로그아웃, 잘못된/만료 링크, 재발송 제한 및 운영 callback.
- navigation-settings: 기존 메뉴 순서/숨김 저장, 계정 격리/경합/실패 복원, PC/390px 모바일 공유 메뉴.
- app-symbols: 꾸미기 저장/복원, 계정 격리, 모바일과 테마.
- group-defaults: 그룹 기본값/색상/기존 연결 보존/저장 실패 복원.
- period-ui: 세 종류의 입력·수정·기간/반복/이동/복제 및 PC/390px 표시.
- tracking-integrated: 로컬 실제 SQL과 두 브라우저를 이용한 운영자 타이머 동시성/재시도/복원. 운영 Supabase를 변경하지 않는다.

변경 파일과 추가 테스트는 Git diff로 확인 가능하다. 배포 가능 판정은 위의 실제 계정/메일/운영 설정 검증이 끝난 뒤 내린다.
