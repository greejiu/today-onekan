# AGENTS.md

오늘한칸 저장소의 작업 규칙은 [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md)를 따른다.

- Codex는 화면, 디자인 설계, 저장, 이동, 권한, 검증처럼 연결이 많은 작업을 맡는다.
- Claude Code는 코드 검토, 자잘한 버그 수정, 프롬프트로 하는 작업을 맡는다.
- 시작할 때 로컬이 `origin/main`과 같은지 확인하고, 끝날 때 main과 배포본이 같은지 확인한다.
- 구현한 AI가 기본 검증까지 끝낸다.
- 사용량이 소진되기 전에 `docs/handoff/`에 인계를 남기고, 남은 AI가 이어받는다.
