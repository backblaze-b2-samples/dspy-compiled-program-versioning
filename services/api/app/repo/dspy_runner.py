"""DSPy program optimization against a local Ollama model.

ALL `dspy`/Ollama access is contained in this module, and the heavy `dspy`
import is done lazily inside the functions that need it. That keeps `import
main` (and therefore the whole test suite) working in an environment where
`dspy` is not installed — unit tests mock this module, so they never trigger the
import — while a real optimization run imports it on demand.

The optimizer compiles a `dspy.ChainOfThought` classifier: it bootstraps
few-shot demonstrations from a tiny seed trainset by running the local model,
keeps the ones the exact-match metric accepts, and folds them into the program's
prompt. We evaluate the zero-shot baseline and the compiled program on a
held-out dev set so the run records a real before/after delta.

No GPU is required or referenced: Ollama itself selects the device (Metal on
macOS, CUDA on Linux, CPU otherwise), and everything here runs against whatever
Ollama exposes over HTTP.
"""

from __future__ import annotations

import json
import tempfile
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any

# Optimizer names accepted from the API boundary, mapped to their DSPy classes
# at call time (see _build_optimizer). Kept as strings here so this module has no
# import-time dspy dependency.
SUPPORTED_OPTIMIZERS = (
    "BootstrapFewShot",
    "BootstrapFewShotWithRandomSearch",
    "LabeledFewShot",
)

TraceEmit = Callable[[str, str], None]


def ollama_status(base_url: str, configured_model: str) -> dict[str, Any]:
    """Probe the local Ollama server (stdlib only — no dspy import).

    Returns reachability, the list of pulled models, and whether the configured
    model is among them, so the UI can show a clear message instead of letting a
    run fail deep inside compilation.
    """
    url = base_url.rstrip("/") + "/api/tags"
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, json.JSONDecodeError, ValueError):
        return {
            "reachable": False,
            "available_models": [],
            "model_pulled": False,
            "message": (
                f"Ollama is not reachable at {base_url}. Install it from "
                "https://ollama.com and run `ollama serve`, then "
                f"`ollama pull {configured_model}`."
            ),
        }
    models = [m.get("name", "") for m in payload.get("models", [])]
    # Ollama reports tags as "llama3.2:latest"; treat a bare "llama3.2" as a match.
    def _matches(tag: str) -> bool:
        return tag == configured_model or tag.split(":", 1)[0] == configured_model

    pulled = any(_matches(m) for m in models)
    message = (
        "Ollama is reachable and the model is available."
        if pulled
        else (
            f"Ollama is reachable but the model '{configured_model}' is not "
            f"pulled. Run `ollama pull {configured_model}`."
        )
    )
    return {
        "reachable": True,
        "available_models": models,
        "model_pulled": pulled,
        "message": message,
    }


def _normalize(value: str) -> str:
    return (value or "").strip().lower()


def _build_optimizer(dspy, name: str, metric, max_bootstrapped: int, max_labeled: int):
    if name == "LabeledFewShot":
        return dspy.LabeledFewShot(k=max(1, max_labeled))
    if name == "BootstrapFewShotWithRandomSearch":
        return dspy.BootstrapFewShotWithRandomSearch(
            metric=metric,
            max_bootstrapped_demos=max_bootstrapped,
            max_labeled_demos=max_labeled,
            num_candidate_programs=2,
            num_threads=1,
        )
    # Default / "BootstrapFewShot"
    return dspy.BootstrapFewShot(
        metric=metric,
        max_bootstrapped_demos=max_bootstrapped,
        max_labeled_demos=max_labeled,
    )


def _extract_demos(program, input_fields: list[str], output_field: str) -> list[dict]:
    demos: list[dict] = []
    for predictor in getattr(program, "predictors", lambda: [])():
        for demo in getattr(predictor, "demos", []) or []:
            data = demo.toDict() if hasattr(demo, "toDict") else dict(demo)
            demos.append(
                {
                    "inputs": {f: str(data.get(f, "")) for f in input_fields},
                    "reasoning": data.get("reasoning") or data.get("rationale"),
                    "output": str(data.get(output_field, "")),
                }
            )
    return demos


