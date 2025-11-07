최소한의 모듈화 설계 진행하세요.

반드시 다음 순서를 따라야한다.

1. 문서들의 내용을 통해 자세한 요구사항을 파악한다.
2. 코드베이스에서 관련 파일들을 탐색하여 이미 구현된 기능, convention, guideline 등을 파악한다. `docs/common-modules.md` 문서에서 공통 모듈들도 참고한다.
3. 구현해야할 모듈 및 작업위치를 설계한다. AGENTS.md의 코드베이스 구조를 반드시 지킨다. shared로 분리가능한 공통 모듈 및 제네릭을 고려한다.
   완성된 설계를 다음과 같이 구성하여 `docs/pages/N-name/plan.md` 경로에 저장한다.

- 개요: 모듈 이름, 위치, 간략한 설명을 포함한 목록
- Diagram: mermaid 문법을 사용하여 모듈간 관계를 시각화
- Implementation Plan: 각 모듈의 구체적인 구현 계획. presentation의 경우 qa sheet를, business logic의 경우 unit test를 포함.
