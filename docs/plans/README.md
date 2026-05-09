# docs/plans/

이 디렉토리는 **구현 계획(Implementation Plans)** 을 보관합니다.

## 컨벤션

- 파일명: `<feature>-plan.md`
- 예시: `user-auth-plan.md`, `payment-integration-plan.md`
- Spec 문서(`docs/specs/`)를 기반으로 구체적인 구현 단계를 정의합니다.
- Senior 모델이 이 문서를 읽고 Worker에게 전달할 실행 패킷을 생성합니다.

## 템플릿

```markdown
# <Feature Name> Implementation Plan

## Reference Spec
- `docs/specs/<feature>.md`

## Phases
### Phase 1: <Phase Name>
1. <구현 단계>
2. <구현 단계>

### Phase 2: <Phase Name>
1. <구현 단계>

## Test Strategy
- <테스트 전략>

## Risk Areas
- <위험 영역>
```
