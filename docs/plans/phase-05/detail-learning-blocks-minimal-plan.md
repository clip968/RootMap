# Plan

RootMap node detail pages should explain concepts with optional learning blocks, not force every card into one visual format. The minimal implementation keeps existing detail data and generation logic unchanged, then renders helpful blocks only when the current node data supports them.

## Scope
- In:
  - Add optional detail learning blocks for summary, concept position, relationship flow, examples, and misconception reminders.
  - Allow multiple blocks to appear together when useful.
  - Use existing `selectedNode`, `relations`, and `detail` data only.
  - Keep the existing quiz/check section as-is without adding a new quiz-card interaction.
- Out:
  - Do not change LLM prompts, detail response schema, persistence, API contracts, or generation retries.
  - Do not force a table or diagram into every node.
  - Do not add rich visual-block authoring until a later schema change.

## Action items
[x] Add a reusable detail learning blocks component under `apps/web/src/components/`.
[x] Render blocks in the detail modal only after detail data is loaded.
[x] Add CSS for relation flow, compact concept facts, example card, and misconception cards.
[x] Keep quiz-card work out of this pass.
[x] Verify with `npm run lint`, `npm run build`, and `git diff --check`.

## Open questions
- None for this minimal pass.
