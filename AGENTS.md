# Repository Guidelines

## Project Structure & Module Organization
- `apps/web` – Next.js app-router UI; tests live in `tests/` and colocated `*.test.ts[x]`.
- `packages/*` – shared TypeScript modules (`domain`, `api`, `config`, `ui`, `msw`, `optimizer-client`, `supabase` migrations). Tests stay next to each `src`.
- `services/optimizer-py` – FastAPI optimizer stub consumed by the client/MSW contracts; milestone docs sit in `docs/` plus `IMPLEMENTATION_SUMMARY.md`.

## Build, Test, and Development Commands
- `pnpm install` (or `pnpm install:repo`) bootstraps workspaces through Corepack with Node 20.
- `pnpm dev` fans out Turbo `dev` scripts; scope with `pnpm --filter web dev` when focusing on the UI.
- `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` all forward to `turbo run <task>`—wire new packages inside `turbo.json`.
- Contracts/E2E: `pnpm --filter @route-kun/msw test`, `pnpm --filter web e2e` (set `CI=true`), `pnpm --filter @route-kun/supabase exec supabase db push`.

## Coding Style & Naming Conventions
- Strict TypeScript config (`tsconfig.base.json`) with workspace aliases (`@route-kun/*`); choose descriptive filenames such as `route-map.tsx`.
- ESLint (`.eslintrc.cjs`) exposes Node + browser globals; extend package configs instead of disabling rules inline.
- Prettier enforces 2-space indent, semicolons, single quotes, trailing commas, and 100-column wrapping—use `pnpm exec prettier --write` before large diffs.
- Components stay PascalCase, hooks use `useX`, shared constants adopt `SCREAMING_SNAKE_CASE`, and env keys sit in `packages/config`.

## Testing Guidelines
- `pnpm test` runs Turbo’s `generate → typecheck → test`; keep new tasks deterministic and side-effect free.
- UI unit suites rely on Vitest + Testing Library; colocate fixtures and prefer resilient `screen.` queries.
- Contract tests in `packages/msw` expect `uvicorn optimizer_service.main:app --port 8001`; Playwright specs live in `apps/web/tests` and mirror feature names (`route-history.spec.ts`).

## Commit & Pull Request Guidelines
- Follow existing history: short, capitalized, imperative subjects (e.g., `Update test command…`), with optional body bullets for context.
- Link issues, describe risk, and list commands run (`pnpm typecheck && pnpm test && pnpm --filter web e2e`); attach UI screenshots or Playwright artifacts for UX-facing changes.
- Rebase on `main` before opening; GitHub Actions runs typecheck, unit, contract, migration, and e2e jobs, so chase failures locally first.

## Security & Configuration Tips
- Copy `.env.example` to `.env.local` and fill `NEXT_PUBLIC_MAPBOX_TOKEN`, `GOOGLE_MAPS_API_KEY`, `SUPABASE_*`, and `OPTIMIZER_SERVICE_URL`; never commit secrets.
- `packages/supabase/supabase/migrations` is the schema source of truth—apply updates via the pnpm wrapper so `migration-check` stays green.
- Python 3.11 (`.python-version`) powers `services/optimizer-py`; start it with `uvicorn optimizer_service.main:app --reload --port 8001` before contract/E2E suites.
