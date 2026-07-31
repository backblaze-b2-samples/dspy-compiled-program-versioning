"""Orchestrate the DSPy optimization-run lifecycle over B2 run bundles.

Per run: Ingest -> Optimize -> Store -> Evaluate -> Query. `POST /runs` returns
immediately; the compile runs in a background thread and streams its status into
the run's `run.json` manifest on B2, which the detail page polls.
"""

import json
import logging
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings
from app.repo import dspy_runner, get_presigned_url, run_store
from app.types.runs import (
    METRICS,
    OPTIMIZERS,
    TASKS,
    CompiledProgram,
    Demonstration,
    EvalScores,
    FieldDiff,
    OllamaStatus,
    RunConfig,
    RunDetail,
    RunDiff,
    RunSummary,
    TraceStep,
)

logger = logging.getLogger(__name__)

_SEED_DIR = Path(__file__).resolve().parent.parent / "seed"

# Keys `_summary` reads without a default; a manifest under runs/ that lacks them
# is foreign/partial (shared bucket, incremental writes) and must be skipped.
_REQUIRED_MANIFEST_KEYS = ("run_id", "created_at")


class RunValidationError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class RunNotFoundError(Exception):
    def __init__(self, detail: str = "Run not found"):
        self.detail = detail
        super().__init__(detail)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def load_seed(task_name: str) -> dict:
    """Load the bundled task definition + train/dev datasets from app/seed/."""
    task = json.loads((_SEED_DIR / "task.json").read_text())
    if task_name != task["task"]:
        raise RunValidationError(f"Unknown task '{task_name}'")
    trainset = _read_jsonl(_SEED_DIR / "train.jsonl")
    devset = _read_jsonl(_SEED_DIR / "dev.jsonl")
    return {"task": task, "trainset": trainset, "devset": devset}


def _read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def _validate(config: RunConfig) -> None:
    if config.task not in TASKS:
        raise RunValidationError(f"Unsupported task '{config.task}'")
    if config.optimizer not in OPTIMIZERS:
        raise RunValidationError(f"Unsupported optimizer '{config.optimizer}'")
    if config.metric not in METRICS:
        raise RunValidationError(f"Unsupported metric '{config.metric}'")


def get_ollama_status() -> OllamaStatus:
    status = dspy_runner.ollama_status(settings.ollama_base_url, settings.ollama_model)
    return OllamaStatus(
        base_url=settings.ollama_base_url,
        configured_model=settings.ollama_model,
        **status,
    )


def create_run(config: RunConfig) -> dict:
    """Validate, persist the queued manifest + input bundle, and launch the
    background optimizer. Returns immediately with {run_id, status}."""
    _validate(config)
    seed = load_seed(config.task)
    run_id = datetime.now(UTC).strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]

    manifest = {
        "run_id": run_id,
        "label": config.label,
        "status": "queued",
        "config": config.model_dump(),
        "task": config.task,
        "model": config.model,
        "optimizer": config.optimizer,
        "metric": config.metric,
        "created_at": _now(),
        "completed_at": None,
        "error": None,
        "baseline_score": None,
        "compiled_score": None,
        "score_delta": None,
    }
    run_store.put_json(run_store.manifest_key(run_id), manifest)
    run_store.put_json(
        run_store.input_key(run_id),
        {"task": seed["task"], "trainset": seed["trainset"], "devset": seed["devset"]},
    )

    thread = threading.Thread(
        target=_execute_run, args=(run_id, config, seed), daemon=True
    )
    thread.start()
    return {"run_id": run_id, "status": "queued"}


def _execute_run(run_id: str, config: RunConfig, seed: dict) -> None:
    """Background worker: compile, store artifacts, update the manifest."""
    manifest = run_store.get_json(run_store.manifest_key(run_id))
    manifest["status"] = "running"
    run_store.put_json(run_store.manifest_key(run_id), manifest)

    trace: list[dict] = []

    def emit(phase: str, detail: str) -> None:
        trace.append({"step": len(trace) + 1, "phase": phase, "detail": detail, "timestamp": _now()})
        # Stream the current stage into the polled manifest (advancing spinner).
        manifest["stage"] = phase
        run_store.put_json(run_store.manifest_key(run_id), manifest)

    try:
        result = dspy_runner.run_optimization(
            task=seed["task"],
            trainset=seed["trainset"],
            devset=seed["devset"],
            model=config.model,
            optimizer_name=config.optimizer,
            max_bootstrapped_demos=config.max_bootstrapped_demos,
            max_labeled_demos=config.max_labeled_demos,
            base_url=settings.ollama_base_url,
            emit=emit,
        )
        compiled_fields = ("signature_instructions", "input_fields", "output_fields", "raw_state")
        run_store.put_json(run_store.compiled_key(run_id), {k: result[k] for k in compiled_fields})
        run_store.put_json(run_store.demos_key(run_id), result["demos"])
        run_store.put_jsonl(run_store.trace_key(run_id), trace)
        run_store.put_json(run_store.scores_key(run_id), result["scores"])

        manifest.update(status="completed", completed_at=_now(), **{
            k: result["scores"][k] for k in ("baseline_score", "compiled_score", "score_delta")
        })
        run_store.put_json(run_store.manifest_key(run_id), manifest)
        logger.info("Run completed: run_id=%s delta=%s", run_id, manifest["score_delta"])
    except Exception as exc:
        emit("failed", str(exc))
        manifest.update(status="failed", completed_at=_now(), error=str(exc))
        run_store.put_jsonl(run_store.trace_key(run_id), trace)
        run_store.put_json(run_store.manifest_key(run_id), manifest)
        logger.warning("Run failed: run_id=%s error=%s", run_id, exc)


