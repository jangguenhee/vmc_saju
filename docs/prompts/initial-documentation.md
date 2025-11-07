## 초기 문서 작성

다음과 같이 작업하라.
각 단계는 모두 직렬로 수행하되, usecase-writer 에이전트만 병렬로 수행한다.

1. prd-writer 에이전트를 사용하여 /docs/prd.md 경로에 PRD 문서를 작성하라.
2. userflow-writer 에이전트를 사용하여 /docs/userflow.md 경로에 Userflow 문서를 작성하라.
3. database-architect 에이전트를 사용하여 /docs/database.md 경로에 데이터베이스 설계를 작성하라.
4. database-critic 에이전트를 사용하여 /docs/database.md 경로에 있는 데이터베이스 설계를 개선하라.
5. `/docs/userflow.md` 문서를 읽고, 여기 언급된 기능들에대해 usecase-writer 에이전트를 사용하여 유스케이스 문서를 작성하라.
