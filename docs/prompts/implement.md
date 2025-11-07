모든 초기 문서 작성을 완료한 뒤 다음과 같이 작업하라.
plan-writer 에이전트로 모든 계획을 병렬로 작성한 뒤, implementer 에이전트를 병렬로 사용해서 구현한다.

1. common-task-planner 에이전트를 사용하여 /docs/common-modules.md 경로에 공통 모듈 작업 계획을 작성하라.
2. implementer 에이전트를 사용해서 작성한 공통 모듈 작업 계획을 정확히 구현하라.
3. state-planner 에이전트를 사용해서 **채팅방 상세** 페이지에 대한 상태관리 설계를 `docs/pages/N-name/state.md` 경로에 적절한 번호, 페이지명으로 작성한다. 다른 페이지들에 대해서는 절대 상태관리설계를 하지 않는다.
4. plan-writer 에이전트를 사용하여 PRD에 포함된 페이지에 대한 구현 계획을 `docs/pages/N-name/plan.md` 경로에 작성하라. 이들은 모두 병렬로 실행되어야한다.
5. implementer 에이전트를 사용해서 작성한 구현 계획을 정확히 구현하라. 이들은 모두 병렬로 실행되어야한다.