def _dump_state(program) -> dict:
    """Return the compiled program's human-diffable JSON state.

    Prefers `program.save(path)` to a temp `.json` file (JSON state, never a
    pickle), falling back to `dump_state()` across DSPy versions whose save
    signature differs. Either way the result is plain JSON — diffable and
    reproducible, which is the whole point of versioning compiled programs.
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "compiled.json"
        try:
            program.save(str(path), save_program=False)
        except TypeError:
            try:
                program.save(str(path))
            except Exception:
                path = None
        except Exception:
            path = None
        if path is not None and path.exists():
            return json.loads(path.read_text())
    state = program.dump_state()
    return json.loads(json.dumps(state, default=str))


def run_optimization(
    *,
    task: dict,
    trainset: list[dict],
    devset: list[dict],
    model: str,
    optimizer_name: str,
    max_bootstrapped_demos: int,
    max_labeled_demos: int,
    base_url: str,
    emit: TraceEmit | None = None,
) -> dict[str, Any]:
    """Compile and evaluate a DSPy program against a local Ollama model.

    Returns a dict with the signature, compiled JSON state, bootstrapped demos,
    and before/after eval scores. Raises RuntimeError with an actionable message
    when Ollama or the model is unavailable, so the caller can record a `failed`
    run rather than crash the worker thread.
    """
    def _emit(phase: str, detail: str) -> None:
        if emit is not None:
            emit(phase, detail)

    status = ollama_status(base_url, model)
    if not status["reachable"] or not status["model_pulled"]:
        raise RuntimeError(status["message"])

    import dspy  # lazy: keeps `import main` working without dspy installed

    input_field = task["input_field"]
    output_field = task["output_field"]
    instructions = task["instructions"]
    input_fields = [input_field]

    _emit("ingest", f"Loaded task '{task['name']}' with {len(trainset)} train / "
                    f"{len(devset)} dev examples.")

    lm = dspy.LM(f"ollama_chat/{model}", api_base=base_url.rstrip("/"), api_key="")

    signature = dspy.Signature(f"{input_field} -> {output_field}", instructions)

    def make_example(row: dict):
        return dspy.Example(**row).with_inputs(input_field)

    train_examples = [make_example(r) for r in trainset]
    dev_examples = [make_example(r) for r in devset]

    def metric(example, pred, trace=None) -> bool:
        return _normalize(getattr(pred, output_field, "")) == _normalize(
            getattr(example, output_field, "")
        )

    def evaluate(program) -> tuple[int, int]:
        correct = 0
        for ex in dev_examples:
            try:
                pred = program(**{input_field: getattr(ex, input_field)})
                if metric(ex, pred):
                    correct += 1
            except Exception:
                continue
        return correct, len(dev_examples)

    with dspy.context(lm=lm):
        base_program = dspy.ChainOfThought(signature)

        _emit("baseline", "Evaluating the zero-shot baseline on the dev set.")
        base_correct, dev_size = evaluate(base_program)

        _emit(
            "optimize",
            f"Compiling with {optimizer_name} "
            f"(max_bootstrapped_demos={max_bootstrapped_demos}, "
            f"max_labeled_demos={max_labeled_demos}).",
        )
        optimizer = _build_optimizer(
            dspy, optimizer_name, metric, max_bootstrapped_demos, max_labeled_demos
        )
        compiled = optimizer.compile(base_program, trainset=train_examples)

        _emit("evaluate", "Evaluating the compiled program on the dev set.")
        compiled_correct, _ = evaluate(compiled)

    demos = _extract_demos(compiled, input_fields, output_field)
    raw_state = _dump_state(compiled)

    baseline_score = base_correct / dev_size if dev_size else 0.0
    compiled_score = compiled_correct / dev_size if dev_size else 0.0

    _emit(
        "done",
        f"Baseline {base_correct}/{dev_size} -> compiled {compiled_correct}/{dev_size} "
        f"({len(demos)} demonstrations bootstrapped).",
    )

    return {
        "signature_instructions": instructions,
        "input_fields": input_fields,
        "output_fields": [output_field],
        "raw_state": raw_state,
        "demos": demos,
        "scores": {
            "metric": "exact_match",
            "baseline_score": round(baseline_score, 4),
            "compiled_score": round(compiled_score, 4),
            "score_delta": round(compiled_score - baseline_score, 4),
            "dev_size": dev_size,
            "baseline_correct": base_correct,
            "compiled_correct": compiled_correct,
        },
    }
