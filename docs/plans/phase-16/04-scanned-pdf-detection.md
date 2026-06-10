# 04. 스캔본 감지와 안내 처리

## 목표

스캔본 PDF나 표·그림 위주 문서를 감지해 명확히 안내한다. OCR을 붙이지 않고 "감지 → 안내 → 텍스트 PDF/TXT/MD 재요청"으로 처리한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 5.5

## 관련 파일

- `apps/web/src/lib/document/extract-pdf.ts`
- `apps/web/src/lib/document/extract-text.ts`
- `apps/web/src/lib/document/processor.ts`
- `apps/web/src/lib/document/upload-validation.ts`
- `apps/web/src/app/api/documents/**`

## 구현 작업

### 1. 스캔본 감지

- 추출된 텍스트량이 페이지 수 대비 임계 이하이면 스캔본/이미지 위주 문서로 판정한다.
- 판정 임계값과 근거를 상수로 명시한다.

### 2. 안내 처리

- 감지 시 처리를 중단하고 사용자에게 "텍스트 추출 불가 → 검색 가능한 PDF, TXT, MD로 재업로드" 안내를 반환한다.
- README의 "스캔본 PDF는 실패" 안내와 일치하는 메시지를 사용한다.

### 3. 상태·로그

- 문서 처리 상태에 스캔본 감지 사유를 남겨 runner/Actions 로그에서 확인 가능하게 한다.

## 완료 기준(DoD)

- 추출 텍스트량이 임계 이하인 문서가 스캔본으로 감지된다.
- 감지 시 명확한 안내와 함께 실패 처리된다.
- OCR을 도입하지 않는다.

## 검증 명령

```bash
cd apps/web
npm run document:extract-smoke
npm run check
```
