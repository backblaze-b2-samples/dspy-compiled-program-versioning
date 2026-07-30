<!-- last_verified: 2026-07-30 -->
# Feature: Optimization Runs

## Purpose
Compile an improved DSPy program against a local Ollama model and persist it — plus its demonstrations, trace, and before/after scores — to Backblaze B2 as a versioned, append-only run bundle. This is the app's primary feature and primary entity.

## Used By
- UI: `/runs/new` (create form), `/runs/[id]` (detail with live progress)
- API: `POST /runs`, `GET /runs/{run_id}`, `GET /runs/ollama-status`
- Job: background worker thread in `service/runs.py::_execute_run`

## Core Functions
- `services/api/app/repo/dspy_runner.py` — `run_optimization()` (all DSPy/Ollama access, lazily imported), `ollama_status()`
- `services/api/app/repo/run_store.py` — writes each artifact to B2 (`put_object`)
- `services/api/app/service/runs.py` — `create_run()`, `_execute_run()` (Ingest→Optimize→Store→Evaluate→Query)
- `services/api/app/runtime/runs.py` — the `/runs*` router
- `services/api/app/seed/` — bundled `task.json`, `train.jsonl`, `dev.jsonl`
- `apps/web/src/components/runs/run-form.tsx`, `run-detail-view.tsx`

## Canonical Files
- Provider adapter (contained DSPy/Ollama): `services/api/app/repo/dspy_runner.py`
- Workflow orchestration: `services/api/app/service/runs.py`

## Inputs
- `RunConfig` (POST body): label, task, optimizer, model, metric, max_bootstrapped_demos, max_labeled_demos, notes — all finite fields validated against allowed sets.

## Outputs
- `POST /runs` → `{run_id, status: "queued"}` (202, returns immediately)
- Side effects: writes `runs/<run_id>/{run.json, input/task.json, program/compiled.json, program/demos.json, trace/optimization.jsonl, eval/scores.json}` to B2 as each step completes.

## Flow
1. **Ingest** — load the seed task + train/dev datasets; write the queued manifest and input bundle to B2; launch a background thread; return `{run_id, status}`.
2. **Optimize** — configure `dspy.LM("ollama_chat/<model>", …)`, build a `dspy.ChainOfThought` classifier, run the chosen optimizer (BootstrapFewShot family) over the trainset.
3. **Store** — `program.save()` JSON state, demos, and trace written to B2.
4. **Evaluate** — score the zero-shot baseline and the compiled program on the held-out dev set; write scores.
5. **Query** — the manifest transitions `queued → running → completed|failed`; the detail page polls it.

## Edge Cases
- Ollama unreachable or model not pulled → the run is recorded as `failed` with an actionable message (checked before any DSPy import), never a crash.
- Unknown optimizer/metric/task → `400` at the boundary.
- A single bad generation during eval → skipped, does not abort the run.

## UX States
- Loading/queued/running: `GeneratingLoader` with polling; trace accrues.
- Failed: destructive alert with the error and the partial trace.
- Completed: scorecard, compiled program, demos, trace, artifacts.

## Verification
- Test files: `services/api/tests/test_runs.py`
- Required cases: create launches + persists manifest/input, unknown optimizer rejected, run detail 404, Ollama-unavailable run refuses to proceed.
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` (needs real B2 creds + a pulled Ollama model for a true end-to-end run)
- Pass criteria: focused tests and `pnpm verify` green.

## Related Docs
- [Compiled Program Versioning](compiled-program-versioning.md)
- [Evaluation Scores](evaluation-scores.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
