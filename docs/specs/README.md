# docs/specs/

이 디렉토리는 **피처 사양(Feature Specifications)** 을 보관합니다.

## 컨벤션

- 파일명: `<feature>.md`
- 예시: `user-auth.md`, `payment-integration.md`
- 각 문서는 구현의 **권위 있는 출처(authoritative source)** 입니다.
- Senior 모델만 이 문서를 직접 읽습니다.
- Worker 모델은 `.agent/plan.md`를 통해 간접적으로 참조합니다.

## 템플릿

```markdown
# <Feature Name> Specification

## Overview
<기능 개요>

## Requirements
1. <요구사항 1>
2. <요구사항 2>

## Constraints
- <제약사항>

## Acceptance Criteria
- [ ] <수락 기준>
```
