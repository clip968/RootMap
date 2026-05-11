# Style and Conventions

Repository guidance from `AGENTS.MD`:
- Prefer small, reviewable diffs.
- Do not create new files unless explicitly required.
- Do not change public APIs, database schemas, routes, auth logic, or environment variables without explicit approval.
- Before editing, identify target files and intended changes.
- Run only the verification command specified by the active task.
- If verification fails, stop and report; avoid speculative logic fixes.
- For phase work, use phase README checklists as the progress source and only mark completed items after implementation, tests/docs, and verification.

Code conventions observed:
- TypeScript strict mode; use explicit exported types from `src/types` and local return types where useful.
- Imports use the `@/*` path alias for `apps/web/src/*`.
- React client components start with `"use client"`; hooks are imported from React and Next navigation APIs from `next/navigation`.
- Components and React exports use PascalCase; local helpers use camelCase; constants use UPPER_SNAKE_CASE.
- Domain/API payloads often use snake_case fields matching LLM/API contracts, while DB schema fields use camelCase property names mapped to snake_case SQLite columns.
- Zod schemas validate external/LLM data and transform into domain response types. Prefer structured validation over ad hoc parsing.
- Drizzle schema uses `sqliteTable`, typed JSON columns via `.$type<T>()`, UUID defaults via `crypto.randomUUID()`, and indexes/uniqueIndexes declared in the table callback.
- UI text is primarily Korean. Preserve the existing tone and terminology: Tree, Concept, 선수지식, 핵심 개념, 오개념, 이해 점검.
- Styling is Tailwind utility classes with light/dark variants; existing UI uses zinc/emerald colors, rounded panels, and responsive flex/grid classes.
- Comments are sparse and usually document phase/task-specific guardrails or schema sections; keep new comments concise and purposeful.
