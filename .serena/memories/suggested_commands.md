# Suggested Commands

Run from repo root unless the command starts with `cd apps/web`.

Setup and local run:
- `cd apps/web`
- `npm install`
- `cp .env.example .env.local`
- Edit `.env.local` with `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL`, and `DATABASE_URL=file:./data/rootmap.db`.
- `npm run db:push`
- `npm run dev`
- Open `http://localhost:3000`; admin concepts page is `http://localhost:3000/admin/concepts`.

Verification:
- `cd apps/web`
- `npm run lint`
- `npm run db:smoke`
- `npm run llm:smoke-parse`
- `npm run phase1:smoke`
- `npm run phase2:smoke`
- `npm run build`
- `npm run check` runs lint, DB smoke, LLM parse smoke, Phase 1 smoke, Phase 2 smoke, and production build/type check.

Database/dev tools:
- `cd apps/web && npm run db:generate`
- `cd apps/web && npm run db:push`
- `cd apps/web && npm run db:studio`

Useful Linux/repo commands:
- `rg --files` to list files quickly.
- `rg "pattern" path` to search text.
- `find path -maxdepth N -type f` for directory shape when needed.
- `git status --short`
- `git diff -- path`
- `git add <paths>`
- `git commit -m "<message>"`
- `git push`
