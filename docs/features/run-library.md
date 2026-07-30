<!-- last_verified: 2026-07-30 -->
# Feature: Run Library

## Purpose
Browse every optimization run stored under the sample's B2 prefix (`runs/`) — the curated, run-scoped explorer that complements the full-bucket Files browser.

## Used By
- UI: `/runs` (list), `/runs/[id]` (detail)
- API: `GET /runs`, `DELETE /runs/{run_id}`

## Core Functions
- `apps/web/src/components/runs/runs-table.tsx` — the library table
- `apps/web/src/app/runs/page.tsx` — the Runs page
- `services/api/app/service/runs.py` — `list_runs()`, `delete_run()`
- `services/api/app/repo/run_store.py` — `list_run_ids()` (list_objects_v2 with `/` delimiter), `delete_run()` (recursive, prefix-scoped)

## Canonical Files
- Library table: `apps/web/src/components/runs/runs-table.tsx`
- Run listing (B2): `services/api/app/repo/run_store.py::list_run_ids`

## Inputs
- None (loads the run list automatically).

## Outputs
- `GET /runs` → `RunSummary[]` (sorted newest-first).
- `DELETE /runs/{run_id}` → `{deleted, run_id, objects}`; recursively deletes every object under `runs/<run_id>/` only.

## Flow
- The page lists each run with label, status badge, model, optimizer, before→after delta, and created-at; a row links to detail.
- Delete (from the detail page, behind a confirm dialog) removes the whole bundle for that one run — scoped strictly to `runs/<run_id>/`, never touching other runs or non-run objects.
- The list polls while any run is active so statuses update live.

## Edge Cases
- Empty prefix → empty state with a "New run" call to action.
- API error → inline `ErrorState` with retry.
- Delete of a missing run → `404`.

## UX States
- Loading: skeleton rows.
- Empty: "No optimization runs yet".
- Loaded: table of runs.

## Verification
- Test files: `services/api/tests/test_runs.py`
- Required cases: list rendering, delete scoped to prefix, delete of missing run 404.
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full`
- Pass criteria: `pnpm verify` green.

## Related Docs
- [Optimization Runs](optimization-runs.md)
- [File Browser](file-browser.md)
