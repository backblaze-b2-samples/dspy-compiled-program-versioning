# Build plan — `dspy-compiled-program-versioning`

Scaffolded from `vibe-coding-starter-kit` (source of truth:
`.claude/scratch/vcsk-fb9e524c-d275-4762-92e1-afc96098af71/`).

## 1. Purpose

`dspy-compiled-program-versioning` is a B2 sample for **ML engineers and researchers
building production LLM pipelines**. It demonstrates using **Backblaze B2 as the durable,
auditable memory layer for a DSPy prompt-optimization workflow that runs entirely offline
against a local Ollama model**. Each optimization run compiles an improved DSPy program
(prompts + bootstrapped few-shot demonstrations) against a local model, then appends the
compiled program, the demonstration set, the full optimization trace, and before/after
evaluation scores to B2 as a structured, versioned **run bundle**. Runs accumulate
append-only, so a researcher can browse every prior compiled program, diff two versions,
roll back, or replay an old program against a new model — a reproducible, rollback-capable
prompt-engineering audit trail. The only credentials required are B2 keys; the LLM is a
**local Ollama model (no second API key)**. B2 is exercised entirely through the
**S3-compatible API** with a custom user-agent and standardized `B2_*` env vars.

## 2. Architecture delta from `vibe-coding-starter-kit`

The starter kit is the ceiling: keep its skeleton, S3 plumbing, and design system; strip
the arbitrary-file-upload / media-metadata UX (off-theme for structured JSON artifacts);
add the DSPy optimization-run domain.

### KEEP (as-is, only renamed)
- Monorepo shell: `package.json`, `pnpm-workspace.yaml`, `scripts/*` (setup.mjs, dev.sh,
  doctor.mjs, pick-port.mjs, python-runtime.mjs, local-bind.mjs, etc.), `.github/`,
  `infra/`, `.pre-commit-config.yaml`, `pnpm-lock.yaml`.
- Backend core S3 layer `services/api/app/repo/b2_client.py` — the boto3 client factory
  (`get_s3_client`), `put/get/list/delete/head/presign/stats` helpers, `list_cache.py`,
  `counter.py`. The new run-bundle layer REUSES this client (single S3 client, single UA).
- Backend cross-cutting: `runtime/health.py`, `runtime/metrics.py`, `runtime/ratelimit.py`,
  `config/`, `types/formatting.py`, `types/errors.py`, structured logging & middleware in
  `main.py`, and the test scaffold (`tests/conftest.py`, `test_health.py`,
  `test_structure.py`, `test_openapi_contract.py`, `test_dependency_lock.py`,
  `test_rate_limit.py`, `test_error_handling.py`, `test_list_cache.py`,
  `test_key_prefix.py`, `test_list_pagination.py`, `test_recent_files.py`,
  `test_delete.py`, `test_presign_disposition.py`).
- **Bucket explorer — NON-NEGOTIABLE keep.** `/files` page + `components/files/*`
  (file-browser, file-tree-row, file-preview, file-preview-media, file-metadata-panel).
  This is the full-bucket browse and is never removable. It complements (does not
  duplicate) the sample-specific Runs Library added below.
- Dashboard shell (`/` page + `components/dashboard/*`), Settings (`/settings` +
  `components/settings/settings-form.tsx` — the FORM UX exemplar — and `danger-zone.tsx`),
  Design page (`/design`), layout (`app-sidebar`, `header`, `health-banner`,
  `theme-provider`, `command-palette`), all `components/ui/*` (incl. `generating-loader`,
  reused by the run "compiling…" state), `hooks/`, `lib/`.

### TRIM (remove — off-theme for this sample)
- **Frontend arbitrary-upload UX:** `apps/web/src/app/upload/page.tsx`, all
  `components/upload/*`, and the "Upload" sidebar/nav/command-palette entries. Writes in
  this app are structured run bundles produced by the optimize pipeline, not hand-uploaded
  files — a generic drag-drop page is off-theme.
