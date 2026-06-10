# LLM Evaluation

## Scope

Phase 06 evaluates document-grounded generation before adding a full RAG chat surface.

## Small CI Eval

- JSON schema validity.
- Claim to evidence mapping.
- Unsupported claim count.
- Unsupported rate by source type: `explicit`, `inferred`, `generated`.
- Prompt injection red-team fixture detection.

## Full Eval

Run manually or on a schedule when LLM cost is acceptable. Suggested fixtures:

- Transformer paper notes.
- Operating systems lecture material.
- Rust lifetime notes.

## Current Rule

`evaluateEvidenceGrounding` is a lightweight lexical guard, not an LLM judge. It is designed to catch obvious missing evidence and low-overlap claims cheaply.

`scanPromptInjectionRisk` flags instruction-like document content. Initial policy is risk flagging rather than hard blocking.

## Tree Eval (Phase 12)

Phase 12 adds a deterministic (no-LLM) quality layer for generated learning trees so that
improvements in later phases are measured as score deltas instead of "feels better".

### Components

- Golden fixtures: `apps/web/evals/fixtures/topics/*.ts` (>= 10 hand-curated CS topics).
  Each fixture (`TreeEvalFixture`) lists `expected_concepts`, `required_edges`,
  `forbidden_edges`, `beginner_misconceptions`, and `required_examples`.
- Scorer: `apps/web/src/lib/evaluation/tree-eval.ts` →
  `evaluateLearningTree(tree, fixture): TreeEvalResult`.
- Runner: `apps/web/scripts/eval-tree.ts` → `npm run eval:tree`.

### Scores (`TreeEvalResult`, all 0~1, `clampScore` normalized)

- `coverage_score`: ratio of `expected_concepts` matched to node title/alias
  (matching reuses `lib/concepts/normalize.ts`).
- `prerequisite_score`: `required_edges` satisfied and `forbidden_edges` absent.
  A reversed required edge is an `error` (`REVERSED_PREREQUISITE`); a present forbidden
  edge is an `error` (`FORBIDDEN_EDGE`). Prerequisite direction is `from` = prerequisite,
  `to` = dependent.
- `ordering_score`: fraction of prerequisite pairs whose order in `recommended_order`
  respects the `deriveLearningGraphView` depth topological order.
- `pedagogy_score`: presence of learning objective / mastery evidence (Phase 14) plus
  available assessment signals (quiz / misconception nodes). When Phase 14 fields are
  absent, the scorer records a `MISSING_LEARNING_CONTRACT` warn and excludes them from
  the denominator instead of scoring 0 (keeps phases decoupled).
- `detail_score`: heuristic self-containment of node descriptions
  (min length, no placeholder, no dangling "as above" reference).

### Quality warnings absorbed

`learningTreeQualityWarnings` (`lib/llm/schemas.ts`) now delegates to
`collectTreeQualityFailures` in `tree-eval.ts`, so every legacy warning appears as a
structured `warn` failure with a stable `code` (`NODE_COUNT_OUT_OF_RANGE`,
`INSUFFICIENT_*_NODES`, `DUPLICATE_ORDER_ID`, `MISSING_ORDER_ID`, `TOPIC_MISMATCH`).
The returned warning strings and order are unchanged (no regression in `generate-tree.ts`).

### Running

```bash
cd apps/web
npm run eval:tree                 # default: no-LLM, prints per-topic table + average
npm run eval:tree:self-check      # validate the scoring rules themselves
npm run eval:tree:live -- --user-id <uuid>   # score real generated trees (LLM cost)
npm run eval:tree -- --json       # machine-readable output (for baseline capture)
npm run eval:tree -- --min-coverage 0.8 --min-prerequisite 0.8   # threshold gates
```

Input source for the default (CI) mode: a stored tree at
`evals/fixtures/trees/<slug>.json` if present, otherwise a deterministic tree synthesized
from the fixture. This keeps `npm run eval:tree` LLM-free. The true model-quality baseline
is produced by `--live`.

### Exit code policy

- Any `error` severity failure → non-zero exit (CI fails).
- A `--min-*` threshold violated by the average → non-zero exit.
- Only `warn` failures → exit 0.

### Baseline (deterministic synthetic, no-LLM)

`npm run eval:tree` over the 10 golden fixtures with fixture-synthesized trees:

| topic | coverage | prereq | pedagogy | ordering | detail | err | warn |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Transformer | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| Rust lifetime | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| 가상 메모리 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| B-tree index | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| TCP congestion control | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| Linux block layer | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| 운영체제 스케줄링 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| 데이터베이스 트랜잭션 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| 컴파일러 파이프라인 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| 분산 시스템 consensus | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 1 |
| **AVERAGE** | **1.00** | **1.00** | **1.00** | **1.00** | **1.00** | **0** | **10** |

The single warn per topic is `MISSING_LEARNING_CONTRACT` (learning objective / mastery
evidence land in Phase 14). This synthetic baseline is the fixture-faithful ceiling and a
regression guard for the scorer + fixtures. The real generation baseline must be captured
with `npm run eval:tree:live` once provider settings are configured, and recorded here for
Phase 13~18 comparison.
