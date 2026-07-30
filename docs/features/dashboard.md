<!-- last_verified: 2026-07-30 -->
# Feature: Dashboard

## Purpose
Give an at-a-glance overview of optimization-run activity: how many runs exist, the best compiled score achieved, the best improvement over baseline, runs launched today, and the most recent runs.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /runs`

## Core Functions
- `apps/web/src/components/dashboard/runs-stats-cards.tsx` — 4 stat cards derived client-side from the runs list
- `apps/web/src/components/dashboard/recent-runs-table.tsx` — the 8 most recent runs
- `apps/web/src/lib/queries.ts` — `useRuns()` (single cached query, shared with the Runs Library)
- `apps/web/src/lib/run-format.ts` — `formatScore()`, `formatDelta()` for the score displays

## Canonical Files
- Dashboard page: `apps/web/src/app/page.tsx`
- Stats derivation: `apps/web/src/components/dashboard/runs-stats-cards.tsx`

## Inputs
- None (loads the runs list automatically)

## Outputs
- `GET /runs` → `RunSummary[]`; the dashboard computes totals, best compiled score, best delta, and today's count from it.

## Flow
- Page loads → `useRuns()` fetches the run summaries (one query, reused by the stat cards and the recent-runs table).
- Stat cards show total runs, best compiled score, best improvement, and runs today.
- The recent-runs table lists the 8 newest runs with status badge and before→after delta; each row links to the run detail.
- The list polls every 4s while any run is still `queued`/`running`, so a running→completed transition appears without a manual refresh.

## Edge Cases
- API unavailable → inline `ErrorState` with retry (never a false "0 runs").
- No runs yet → empty stat values ("—") and an empty recent-runs table with a call to launch a run.
- Runs still compiling → their delta shows "—" until they complete.

## UX States
- Loading: skeleton stat cards and table rows.
- Empty: "No runs yet" with a link to **New run**.
- Loaded: populated cards and recent-runs table.

## Verification
- Test files: `services/api/tests/test_runs.py`, `apps/web/src/lib/queries.test.ts`
- Required cases: runs list rendered, empty state, API error fallback.
- Focused verify command: `pnpm test:web`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: focused tests and `pnpm verify` green.

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Run Library](run-library.md)
- [App Workflows](../app-workflows.md)
