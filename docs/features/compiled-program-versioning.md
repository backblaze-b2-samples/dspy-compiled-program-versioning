<!-- last_verified: 2026-07-30 -->
# Feature: Compiled Program Versioning

## Purpose
Turn each `optimizer.compile()` result into a durable, versioned artifact on B2, so compiled DSPy programs accumulate append-only and can be inspected, downloaded, and rolled back to.

## Used By
- UI: `/runs/[id]` (compiled program section, artifact downloads)
- API: `GET /runs/{run_id}`, `GET /runs/{run_id}/artifact?name=…`

## Core Functions
- `services/api/app/repo/dspy_runner.py` — `_dump_state()` (writes `program.save()` JSON, falls back to `dump_state()`), `_extract_demos()`
- `services/api/app/repo/run_store.py` — per-artifact `put_object`; `artifact_key()` + presigned download
- `services/api/app/service/runs.py` — `get_artifact_url()`

## Canonical Files
- Compiled-state serialization: `services/api/app/repo/dspy_runner.py::_dump_state`

## Inputs
- The compiled `dspy` program produced by a run.

## Outputs
- `runs/<run_id>/program/compiled.json` — human-diffable JSON state (prompts + demos), never a pickle.
- `runs/<run_id>/program/demos.json` — the bootstrapped demonstration set.
- `GET /runs/{run_id}/artifact?name=compiled|demos|…` → `{url}` presigned download.

## Flow
- On a successful run, the compiled program's JSON state and demos are written as separate B2 objects.
- Each run gets its own `runs/<run_id>/` prefix, so a new run never overwrites a prior version — versions accumulate append-only.
- The detail page renders the signature instructions, input/output fields, and demo table, and offers a presigned download of each raw artifact.

## Edge Cases
- DSPy `save()` signature differs across versions → falls back to `dump_state()`; result is always plain JSON.
- Requesting an unknown artifact name → `400`.
- Downloading an artifact for a missing run → `404`.

## UX States
- Loaded: compiled-program card + artifact download buttons + artifact key list.
- Missing (run failed before compile): section omitted.

## Verification
- Test files: `services/api/tests/test_runs.py`
- Required cases: unknown-artifact 400; presigned URL path.
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full`
- Pass criteria: `pnpm verify` green.

## Related Docs
- [Optimization Runs](optimization-runs.md)
- [Diff and Replay](diff-and-replay.md)