- **Media-metadata extraction:** `services/api/app/service/metadata.py` and its EXIF/PDF
  logic; drop `Pillow` and `PyPDF2` from `requirements.txt`/`.lock`; remove
  `tests/test_metadata_warning.py`, `tests/test_upload_activity.py`,
  `tests/test_upload_validation.py`, `tests/test_upload_conflict.py`,
  `tests/test_file_detail.py`, `tests/test_metadata*`, `tests/test_download_stats.py`
  **only** where they assert media-metadata behavior. Run `pytest` after trimming and
  delete/adjust exactly the tests that reference removed modules — leave every other test
  green. Builder discretion: if a backend upload endpoint (`runtime/upload.py` /
  `service/upload.py`) is still load-bearing for the generic put path reused by the run
  pipeline, KEEP it as internal plumbing (no user-facing page) rather than cascade-deleting;
  only remove modules that become truly unreferenced. Bias toward keeping the test suite
  green over aggressive deletion.
- **Docs:** delete `docs/features/file-upload.md` and `docs/features/metadata-extraction.md`.

### ADD (new for `dspy-compiled-program-versioning`)
Backend (`services/api/app/`):
- `repo/dspy_runner.py` — **all `dspy`/Ollama imports contained here.** Configures
  `dspy.LM("ollama_chat/<model>", api_base=OLLAMA_BASE_URL, api_key="")`, defines the
  program signature (a small `dspy.ChainOfThought` classifier — see §4), runs the chosen
  optimizer (BootstrapFewShot family) over the bundled tiny dataset, and returns the
  compiled program state (`program.save(path)` → JSON), the bootstrapped demonstration set,
  a step-by-step optimization trace, and before/after eval scores from `dspy.Evaluate`.
  Uses `program.save(path)` (JSON state, human-diffable) — NOT `save_program=True` pickle.
