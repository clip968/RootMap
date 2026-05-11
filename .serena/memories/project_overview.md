# Project Overview

RootMap is a TypeScript/Next.js web app in `apps/web`. It generates prerequisite-based learning trees for a user-provided topic using the OpenRouter Chat Completions API, stores/reuses generated nodes as Concepts, tracks node understanding status, and provides next-learning recommendations.

Primary app entrypoints:
- User start page: `apps/web/src/app/page.tsx`
- Tree page: `apps/web/src/app/tree/[treeId]/page.tsx`
- Admin concept browser: `apps/web/src/app/admin/concepts/page.tsx`
- API routes under `apps/web/src/app/api/**/route.ts`

Core structure:
- `apps/web/src/components`: client/UI components such as app shell, topic form, tree client.
- `apps/web/src/db`: Drizzle SQLite client, schema, constants.
- `apps/web/src/lib/llm`: OpenRouter chat, prompts, schemas, parsing, generation.
- `apps/web/src/lib/repository`: persistence repositories for learning trees and concepts.
- `apps/web/src/lib/services`: orchestration services for generation, persistence, details.
- `apps/web/src/lib/recommendation`: next-node recommendation logic.
- `apps/web/src/lib/tree`: API conversion helpers.
- `apps/web/src/types`: shared learning/domain types.
- `apps/web/scripts`: smoke verification scripts.
- `docs/specs`: phase specs.
- `docs/plans`: phase implementation plans/checklists.

Tech stack:
- Next.js 16 App Router, React 19, TypeScript strict mode.
- Tailwind CSS v4 classes in TSX and global CSS.
- Drizzle ORM with SQLite via `better-sqlite3`.
- Zod v3 schemas for LLM/API response validation.
- `tsx` for smoke scripts.
- ESLint flat config using `eslint-config-next` core web vitals and TypeScript rules.

Package manager: npm, with `apps/web/package-lock.json`. Run commands from `apps/web` unless noted otherwise.
