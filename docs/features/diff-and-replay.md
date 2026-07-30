<!-- last_verified: 2026-07-30 -->
# Feature: Diff and Replay

## Purpose
Compare two compiled program versions side by side, and reproduce any prior run's configuration (optionally against a new model) — the "roll back / re-baseline" half of the versioning story.

## Used By
- UI: `/runs/diff?a=…&b=…`, and **Replay** / **Diff vs…** on `/runs/[id]`
- API: `GET /runs/diff?a=&b=`, `POST /runs/{run_id}/replay`

## Core Functions
- `services/api/app/service/runs.py` — `diff_runs()`, `replay_run()`
- `apps/web/src/components/runs/run-diff.tsx` — the side-by-side view
- `apps/web/src/lib/queries.ts` — `useRunDiff()`, `useReplayRun()`

## Canonical Files
- Diff/replay logic: `services/api/app/service/runs.py`

## Inputs
- Diff: two run ids (`a`, `b`).
- Replay: an existing run id, optional `model` override.

## Outputs
- `GET /runs/diff` → `RunDiff` (both summaries, instructions diff, demo counts, compiled scores, deltas).
- `POST /runs/{run_id}/replay` → `{run_id, status}` — a brand-new run compiled from the source run's config; the original is untouched.

## Flow
- **Diff**: pulls both manifests + compiled programs from B2, compares signature instructions (changed?), demonstration counts, and dev-set scores, and renders them side by side.
- **Replay**: reads the source run's `config`, creates a new run with the same parameters (label suffixed "(replay)", model optionally swapped), and launches it — reproducing or re-baselining a prior version.

## Edge Cases
- Either run missing → `404`.
- Diffing two identical versions → instructions marked "Identical".
- Replay of an in-flight run → allowed; it simply queues a fresh run from the recorded config.

## UX States
- Diff loading: skeleton; no ids selected → guidance to pick two runs.
- Diff loaded: two run columns + instruction comparison.
- Replay: toast + navigation to the new run's detail (with live progress).

## Verification
- Test files: `services/api/tests/test_runs.py`
- Required cases: diff of missing run 404; replay launches a new run.
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full`
- Pass criteria: `pnpm verify` green.

## Related Docs
- [Compiled Program Versioning](compiled-program-versioning.md)
- [Run Library](run-library.md)