- `repo/run_store.py` — reads/writes **run bundles** on B2 through the shared
  `b2_client.get_s3_client()`: `put_object` each artifact, `list_objects_v2` under the
  sample prefix, `get_object` to pull a compiled program, `delete_object` (recursive over a
  run's prefix). Sample prefix constant (default `runs/`).
- `service/runs.py` — orchestrates the 5-step workflow (Ingest → Optimize → Store →
  Evaluate → Query): create-and-launch a run, list runs, get run detail, delete a run,
  replay an existing run against a (possibly new) model, and diff two runs. Runs the
  optimize pipeline in a **background thread**; status is tracked in the run's `run.json`
  manifest on B2 (`queued → running → completed|failed`) so the request returns immediately
  and the UI polls.
- `runtime/runs.py` — FastAPI router:
  - `POST /runs` — create + launch (returns `{run_id, status}` immediately)
  - `GET /runs` — list all run summaries (the Runs Library data source)
  - `GET /runs/{run_id}` — run detail (status, config, compiled prompts, demos, trace,
    before/after scores, artifact keys)
  - `POST /runs/{run_id}/replay` — re-run this run's config (optionally new model) → new run
  - `DELETE /runs/{run_id}` — delete the run bundle (recursive prefix delete, scoped to
    `runs/{run_id}/`)
  - `GET /runs/diff?a={id}&b={id}` — structured diff of two runs' compiled programs +
    demos + scores
  - `GET /runs/{run_id}/artifact/{artifact}` — presigned download of a raw artifact
- `types/runs.py` — Pydantic models: `RunConfig`, `RunSummary`, `RunDetail`,
  `CompiledProgram`, `Demonstration`, `EvalScores`, `TraceStep`, `RunDiff`.
- `seed/` — bundled tiny task so a demo run is one click with no user-authored dataset:
  `task.json` (signature/instructions), `train.jsonl` + `dev.jsonl` (~6 examples each) for
  a **support-ticket category classification** task (small, deterministic, robust on a tiny
  local model; exact-match metric).

Frontend (`apps/web/src/`):
- `app/runs/page.tsx` — **Runs Library** (the sample-specific asset explorer, scoped to the
  `runs/` prefix): table/cards of every optimization run with label, status badge, model,
  optimizer, before→after score delta, created-at. Row → detail. "New run" button. This is
  distinct from and additional to the full-bucket `/files` explorer.
- `app/runs/new/page.tsx` + `components/runs/run-form.tsx` — **create-run form** (see §4
  Form UX): selectors for finite fields, safe-default placeholders/FormDescription.
- `app/runs/[id]/page.tsx` + `components/runs/*` — **run detail**: status/progress
  (reuse `generating-loader` while running + poll), compiled prompt(s), few-shot demos
  table, optimization trace timeline, before/after eval scorecard, and actions: **Replay**,
  **Delete** (confirm), **Diff vs prior run**.
- `components/runs/run-diff.tsx` + `app/runs/diff/page.tsx` (or a modal) — side-by-side diff
  of two runs' compiled program/demos/scores (the "Query → diff" story).
- Dashboard adapted: stat cards = total runs / best after-score / runs today; recent-runs
  table (repurpose `recent-uploads-table`).
- Sidebar/command-palette: replace "Upload" with "Runs" (+ "New run"); keep "Files"
  (bucket explorer), "Dashboard", "Settings", "Design".
- API client (`lib/`) + hooks for the `/runs*` endpoints.

## 3. B2 surface (all S3-compatible — no b2-native)

| Operation | S3 API call | Where |
|---|---|---|
| Write run-bundle artifacts (input, compiled program, demos, trace, scores, manifest) | `put_object` | `repo/run_store.py` (reuses `b2_client`) |
| List run bundles under `runs/` | `list_objects_v2` | `repo/run_store.py` |
| Full-bucket browse | `list_objects_v2` | `repo/b2_client.py` (kept) |
| Pull a compiled program (detail / diff / replay) | `get_object` | `repo/run_store.py` |
| Artifact metadata | `head_object` | `repo/b2_client.py` (kept) |
| Delete a run bundle (recursive over `runs/{id}/`) | `delete_object` | `repo/run_store.py` |
| Download an artifact | `generate_presigned_url` | `repo/b2_client.py` (kept) |

No b2-native API anywhere. Single boto3 S3 client with `signature_version="s3v4"` and the
custom `user_agent_extra` (see §6). Run-bundle layout (append-only; one prefix per run):
```
runs/<run_id>/run.json              # manifest: label, status, model, optimizer, metric, timestamps, score summary
runs/<run_id>/input/task.json       # signature/instructions, seed examples, eval dataset (the "input bundle")
runs/<run_id>/program/compiled.json # DSPy program.save() JSON state (prompts + demos)
runs/<run_id>/program/demos.json    # bootstrapped few-shot demonstration set
runs/<run_id>/trace/optimization.jsonl  # per-step optimization trace
runs/<run_id>/eval/scores.json      # before vs after metric scores
```
Each artifact is a separate `put_object` written as its step completes → literal
append-only accumulation within a run, and each run appends a new prefix.

## 4. Key features

1. **Optimize & version compiled DSPy programs** — bootstrap/compile an improved program
   against a local Ollama model; persist the compiled program + demos to B2 as a new
   version each iteration.
2. **Append-only run bundles on B2** — every run writes input, program, demos, trace, and
   scores as immutable S3 objects under its own prefix.
3. **Before/after evaluation** — `dspy.Evaluate` scores the zero-shot baseline vs the
   compiled program on a held-out dev set; both stored alongside the program.
4. **Runs Library (sample-scoped explorer)** — browse every optimization run stored under
   the sample's B2 prefix; open, replay, delete, or diff.
5. **Diff & rollback / replay** — diff two compiled programs (prompts, demos, scores) and
   replay any prior run's config against a new model — reproducible rollback.
6. **Runs entirely offline on local OSS** — DSPy + Ollama; B2 credentials are the only keys.

**External API provider (per `api-provider-selection.md`).** The sample's whole point is an
**on-device / local capability** (DSPy compiling against a local Ollama model — the
description states "runs entirely offline", "local Ollama", "no second API key"). Step 2
rule 1 (point is *local* capability) ⇒ **LOCAL is the default**, remote is not used.
- Feature: DSPy program optimization + evaluation (core).
- Provider/model: **Ollama**, default model `llama3.2` (a small instruct model; the demo
  seed dataset + `BootstrapFewShot(max_bootstrapped_demos=2, max_labeled_demos=2)` keep
  compilation to a handful of LM calls). `OLLAMA_MODEL` is configurable; docs suggest
  `llama3.2:1b` for the fastest demo.
- **`deployment: local`** (explicit per-feature field). Inherits the CPU-default /
  GPU-autodetect rule: the app never hard-requires a GPU — Ollama itself selects the
  device (Metal on macOS, CUDA on Linux, CPU fallback), and the sample must run on
  CPU-only. No CUDA/MPS code in the sample; note in README that speed scales with whatever
  Ollama detects.
- Estimated cost for one full demo run: **$0** (local Ollama, no API calls billed).
- Env var for the "key": none — Ollama needs no key. Config vars are
  `OLLAMA_BASE_URL` (default `http://localhost:11434`) and `OLLAMA_MODEL`
  (default `llama3.2`). Health check surfaces Ollama reachability + whether the model is
  pulled, so a missing local model produces a clear message, not a 500.
- **No Genblaze**: the description does not mention Genblaze / `genblaze-*` / a Genblaze
  "suggested stack"; DSPy is the framework being showcased, so provider calls go through
  DSPy directly (contained in `repo/dspy_runner.py`), not the Genblaze SDK.

**Primary-entity lifecycle (mandatory).** Primary entity = **Optimization Run** (each run
= one compiled program version). UI lifecycle verbs:
- **create** ✅ — "New run" form launches an optimization run.
- **read** ✅ — Runs Library (list) + run detail (compiled program, demos, trace, scores,
  diff).
- **run** ✅ — two surfaces: submitting the create form launches compilation, and
  **Replay** re-runs an existing run's config (the description's "replay against a new
  model") as an explicit run verb on an existing entity.
- **delete** ✅ — delete a run bundle (recursive prefix delete, confirm dialog). Exposed:
  removing a failed/experimental run is a real need; "append-only" describes within-run
  artifact accumulation, not that runs can never be pruned. Delete is scoped strictly to
  `runs/{run_id}/`.
- **edit** ❌ **OMITTED — UX-justified.** A completed run is an **immutable, auditable
  artifact**: editing its config or compiled output after the fact would break the
  reproducibility/audit guarantee that is the sample's entire premise. To try different
  parameters you **create a new run** (that IS the versioning story) or **Replay** an
  existing one. Recorded in Phase-5 `omitted_ui_verbs`.

**Form UX conventions (create/edit `run-form.tsx`, modeled on `settings-form.tsx`).**
- (a) Finite-value fields → **selectors** (`Select`/`RadioGroup`), never free text:
  - **Task** — the bundled task/signature (finite built-in set) → `Select`.
  - **Optimizer** — `BootstrapFewShot` / `BootstrapFewShotWithRandomSearch` /
    `LabeledFewShot` → `Select`.
  - **Model** — Ollama model tag from a small known list incl. the configured default →
    `Select`.
  - **Metric** — `exact_match` (single option now, still a `Select` for extensibility).
  - **max_bootstrapped_demos / max_labeled_demos** — small finite ints → `Select`.
  - Free text is allowed only for the run **label** and optional **notes**.
- (b) CREATE-form safe defaults as **placeholder / `FormDescription` guidance** (never an
  autofill button): Task = "Support-ticket category classification", Optimizer =
  "BootstrapFewShot", Model = default `OLLAMA_MODEL`, demos = 2/2, Metric = "exact_match" —
  a one-click sound demo run. (There is no edit form; edit is omitted.)

## 5. Doc transforms
- **Rewrite** `docs/features/dashboard.md` (runs-oriented stats), `docs/features/settings.md`
  (B2 + Ollama config), `docs/features/file-browser.md` (clarify it's the full-bucket
  explorer, complementary to the Runs Library).
- **Delete** `docs/features/file-upload.md`, `docs/features/metadata-extraction.md`.
- **New stubs** (seed README feature list): `docs/features/optimization-runs.md`,
  `docs/features/compiled-program-versioning.md`, `docs/features/run-library.md`,
  `docs/features/evaluation-scores.md`, `docs/features/diff-and-replay.md`. Use
  `docs/features/_template.md`.
- **Rewrite** top-level `README.md`, `ARCHITECTURE.md`, `PRODUCT.md` for the DSPy story,
  Ollama prerequisites (install Ollama, `ollama pull llama3.2`), and the B2 run-bundle
  layout. Keep `docs/RELIABILITY.md`, `docs/SECURITY.md`, `docs/dev-workflows.md`,
  `docs/design-system.md`, `docs/app-workflows.md`, `docs/api/*` (update slugs/endpoints).

## 6. Rename table (`vibe-coding-starter-kit` → `dspy-compiled-program-versioning`)

| Kind | From | To |
|---|---|---|
| kebab slug / repo dir | `vibe-coding-starter-kit`, `oss-starter-kit` | `dspy-compiled-program-versioning` |
| Title Case (UI/docs) | "OSS Starter Kit" | "DSPy Compiled Program Versioning" |
| API title (`main.py` FastAPI) | "OSS Starter Kit API" | "DSPy Compiled Program Versioning API" |
| root `package.json` name + workspace pkg names | `*starter-kit*` | `dspy-compiled-program-versioning` / scoped `@dcpv/*` |
| snake / python identifiers, module docstrings | `oss_starter_kit` etc. | `dspy_compiled_program_versioning` |
| **S3 `user_agent_extra`** (`repo/b2_client.py`) | `b2ai-oss-start` | `b2-dspy-versioning` (sub-issue `user_agent_extra` not supplied → this deterministic default) |
| **header branding leak** (`components/layout/header.tsx` — known: hardcodes "oss-starter-kit" + "Page" fallback) | hardcoded string | `APP_NAME` const + pathname-derived title |
| Docker image tags / compose service names / CI workflow slugs | `*starter-kit*` | `dspy-compiled-program-versioning` |
| UTM content tag in doc/README links | `utm_content=oss-starter-kit` (or similar) | `utm_content=dspy-compiled-program-versioning` |

**Env-var rename to Standard #3 (parent CLAUDE.md — the starter deviates; b2-doctor enforces
the standard names).** Update `config/settings.py`, `main.py`
(`REQUIRED_B2_SETTINGS`/`PLACEHOLDER_VALUES`), `repo/b2_client.py`, `.env.example`, README,
and any test/config referencing them:

