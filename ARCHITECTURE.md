<!-- last_verified: 2026-07-28 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Dashboard with run metrics and a recent-runs table
  - Runs Library + create-run form + run detail (live progress, compiled program, demos, trace, scores, replay/delete/diff)
  - Full-bucket B2 file browser with preview, download, delete
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - REST API for optimization runs (`/runs*`) plus file listing/download/delete
  - DSPy program optimization against a local Ollama model, contained in `repo/dspy_runner.py`
  - Run bundles read/written on B2 via `repo/run_store.py` (S3-compatible API)
  - B2 S3 integration via boto3 (single client, custom user agent)
  - Health check endpoint with B2 connectivity verification; Ollama status via `/runs/ollama-status`
  - Structured JSON logging with request tracing; Prometheus-format metrics endpoint
- **packages/shared/** — TypeScript type definitions
  - Mirrors Pydantic models from the API
  - Consumed by `apps/web/` as workspace dependency

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Each file stays under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (runs, files, stats, etc.)
    config/                Settings loaded from environment (B2 + Ollama)
    repo/                  B2 S3 client + run_store (bundles) + dspy_runner (DSPy/Ollama)
    service/               Business logic (runs, files)
    runtime/               FastAPI route handlers (runs, files, health, metrics)
    seed/                  Bundled demo task + train/dev datasets
  tests/                   pytest tests (structural + integration; B2/DSPy mocked)
```

## Boundary Invariants

- **No external SDK leakage**: `boto3` is only imported in `app/repo/`. All other layers interact with B2 through the repo interface.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models.
- **No cross-layer mutable state**: Configuration is read-only after init, and no mutable state is shared *between* layers. Intra-layer caches/counters (the listing cache in `repo/list_cache.py`, the B2 connectivity cache in `repo/b2_client.py`, the download counter in `repo/counter.py`, the rate-limit and metrics state in `runtime/`) are module-local and guarded by a `threading.Lock`. The listing cache also owns the only background thread in the app: a stale entry is served immediately while that thread re-scans (stale-while-revalidate), and `main.lifespan` warms it once at startup so no user pays for the cold full-bucket scan.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. File keys reject empty and path-traversal patterns; optional prefix confinement via `ALLOWED_KEY_PREFIX` (off by default).

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  - Web: `localhost:3000`
  - API: `localhost:8000`
- **Railway** — two services from the same repository: `web` builds from the
  repository root because it consumes `packages/shared`; `api` builds from
  `services/api`. The versioned per-service configs and the human-approved
  staging/production contract live in [infra/railway/README.md](infra/railway/README.md).
  External provisioning and deployment remain explicit user-approved actions.

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API)
  - Every optimization run is an append-only bundle under `runs/<run_id>/` (manifest, input, compiled program, demos, trace, scores) — see the run-bundle layout in [README.md](README.md).
  - Run listing via S3 `list_objects_v2` (with a `/` delimiter for run prefixes); artifacts via `get_object` / `put_object`; downloads via `generate_presigned_url`.
  - The run manifest (`run.json`) doubles as the status/versioning record — no application database. B2 is the sole data store.

## External Services

- **Backblaze B2 S3 API** — run-bundle storage, retrieval, deletion, presigned URLs
- **Ollama** — local LLM runtime (`http://localhost:11434` by default) that DSPy compiles/evaluates against. No API key; accessed only through `repo/dspy_runner.py`.

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s — otherwise the browser would block error responses and the UI would only see an opaque "network error". See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling). A per-IP rate-limit middleware sits inner to CORS; see [docs/SECURITY.md](docs/SECURITY.md#rate-limiting).
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs for download (10-min expiry, forced attachment)

## Data Flows

- **Create run**: Browser -> `POST /runs` -> service validates config, writes queued manifest + input bundle to B2, launches a background thread, returns `{run_id, status}` immediately.
- **Optimize (background)**: `service._execute_run` -> `repo/dspy_runner.run_optimization` compiles + evaluates against the local Ollama model -> `repo/run_store` writes compiled program, demos, trace, scores to B2 -> manifest transitions `queued -> running -> completed|failed`.
- **Poll**: Browser -> `GET /runs/{run_id}` (every 2s while in flight) -> service assembles the detail from the B2 bundle.
- **Diff / Replay**: `GET /runs/diff?a=&b=` compares two bundles; `POST /runs/{run_id}/replay` re-launches a run from a stored config.
- **Delete**: `DELETE /runs/{run_id}` -> recursive prefix delete scoped to `runs/<run_id>/`.
- **Browse**: `GET /files` / download / delete -> the full-bucket explorer over the same B2 bucket.

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware (logs duration per request; also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint (B2 connectivity check)

## API Contract

- Checked-in OpenAPI artifact: `docs/api/openapi.json`
- Export/check command: `pnpm contract:export` / `pnpm contract:check`
- FastAPI freshness test: `services/api/tests/test_openapi_contract.py`
- Frontend route drift test: `apps/web/src/lib/api-contract.test.ts`

The frontend client keeps a small `API_CLIENT_ROUTES` registry in
`apps/web/src/lib/api-client.ts`. Tests compare that registry to the checked-in
OpenAPI artifact so route changes fail loudly before the hand-written client can
silently drift from FastAPI. `GET /metrics` is intentionally server-only.

## Canonical Files

- Layered API handler: `services/api/app/runtime/runs.py`
- Service orchestration: `services/api/app/service/runs.py`
- Provider adapter (DSPy/Ollama, contained): `services/api/app/repo/dspy_runner.py`
- B2 run bundles (repo layer): `services/api/app/repo/run_store.py`
- B2 S3 client (repo layer): `services/api/app/repo/b2_client.py`
- Pydantic models: `services/api/app/types/` (`runs.py`, `files.py`, `stats.py`, `formatting.py`)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- OpenAPI contract: `docs/api/openapi.json`
- OpenAPI exporter: `services/api/scripts/export_openapi.py`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Optimization Runs](docs/features/optimization-runs.md)
- [Compiled Program Versioning](docs/features/compiled-program-versioning.md)
- [Run Library](docs/features/run-library.md)
- [Evaluation Scores](docs/features/evaluation-scores.md)
- [Diff and Replay](docs/features/diff-and-replay.md)
- [Dashboard](docs/features/dashboard.md)
- [File Browser](docs/features/file-browser.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
