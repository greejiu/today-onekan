# Codex · Claude Code 작업 분담

결정일: 2026-10-09. 두 AI를 모두 구독하되 한 곳에서 사용량이 모자라지 않도록 나눠 쓰기 위한 규칙이다.
`CLAUDE.md`와 `AGENTS.md`는 이 문서를 가리킨다. 규칙을 바꾸면 이 문서를 먼저 고친다.

## 역할

| AI | 맡는 작업 |
|---|---|
| Codex | 화면, 디자인 설계, 저장, 이동, 권한, 검증처럼 연결이 많은 작업 |
| Claude Code | 코드 검토, 자잘한 버그 수정, 프롬프트로 하는 작업 |

## 공통 규칙

1. **로컬 파일을 기준으로 작업한다.** 시작할 때 로컬이 `origin/main`과 같은지 먼저 확인하고, 뒤처졌으면 최신으로 맞춘 뒤 시작한다. (보충: 2026-10-09에 로컬 폴더가 main보다 119커밋 뒤처져 있던 일이 있었다.)
2. **마지막에 main 파일과 배포된 파일이 같은지 항상 확인한다.** 배포 주소는 `https://greejiu.github.io/today-onekan/`이다. 병합 후 Pages 배포가 끝난 뒤 비교한다.
3. **구현한 AI가 기본 검증까지 끝낸다.** 관련 `tests/` 실행과 화면 확인까지 하고, 실행하지 못한 검증은 못 했다고 기록한다.
4. **한쪽 사용량이 소진되면 남은 AI가 그 작업을 인계받는다.**
5. **사용량이 소진되기 전에 인계를 남긴다.** 아래 방법을 따른다.

## 인계 남기는 방법 (기본안)

- 하던 변경은 작업 브랜치에 커밋하고 푸시한다. 로컬에만 두지 않는다.
- `docs/handoff/` 에 작업당 파일 하나를 만든다. 이름은 `YYYY-MM-DD-작업명.md`, 형식은 [TEMPLATE.md](handoff/TEMPLATE.md).
- 인계받은 AI는 그 파일과 브랜치 상태를 먼저 확인한 뒤 이어서 진행한다. 작업이 끝나면 인계 파일의 상태를 `완료`로 바꾼다.

## main과 배포본 비교 (예시)

로컬 PC(PowerShell)에서 실행한다. 아직 실제로 돌려 본 적 없는 예시이므로, 처음 쓸 때 결과가 맞는지 확인한다.

```powershell
git fetch origin
Invoke-WebRequest https://greejiu.github.io/today-onekan/ -OutFile $env:TEMP\deployed.html
git hash-object --no-filters $env:TEMP\deployed.html
git rev-parse origin/main:index.html
```

두 해시가 같으면 배포본과 main의 `index.html`이 같다. 다르면 Pages 배포가 아직 끝나지 않았거나 캐시일 수 있으니 잠시 뒤 다시 확인한다.
