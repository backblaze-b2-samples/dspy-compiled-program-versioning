"""Runs API tests — fully offline.

Every B2 call (run_store) and the DSPy runner are mocked, so this suite needs
neither Backblaze credentials nor a running Ollama server. It exercises the
route wiring, validation, and the graceful "Ollama unavailable" path.
"""

import pytest

from app.repo import dspy_runner
from app.service import runs as runs_service

VALID_BODY = {
    "label": "baseline v1",
    "task": "support_ticket_category",
    "optimizer": "BootstrapFewShot",
    "model": "llama3.2",
    "metric": "exact_match",
    "max_bootstrapped_demos": 2,
    "max_labeled_demos": 2,
    "notes": "",
}


def _manifest(run_id="r1", status="completed"):
    return {
        "run_id": run_id,
        "label": "baseline v1",
        "status": status,
        "task": "support_ticket_category",
        "model": "llama3.2",
        "optimizer": "BootstrapFewShot",
        "metric": "exact_match",
        "created_at": "2026-01-01T00:00:00+00:00",
        "completed_at": "2026-01-01T00:01:00+00:00",
        "error": None,
        "baseline_score": 0.33,
        "compiled_score": 0.83,
        "score_delta": 0.5,
        "config": VALID_BODY,
    }


def test_get_ollama_status_offline(monkeypatch):
    monkeypatch.setattr(
        runs_service.dspy_runner,
        "ollama_status",
        lambda base, model: {
            "reachable": False,
            "available_models": [],
            "model_pulled": False,
            "message": "down",
        },
    )
    status = runs_service.get_ollama_status()
    assert status.reachable is False
    assert status.configured_model  # populated from settings


@pytest.mark.asyncio
async def test_create_run_launches(client, monkeypatch):
    written: list[str] = []
    monkeypatch.setattr(runs_service.run_store, "put_json", lambda k, o: written.append(k))
    # Don't actually spawn the optimizer thread in a unit test.
    monkeypatch.setattr(runs_service, "_execute_run", lambda *a, **k: None)

    resp = await client.post("/runs", json=VALID_BODY)
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "queued"
    assert body["run_id"]
    # Both the manifest and the input bundle are persisted up front.
    assert any(k.endswith("run.json") for k in written)
    assert any(k.endswith("input/task.json") for k in written)


@pytest.mark.asyncio
async def test_create_run_rejects_unknown_optimizer(client):
    bad = {**VALID_BODY, "optimizer": "NotARealOptimizer"}
    resp = await client.post("/runs", json=bad)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_runs(client, monkeypatch):
    monkeypatch.setattr(runs_service.run_store, "list_run_ids", lambda: ["r1"])
    monkeypatch.setattr(runs_service.run_store, "get_json", lambda k: _manifest())
    resp = await client.get("/runs")
    assert resp.status_code == 200
    rows = resp.json()
    assert rows[0]["run_id"] == "r1"
    assert rows[0]["score_delta"] == 0.5


@pytest.mark.asyncio
async def test_get_run_detail_not_found(client, monkeypatch):
    monkeypatch.setattr(runs_service.run_store, "get_json", lambda k: {})
    resp = await client.get("/runs/missing")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_run_scopes_to_prefix(client, monkeypatch):
    monkeypatch.setattr(runs_service.run_store, "run_exists", lambda rid: True)
    seen: dict = {}

    def fake_delete(rid):
        seen["rid"] = rid
        return 6

    monkeypatch.setattr(runs_service.run_store, "delete_run", fake_delete)
    resp = await client.delete("/runs/r1")
    assert resp.status_code == 200
    assert resp.json()["objects"] == 6
    assert seen["rid"] == "r1"


@pytest.mark.asyncio
async def test_artifact_unknown_name_is_400(client, monkeypatch):
    monkeypatch.setattr(runs_service.run_store, "run_exists", lambda rid: True)
    resp = await client.get("/runs/r1/artifact?name=nope")
    assert resp.status_code == 400


def test_run_optimization_blocks_without_ollama(monkeypatch):
    """The runner records an actionable error (and never imports dspy) when the
    local model is unavailable."""
    monkeypatch.setattr(
        dspy_runner,
        "ollama_status",
        lambda base, model: {
            "reachable": False,
            "available_models": [],
            "model_pulled": False,
            "message": "Ollama is not reachable",
        },
    )
    with pytest.raises(RuntimeError, match="not reachable"):
        dspy_runner.run_optimization(
            task={
                "input_field": "ticket",
                "output_field": "category",
                "instructions": "classify",
                "name": "support",
            },
            trainset=[],
            devset=[],
            model="llama3.2",
            optimizer_name="BootstrapFewShot",
            max_bootstrapped_demos=2,
            max_labeled_demos=2,
            base_url="http://localhost:11434",
        )
