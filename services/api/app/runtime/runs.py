"""FastAPI routes for DSPy optimization runs.

Static sub-paths (`/runs/ollama-status`, `/runs/diff`) are declared before the
`/runs/{run_id}` parameter route so FastAPI matches them first. Handlers stay
thin — validation and orchestration live in `service.runs`.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.service.runs import (
    RunNotFoundError,
    RunValidationError,
    create_run,
    delete_run,
    diff_runs,
    get_artifact_url,
    get_ollama_status,
    get_run_detail,
    list_runs,
    replay_run,
)
from app.types.runs import (
    OllamaStatus,
    RunConfig,
    RunCreatedResponse,
    RunDetail,
    RunDiff,
    RunSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: these routes are intentionally UNAUTHENTICATED and bucket-wide, the
# same single-tenant demo stance as the file routes (see docs/SECURITY.md). A
# multi-tenant clone must add auth and scope runs to the caller's own prefix.


@router.get("/runs", response_model=list[RunSummary])
def list_runs_endpoint():
    return list_runs()


@router.post("/runs", response_model=RunCreatedResponse, status_code=202)
def create_run_endpoint(config: RunConfig):
    try:
        result = create_run(config)
    except RunValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    logger.info("Run launched: run_id=%s label=%s", result["run_id"], config.label)
    return result


@router.get("/runs/ollama-status", response_model=OllamaStatus)
def ollama_status_endpoint():
    return get_ollama_status()


@router.get("/runs/diff", response_model=RunDiff)
def diff_runs_endpoint(a: str, b: str):
    try:
        return diff_runs(a, b)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.get("/runs/{run_id}", response_model=RunDetail)
def get_run_endpoint(run_id: str):
    try:
        return get_run_detail(run_id)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.post("/runs/{run_id}/replay", response_model=RunCreatedResponse, status_code=202)
def replay_run_endpoint(run_id: str, model: str | None = None):
    try:
        result = replay_run(run_id, new_model=model)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RunValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    return result


@router.delete("/runs/{run_id}")
def delete_run_endpoint(run_id: str):
    try:
        deleted = delete_run(run_id)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RuntimeError:
        raise HTTPException(status_code=500, detail="Failed to delete run") from None
    return {"deleted": True, "run_id": run_id, "objects": deleted}


@router.get("/runs/{run_id}/artifact")
def artifact_url_endpoint(run_id: str, name: str):
    try:
        url = get_artifact_url(run_id, name)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RunValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    return {"url": url}