| Starter (deviation) | Standard #3 (required) | Notes |
|---|---|---|
| `B2_KEY_ID` | `B2_APPLICATION_KEY_ID` | rename |
| `B2_APPLICATION_KEY` | `B2_APPLICATION_KEY` | already standard |
| `B2_BUCKET_NAME` | `B2_BUCKET_NAME` | already standard |
| `B2_ENDPOINT` | `B2_REGION` (+ derive endpoint) | primary is `B2_REGION` (e.g. `us-east-005`); build endpoint as `https://s3.<region>.backblazeb2.com`; keep an optional `B2_ENDPOINT` override for non-standard hosts |
| `B2_PUBLIC_URL` | `B2_PUBLIC_URL_BASE` | rename |

New non-B2 config in `.env.example` (with placeholders/defaults): `OLLAMA_BASE_URL`,
`OLLAMA_MODEL`. Never commit real secrets; `.env.example` uses placeholders only.

## Build guardrails (avoid known failure modes)
- **Pin ML deps.** `dspy>=2.5,<3` (modern LiteLLM-based API) plus whatever it pins
  transitively; do NOT leave DSPy/litellm unbounded (unpinned ML reqs are a false green).
  Regenerate `requirements.lock` after editing `requirements.txt`; keep
  `test_dependency_lock.py` passing.
- **Tests must not require Ollama or B2.** Keep `dspy`/Ollama imports and all S3 calls
  behind the service/repo boundary; unit tests mock the S3 client and the DSPy runner so
  `pytest` passes offline (matches the starter's pattern).
- **Confirm `pnpm lint` and `pnpm build` pass** for the web app after the frontend rewrite
  (doc-theming + wiring are the phases most often left undone on a timeout).
- **Background execution:** `POST /runs` returns immediately; compilation runs in a
  background thread and updates `run.json` status on B2; the detail page polls. This keeps
  requests from timing out and gives verify/screenshot a real progress → completed flow.
