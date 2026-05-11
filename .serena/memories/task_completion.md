# Task Completion Checklist

Default repo rules from `AGENTS.MD`:
- Before editing, identify target files and intended changes.
- Keep diffs small and reviewable.
- Do not create files unless the task requires it.
- Do not change public APIs, schemas, routes, auth logic, or environment variables without explicit approval.
- Run only the verification command specified by the active task. If no command is specified, choose the narrowest relevant command; for broader changes use `cd apps/web && npm run check`.
- If verification fails, stop and report the failure instead of doing speculative follow-up fixes.

Phase checklist workflow:
- Before phase work, inspect the relevant phase README checklist under `docs/plans/phase-*/README.md` (note: `AGENTS.MD` says `docs/plan/...`, but the repo currently uses `docs/plans/...`).
- After implementation, tests, and docs are complete, change only the completed checklist items from `- [ ]` to `- [x]`.
- If work differs from a plan, update the plan first, then update the README checklist if needed.
- Include completed phase/item details in the work summary.
- Repo guidance says each checklist item completion should be committed and pushed; do not do this automatically unless the user requested commit/push or the active task requires it.

Before final response:
- Check `git status --short` to understand touched/untracked files.
- Summarize changed files and verification results.
- Clearly state any verification that could not be run and why.
