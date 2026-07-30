<!-- last_verified: 2026-07-30 -->
# Feature: Evaluation Scores

## Purpose
Quantify each compiled program's improvement by scoring the zero-shot baseline and the compiled program on a held-out dev set, and store both so every run carries a real before/after delta.

## Used By
- UI: `/runs/[id]` (scorecard), `/runs` (before→after column), `/` (dashboard best-score/best-improvement)
- API: `GET /runs/{run_id}` (scores), embedded in `RunSummary`

## Core Functions
- `services/api/app/repo/dspy_runner.py` — the exact-match `metric` and `evaluate()` loop over the dev set
- `services/api/app/types/runs.py` — `EvalScores`
- `apps/web/src/lib/run-format.ts` — `formatScore()`, `formatDelta()`, `deltaTone()`

## Canonical Files
- Scoring: `services/api/app/repo/dspy_runner.py::run_optimization`

## Inputs
- The seed dev set (`app/seed/dev.jsonl`) and the compiled/baseline programs.

## Outputs
- `runs/<run_id>/eval/scores.json` → `EvalScores` (metric, baseline_score, compiled_score, score_delta, dev_size, baseline_correct, compiled_correct).
- Score summary mirrored into `run.json` for cheap list rendering.

## Flow
- Before compiling, the zero-shot `ChainOfThought` program is scored on the dev set (baseline).
- After compiling, the compiled program is scored on the same dev set.
- Scores are 0..1 fractions; the delta is `compiled - baseline`. The UI renders them as integer percentages and signed "pts".

## Edge Cases
- Empty dev set → scores default to 0.0 without dividing by zero.
- A generation error on one example → counted as incorrect (skipped), never aborts scoring.
- Compiled worse than baseline → negative delta shown in the destructive tone (honest, not hidden).

## UX States
- Loading: scorecard skeleton within the run detail.
- Loaded: baseline / compiled / delta cards with correct-count subtext.

## Verification
- Test files: `services/api/tests/test_runs.py`
- Required cases: scores surfaced in list; Ollama-unavailable path skips scoring safely.
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full`
- Pass criteria: `pnpm verify` green.

## Related Docs
- [Optimization Runs](optimization-runs.md)
- [Diff and Replay](diff-and-replay.md)
