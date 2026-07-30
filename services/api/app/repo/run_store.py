"""Read/write DSPy run bundles on Backblaze B2 via the shared S3 client.

Every optimization run is an append-only prefix in the bucket:

    runs/<run_id>/run.json                 manifest (status, config, score summary)
    runs/<run_id>/input/task.json          the input bundle (signature + datasets)
    runs/<run_id>/program/compiled.json    DSPy program.save() JSON state
    runs/<run_id>/program/demos.json       bootstrapped few-shot demonstrations
    runs/<run_id>/trace/optimization.jsonl per-step optimization trace
    runs/<run_id>/eval/scores.json         before vs after metric scores

This module reuses `b2_client.get_s3_client()` — a single boto3 S3 client with
one custom user agent — so all B2 access (browse + run bundles) shares one
connection pool and one identity. It exposes only S3-compatible operations
(put/get/list/delete_object); the Backblaze proprietary API is never used.
"""

import json
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.repo.b2_client import get_s3_client
from app.repo.list_cache import invalidate as _invalidate_list_cache


def _prefix() -> str:
    p = settings.runs_prefix
    return p if p.endswith("/") else p + "/"


def run_prefix(run_id: str) -> str:
    return f"{_prefix()}{run_id}/"


def manifest_key(run_id: str) -> str:
    return f"{run_prefix(run_id)}run.json"


def input_key(run_id: str) -> str:
    return f"{run_prefix(run_id)}input/task.json"


def compiled_key(run_id: str) -> str:
    return f"{run_prefix(run_id)}program/compiled.json"


def demos_key(run_id: str) -> str:
    return f"{run_prefix(run_id)}program/demos.json"


def trace_key(run_id: str) -> str:
    return f"{run_prefix(run_id)}trace/optimization.jsonl"


def scores_key(run_id: str) -> str:
    return f"{run_prefix(run_id)}eval/scores.json"


# Downloadable artifact name -> key-builder, for the presigned-download route.
ARTIFACT_KEYS = {
    "manifest": manifest_key,
    "input": input_key,
    "compiled": compiled_key,
    "demos": demos_key,
    "trace": trace_key,
    "scores": scores_key,
}


def artifact_key(run_id: str, name: str) -> str | None:
    builder = ARTIFACT_KEYS.get(name)
    return builder(run_id) if builder else None


def put_json(key: str, obj: Any) -> None:
    """Write a JSON artifact to B2. Raises RuntimeError on S3 failure."""
    body = json.dumps(obj, indent=2, default=str).encode("utf-8")
    _put_bytes(key, body, "application/json")


def put_jsonl(key: str, rows: list[Any]) -> None:
    """Write a JSONL artifact (one JSON object per line)."""
    body = ("\n".join(json.dumps(r, default=str) for r in rows) + "\n").encode("utf-8")
    _put_bytes(key, body, "application/x-ndjson")


def _put_bytes(key: str, body: bytes, content_type: str) -> None:
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=key,
            Body=body,
            ContentType=content_type,
        )
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 put_object failed for '{key}': {e}") from e
    # New run objects must appear in the full-bucket /files browser + stats now.
    _invalidate_list_cache()


def get_json(key: str) -> dict:
    """Read and parse a JSON artifact from B2. Returns {} if the object is
    missing; raises RuntimeError on any other S3 failure."""
    client = get_s3_client()
    try:
        response = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
        return json.loads(response["Body"].read())
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return {}
        raise RuntimeError(f"B2 get_object failed for '{key}': {e}") from e
    except BotoCoreError as e:
        raise RuntimeError(f"B2 get_object failed for '{key}': {e}") from e


def get_jsonl(key: str) -> list[dict]:
    """Read a JSONL artifact from B2. Returns [] if missing."""
    client = get_s3_client()
    try:
        response = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
        text = response["Body"].read().decode("utf-8")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return []
        raise RuntimeError(f"B2 get_object failed for '{key}': {e}") from e
    except BotoCoreError as e:
        raise RuntimeError(f"B2 get_object failed for '{key}': {e}") from e
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def list_run_ids() -> list[str]:
    """List every run_id (the immediate child prefixes under the runs prefix).

    Uses list_objects_v2 with a "/" delimiter so B2 returns one CommonPrefix per
    run rather than every artifact. Raises RuntimeError on S3 failure.
    """
    client = get_s3_client()
    prefix = _prefix()
    run_ids: list[str] = []
    kwargs: dict = {
        "Bucket": settings.b2_bucket_name,
        "Prefix": prefix,
        "Delimiter": "/",
        "MaxKeys": 1000,
    }
    try:
        while True:
            response = client.list_objects_v2(**kwargs)
            for cp in response.get("CommonPrefixes", []):
                # "runs/<id>/" -> "<id>"
                run_ids.append(cp["Prefix"][len(prefix):].rstrip("/"))
            if not response.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = response["NextContinuationToken"]
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 list_objects_v2 failed for '{prefix}': {e}") from e
    return run_ids


def list_artifact_keys(run_id: str) -> list[str]:
    """Every object key stored under a run's prefix."""
    client = get_s3_client()
    prefix = run_prefix(run_id)
    keys: list[str] = []
    kwargs: dict = {"Bucket": settings.b2_bucket_name, "Prefix": prefix, "MaxKeys": 1000}
    try:
        while True:
            response = client.list_objects_v2(**kwargs)
            keys.extend(obj["Key"] for obj in response.get("Contents", []))
            if not response.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = response["NextContinuationToken"]
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 list_objects_v2 failed for '{prefix}': {e}") from e
    return keys


def run_exists(run_id: str) -> bool:
    return bool(get_json(manifest_key(run_id)))


def delete_run(run_id: str) -> int:
    """Delete a whole run bundle (every object under runs/<run_id>/).

    Scoped strictly to the single run's prefix — never touches other runs or
    non-run objects. Returns the number of objects deleted. Raises RuntimeError
    on S3 failure.
    """
    client = get_s3_client()
    keys = list_artifact_keys(run_id)
    deleted = 0
    try:
        for key in keys:
            client.delete_object(Bucket=settings.b2_bucket_name, Key=key)
            deleted += 1
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 delete_object failed under '{run_prefix(run_id)}': {e}") from e
    _invalidate_list_cache()
    return deleted
