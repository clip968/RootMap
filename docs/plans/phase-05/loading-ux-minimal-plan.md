# Plan

RootMap tree generation can take close to a minute, so the loading UI should make the wait understandable without changing the generation pipeline. The minimal approach is to add a reusable visual loading panel that uses the existing elapsed-time and stage-message state.

## Scope
- In:
  - Add a lightweight loading panel for topic generation and tree regeneration.
  - Show elapsed time, current phase, expectation copy, and a small animated map skeleton.
  - Reuse existing `loading`, `regenLoading`, `elapsedSeconds`, and `generationStageMessage` logic.
- Out:
  - Do not change LLM calls, API contracts, persistence, retries, or progress tracking.
  - Do not add fake percentage progress.
  - Do not introduce new dependencies.

## Action items
[x] Add a reusable UI-only component under `apps/web/src/components/`.
[x] Replace the simple topic-generation loading box in `start-topic-form.tsx`.
[x] Replace the simple regeneration loading box in `tree-page-client.tsx`.
[x] Add small CSS animations for map skeleton nodes and connecting lines.
[x] Keep copy based on elapsed time and reuse-concepts context.
[x] Verify with `npm run lint`, `npm run build`, and `git diff --check`.

## Open questions
- None for this minimal pass.