def _summary(manifest: dict) -> RunSummary:
    return RunSummary(
        run_id=manifest["run_id"],
        label=manifest.get("label", manifest["run_id"]),
        status=manifest.get("status", "failed"),
        task=manifest.get("task", ""),
        model=manifest.get("model", ""),
        optimizer=manifest.get("optimizer", ""),
        metric=manifest.get("metric", ""),
        baseline_score=manifest.get("baseline_score"),
        compiled_score=manifest.get("compiled_score"),
        score_delta=manifest.get("score_delta"),
        created_at=manifest["created_at"],
        completed_at=manifest.get("completed_at"),
        error=manifest.get("error"),
    )


def list_runs() -> list[RunSummary]:
    summaries: list[RunSummary] = []
    for run_id in run_store.list_run_ids():
        manifest = run_store.get_json(run_store.manifest_key(run_id))
        # Skip foreign/partial manifests so one can't 500 the whole list.
        if manifest and all(k in manifest for k in _REQUIRED_MANIFEST_KEYS):
            summaries.append(_summary(manifest))
        elif manifest:
            logger.warning("Skipping foreign/malformed manifest under runs/%s/", run_id)
    summaries.sort(key=lambda s: s.created_at, reverse=True)
    return summaries


def get_run_detail(run_id: str) -> RunDetail:
    manifest = run_store.get_json(run_store.manifest_key(run_id))
    if not manifest:
        raise RunNotFoundError()
    compiled_raw = run_store.get_json(run_store.compiled_key(run_id))
    demos_raw = _demo_list(run_id)
    scores_raw = run_store.get_json(run_store.scores_key(run_id))
    trace_raw = run_store.get_jsonl(run_store.trace_key(run_id))

    demos = [Demonstration(**d) for d in demos_raw]
    compiled_program = None
    if compiled_raw:
        compiled_program = CompiledProgram(
            signature_instructions=compiled_raw.get("signature_instructions", ""),
            input_fields=compiled_raw.get("input_fields", []),
            output_fields=compiled_raw.get("output_fields", []),
            demos=demos,
            raw_state=compiled_raw.get("raw_state", {}),
        )
    return RunDetail(
        run_id=run_id,
        label=manifest.get("label", run_id),
        status=manifest.get("status", "failed"),
        config=RunConfig(**manifest["config"]),
        created_at=manifest["created_at"],
        completed_at=manifest.get("completed_at"),
        error=manifest.get("error"),
        compiled_program=compiled_program,
        demos=demos,
        stage=manifest.get("stage"),
        trace=[TraceStep(**t) for t in trace_raw],
        scores=EvalScores(**scores_raw) if scores_raw else None,
        artifact_keys=run_store.list_artifact_keys(run_id),
    )


def delete_run(run_id: str) -> int:
    if not run_store.run_exists(run_id):
        raise RunNotFoundError()
    return run_store.delete_run(run_id)


def get_artifact_url(run_id: str, name: str) -> str:
    """Presigned download URL for one raw run artifact (S3 generate_presigned_url)."""
    if not run_store.run_exists(run_id):
        raise RunNotFoundError()
    key = run_store.artifact_key(run_id, name)
    if not key:
        raise RunValidationError(f"Unknown artifact '{name}'")
    return get_presigned_url(key, filename=f"{run_id}-{name}.json")


def replay_run(run_id: str, new_model: str | None = None) -> dict:
    """Re-run an existing run's config (optionally against a new model)."""
    manifest = run_store.get_json(run_store.manifest_key(run_id))
    if not manifest:
        raise RunNotFoundError()
    config = RunConfig(**manifest["config"])
    replay_label = f"{config.label} (replay)"
    data = config.model_dump()
    data["label"] = replay_label[:120]
    if new_model:
        data["model"] = new_model
    return create_run(RunConfig(**data))


def diff_runs(a: str, b: str) -> RunDiff:
    ma = run_store.get_json(run_store.manifest_key(a))
    mb = run_store.get_json(run_store.manifest_key(b))
    if not ma:
        raise RunNotFoundError(f"Run '{a}' not found")
    if not mb:
        raise RunNotFoundError(f"Run '{b}' not found")
    ca = run_store.get_json(run_store.compiled_key(a))
    cb = run_store.get_json(run_store.compiled_key(b))
    da = _demo_list(a)
    db = _demo_list(b)
    ia = ca.get("signature_instructions", "")
    ib = cb.get("signature_instructions", "")
    return RunDiff(
        a=_summary(ma),
        b=_summary(mb),
        instructions_diff=FieldDiff(
            field="signature_instructions", a=ia, b=ib, changed=ia != ib
        ),
        demo_count_a=len(da),
        demo_count_b=len(db),
        score_delta_a=ma.get("score_delta"),
        score_delta_b=mb.get("score_delta"),
        compiled_score_a=ma.get("compiled_score"),
        compiled_score_b=mb.get("compiled_score"),
    )


def _demo_list(run_id: str) -> list:
    demos = run_store.get_json(run_store.demos_key(run_id))
    return demos if isinstance(demos, list) else []
