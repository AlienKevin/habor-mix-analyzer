#!/usr/bin/env python3
"""
analyze.py — spawn codex sessions in parallel, one per trial of a Harbor-Mix task.

Usage:
    analyze.py <task_id> [-o OUT_ROOT] [-j MAX_PARALLEL] [-m MODEL]
                         [-t TIMEOUT_SEC] [--prompt-file PATH] [--dry-run]
                         [--keep-logs]

`task_id` may be either form:
    RUCKBReasoning_spreadsheetbench-verified__22-47   (sanitised dir)
    RUCKBReasoning/spreadsheetbench-verified__22-47   (resolved task name)

For each trial of the task (typically 18) we launch a `codex exec` session whose
prompt asks it to read the trajectory + result, find the failure mode, and
write a per-trial markdown report.  Per-trial output paths are
`<OUT_ROOT>/<sanitised_task_name>/<trial_id>.md` to avoid the 18 sessions
racing on a single file.  A run summary lands at
`<OUT_ROOT>/<sanitised_task_name>/_run.json` and per-trial codex stdout/stderr
at `<OUT_ROOT>/<sanitised_task_name>/_logs/<trial_id>.log`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

ROOT = Path("/data/trial-codex-analyze/harbor-mix-trials")
TRIALS_ROOT = ROOT / "trials_extracted"
UPLOADED_TRIALS = ROOT / "uploaded_trials.jsonl"

# Sparse-clone of harbor-framework/harbor-adapters-experiments. Each task lives
# at <TASK_DATASET_ROOT>/{daytona,modal}/<daytona_name>/ and contains
# instruction.md, tests/, solution/solve.sh, environment/, task.toml.
TASK_DATASET_ROOT = Path("/data/trial-codex-analyze/task_dataset/harbor-mix/datasets")

DEFAULT_PROMPT_TEMPLATE = """\
You are auditing one trial of a Harbor-Mix benchmark task. Goal: figure out
why the agent failed (or, if it passed, what it actually did) and whether the
task itself is sound.

Inputs (read-only — do not modify):
- trajectory  : {trajectory_path}
                The agent's full transcript: the task description it received, the
                commands it issued, and the terminal output it observed.
- result      : {result_path}
                Harbor wrapper's per-trial summary: final reward, any infrastructure
                exception, timing breakdown.
- test_stdout : {test_stdout_path}
                The verifier's actual stdout (e.g. pytest output) from the trial run.
- reward.txt  : {reward_txt_path}
- task source dir (canonical task definition): {task_source_dir}
  Contents (when present):
    instruction.md          — the canonical task brief; may differ from what
                              the harness rewrote into the agent's first user
                              message in trajectory.json.
    tests/test.sh           — the verifier's entrypoint; defines reward gating.
    tests/test_outputs.py   — pytest-style assertions (BigCodeBench-shaped tasks).
    tests/*                 — other verifier scripts / fixtures.
    solution/solve.sh       — the canonical oracle solution.
    environment/Dockerfile  — the agent's environment image.
    task.toml               — timeouts, scoring mode, image tag.

Trial metadata
- task_name : {task_name}
- trial_id  : {trial_id}
- model     : {model}
- agent     : {agent}
- reward    : {reward}
- exception : {exception}

Write your analysis to `{sanitised_task_name}/{trial_id}.md` (create the
directory as needed). Cover, in this order:

1. Task summary — restate the instruction the agent saw (1-2 sentences) plus
   any environment hints visible in the trajectory.
2. Closeness to success — did the agent get partway? Where did it lose the
   path? Cite step numbers.
3. Surface failure — the visible mistake (wrong filename, wrong flag, parse
   error, timeout, ...). Quote the exact command + observation.
4. Root cause — the deeper reason. Examples: skipped reading the test, never
   listed the working dir, hallucinated a path, declared task_complete too
   early, looped on an unrecoverable error, ran out of context. Say which.
5. Failing test evidence — what does the verifier actually check? Quote the
   relevant test stdout / exception / reward gating, and explain in what way
   the agent's final state failed it.
6. Cheating / hacking risk — could a future agent satisfy the verifier
   without solving the task (e.g. trivially overwriting an expected output
   file, exiting 0, or pattern-matching the test)? Mark explicitly.
7. Task quality verdict — is the task well-specified, the env fair, the test
   reasonable? Flag any brokenness.

Be concrete. Quote file paths, command strings, terminal lines, and test
snippets. No padding. If a section has nothing to report, say so in one line.
Stop after writing the file.
"""

CODEX_INTRO = "Hello, codex."  # not used, kept as signal

# ----------------------------------------------------------------------------- #
# Resolution
# ----------------------------------------------------------------------------- #

def resolve_task_dir(task_id: str) -> Path:
    sanitised = task_id.replace("/", "_")
    candidates = [TRIALS_ROOT / sanitised, TRIALS_ROOT / task_id]
    for c in candidates:
        if c.is_dir():
            return c
    available = sorted(p.name for p in TRIALS_ROOT.iterdir() if p.is_dir())
    near = [n for n in available if task_id.split("/")[-1] in n][:5]
    msg = f"task dir not found for {task_id!r} under {TRIALS_ROOT}"
    if near:
        msg += f"\n  did you mean: {', '.join(near)}"
    raise SystemExit(msg)


def load_trial_metadata(task_dir: Path) -> dict[str, dict]:
    """trial_id -> uploaded_trials.jsonl row (partial fields)."""
    sanitised = task_dir.name
    out: dict[str, dict] = {}
    if not UPLOADED_TRIALS.exists():
        return out
    with UPLOADED_TRIALS.open() as fh:
        for line in fh:
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if d.get("task_name", "").replace("/", "_") != sanitised:
                continue
            out[d["trial_id"]] = d
    return out


def list_trials(task_dir: Path) -> list[Path]:
    return sorted(p for p in task_dir.iterdir() if p.is_dir())


def resolve_task_source(meta: dict) -> Optional[Path]:
    """Find the canonical task source dir for a trial.

    `meta` is a row from uploaded_trials.jsonl. We try `requested_task_name`
    first, then the last segment of `task_path`. The dir lives under either
    daytona/ or modal/.
    """
    candidates: list[str] = []
    name = meta.get("requested_task_name")
    if name:
        candidates.append(name)
    tp = meta.get("task_path") or ""
    if tp:
        candidates.append(tp.rstrip("/").rsplit("/", 1)[-1])
    for n in candidates:
        for sub in ("daytona", "modal"):
            p = TASK_DATASET_ROOT / sub / n
            if p.is_dir():
                return p
    return None


# ----------------------------------------------------------------------------- #
# Codex driver
# ----------------------------------------------------------------------------- #

@dataclass
class TrialJob:
    trial_id: str
    trial_dir: Path
    output_md: Path
    log_path: Path
    prompt: str
    cwd: Path
    add_dirs: list[Path]
    metadata: dict


def build_prompt(template: str, *, trial_dir: Path, task_name: str,
                 sanitised_task_name: str, meta: dict) -> str:
    result_path = trial_dir / "result.json"
    trajectory_path = trial_dir / "trajectory.json"
    test_stdout_path = trial_dir / "test_stdout.txt"
    reward_txt_path = trial_dir / "reward.txt"
    if not test_stdout_path.exists():
        test_stdout_path = "(not available for this trial — Supabase tarball missing or never had a verifier/test-stdout.txt)"
    if not reward_txt_path.exists():
        reward_txt_path = "(not available)"
    src = resolve_task_source(meta)
    task_source_dir = str(src) if src else "(not available — task source not found in task_dataset/)"
    return template.format(
        trajectory_path=trajectory_path,
        result_path=result_path,
        test_stdout_path=test_stdout_path,
        reward_txt_path=reward_txt_path,
        task_source_dir=task_source_dir,
        task_name=task_name,
        sanitised_task_name=sanitised_task_name,
        trial_id=trial_dir.name,
        model=meta.get("model", "?"),
        agent=meta.get("agent", "?"),
        reward=meta.get("raw_reward", meta.get("score", "?")),
        exception=meta.get("exception_type") or "none",
    )


async def run_one(job: TrialJob, *, model: str, timeout_sec: int,
                  semaphore: asyncio.Semaphore, dry_run: bool) -> dict:
    started = time.time()
    log = {
        "trial_id": job.trial_id,
        "model": job.metadata.get("model"),
        "agent": job.metadata.get("agent"),
        "output_md": str(job.output_md),
        "started_at": started,
        "duration_sec": None,
        "exit_code": None,
        "wrote_output": False,
        "error": None,
    }
    if dry_run:
        log["exit_code"] = 0
        log["dry_run"] = True
        return log

    cmd = [
        "codex", "exec",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        "-C", str(job.cwd),
        "-m", model,
    ]
    for d in job.add_dirs:
        cmd += ["--add-dir", str(d)]
    cmd.append(job.prompt)

    job.log_path.parent.mkdir(parents=True, exist_ok=True)

    async with semaphore:
        try:
            with job.log_path.open("wb") as logfh:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=logfh,
                    stderr=asyncio.subprocess.STDOUT,
                    stdin=asyncio.subprocess.DEVNULL,
                )
                try:
                    rc = await asyncio.wait_for(proc.wait(), timeout=timeout_sec)
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()
                    log["error"] = f"timeout after {timeout_sec}s"
                    log["exit_code"] = -1
                else:
                    log["exit_code"] = rc
        except Exception as exc:  # noqa: BLE001
            log["error"] = repr(exc)
            log["exit_code"] = -2

    log["duration_sec"] = round(time.time() - started, 2)
    log["wrote_output"] = job.output_md.exists()
    return log


# ----------------------------------------------------------------------------- #
# Orchestrator
# ----------------------------------------------------------------------------- #

async def process_task(task_id: str, args: argparse.Namespace) -> int:
    """Audit one task. Returns 0 on success, non-zero if any trial errored."""
    task_dir = resolve_task_dir(task_id)
    sanitised = task_dir.name
    trial_dirs = list_trials(task_dir)
    if not trial_dirs:
        print(f"no trials in {task_dir}", file=sys.stderr)
        return 2

    # Resolve the canonical task_name from any one result.json (they all share it).
    task_name = sanitised
    for t in trial_dirs:
        rj = t / "result.json"
        if rj.exists():
            try:
                task_name = json.loads(rj.read_text()).get("task_name", sanitised)
                break
            except Exception:
                pass

    metadata_by_trial = load_trial_metadata(task_dir)

    out_root = Path(args.out_root).resolve()
    task_out = out_root / sanitised
    task_out.mkdir(parents=True, exist_ok=True)
    log_dir = task_out / "_logs"
    log_dir.mkdir(exist_ok=True)

    template = DEFAULT_PROMPT_TEMPLATE
    if args.prompt_file:
        template = Path(args.prompt_file).read_text()

    jobs: list[TrialJob] = []
    for tdir in trial_dirs:
        meta = metadata_by_trial.get(tdir.name, {})
        prompt = build_prompt(
            template,
            trial_dir=tdir,
            task_name=task_name,
            sanitised_task_name=sanitised,
            meta=meta,
        )
        # Codex runs from out_root so its relative writes land alongside
        # _run.json and _logs/. We separately allow access to the trials
        # directory via --add-dir.
        jobs.append(TrialJob(
            trial_id=tdir.name,
            trial_dir=tdir,
            output_md=task_out / f"{tdir.name}.md",
            log_path=log_dir / f"{tdir.name}.log",
            prompt=prompt,
            cwd=out_root,
            add_dirs=[TRIALS_ROOT, TASK_DATASET_ROOT],
            metadata=meta,
        ))

    print(f"task     : {task_name}")
    print(f"trials   : {len(jobs)}")
    print(f"out_root : {out_root}")
    print(f"parallel : {min(args.max_parallel, len(jobs))}")
    print(f"model    : {args.model}")
    print(f"timeout  : {args.timeout_sec}s per trial")

    if args.dry_run:
        sample = jobs[0]
        print("\n--- dry-run sample prompt ---")
        print(sample.prompt[:1200] + ("..." if len(sample.prompt) > 1200 else ""))
        print("\n--- dry-run sample command ---")
        cmd_preview = ["codex", "exec", "--skip-git-repo-check",
                        "--dangerously-bypass-approvals-and-sandbox",
                        "-C", str(sample.cwd),
                        "-m", args.model]
        for d in sample.add_dirs:
            cmd_preview += ["--add-dir", str(d)]
        cmd_preview.append("<prompt>")
        print(" ".join(cmd_preview))
        return 0

    sem = asyncio.Semaphore(min(args.max_parallel, len(jobs)))
    started_at = time.time()
    coros = [run_one(j, model=args.model, timeout_sec=args.timeout_sec,
                      semaphore=sem, dry_run=args.dry_run) for j in jobs]
    results = await asyncio.gather(*coros, return_exceptions=False)
    total = round(time.time() - started_at, 2)

    summary = {
        "task_name": task_name,
        "sanitised_task_name": sanitised,
        "n_trials": len(jobs),
        "n_wrote_output": sum(1 for r in results if r["wrote_output"]),
        "n_errors": sum(1 for r in results if r["exit_code"] != 0),
        "wall_time_sec": total,
        "model": args.model,
        "timeout_sec": args.timeout_sec,
        "max_parallel": args.max_parallel,
        "trials": results,
    }
    (task_out / "_run.json").write_text(json.dumps(summary, indent=2))

    print()
    print(f"finished in {total}s")
    print(f"wrote {summary['n_wrote_output']}/{len(jobs)} output files")
    if summary["n_errors"]:
        print(f"  ! {summary['n_errors']} trials had non-zero exit codes — see {log_dir}")
    print(f"summary -> {task_out / '_run.json'}")

    return 0 if summary["n_errors"] == 0 else 1


# ----------------------------------------------------------------------------- #
# Chunking — split task list into N chunks for parallel teammate work
# ----------------------------------------------------------------------------- #

def list_all_tasks() -> list[str]:
    """Sanitised task names under TRIALS_ROOT, sorted for deterministic chunking."""
    if not TRIALS_ROOT.is_dir():
        raise SystemExit(f"trials root not found: {TRIALS_ROOT}")
    return sorted(p.name for p in TRIALS_ROOT.iterdir() if p.is_dir())


def chunk_assignment(num_chunks: int, tasks: Optional[list[str]] = None
                     ) -> list[tuple[int, str]]:
    """Return [(chunk_id_1based, task_name), ...] for every task.

    Sorted task list is contiguous-sliced into `num_chunks` pieces of size
    ceil(N/num_chunks). Last chunk may be slightly shorter.
    """
    import math
    if num_chunks < 1:
        raise SystemExit("--num-chunks must be >= 1")
    if tasks is None:
        tasks = list_all_tasks()
    n = len(tasks)
    if n == 0:
        return []
    chunk_size = math.ceil(n / num_chunks)
    return [((i // chunk_size) + 1, t) for i, t in enumerate(tasks)]


def parse_chunk_spec(spec: str, num_chunks: int) -> set[int]:
    """Parse '1,3,5' (1-indexed) into {1,3,5}; reject out-of-range ids."""
    ids: set[int] = set()
    for tok in spec.split(","):
        tok = tok.strip()
        if not tok:
            continue
        try:
            cid = int(tok)
        except ValueError:
            raise SystemExit(f"chunk id is not an integer: {tok!r}")
        if not (1 <= cid <= num_chunks):
            raise SystemExit(f"chunk id {cid} out of range [1, {num_chunks}]")
        ids.add(cid)
    if not ids:
        raise SystemExit("--chunks: empty selection")
    return ids


def is_task_done(task_id: str, out_root: Path) -> bool:
    """All of this task's trials have a corresponding <trial_id>.md output."""
    sanitised = task_id.replace("/", "_")
    task_dir = TRIALS_ROOT / sanitised
    if not task_dir.is_dir():
        return False
    expected = {p.name for p in task_dir.iterdir() if p.is_dir()}
    if not expected:
        return False
    out_dir = out_root / sanitised
    if not out_dir.is_dir():
        return False
    actual = {p.stem for p in out_dir.glob("*.md")}
    return expected.issubset(actual)


# ----------------------------------------------------------------------------- #
# Entry
# ----------------------------------------------------------------------------- #

async def main_async(args: argparse.Namespace) -> int:
    if args.list_tasks:
        for cid, t in chunk_assignment(args.num_chunks):
            print(f"chunk {cid:>3}  {t}")
        return 0

    # Decide which tasks to run.
    if args.chunks:
        if args.task_id:
            print("warning: --chunks given; positional task_id is ignored",
                  file=sys.stderr)
        chunk_ids = parse_chunk_spec(args.chunks, args.num_chunks)
        assignment = chunk_assignment(args.num_chunks)
        tasks = [t for cid, t in assignment if cid in chunk_ids]
        if not tasks:
            print(f"no tasks matched chunks {sorted(chunk_ids)}", file=sys.stderr)
            return 2
    elif args.task_id:
        tasks = [args.task_id]
    else:
        print("provide a positional <task_id>, or --chunks SPEC, or --list-tasks",
              file=sys.stderr)
        return 2

    out_root = Path(args.out_root).resolve()
    n = len(tasks)
    print(f"running {n} task(s)" + (f" (chunks {sorted(chunk_ids)} "
          f"of {args.num_chunks})" if args.chunks else ""))

    rc_total = 0
    skipped: list[str] = []
    completed: list[tuple[str, int]] = []

    for i, t in enumerate(tasks, 1):
        print(f"\n[{i}/{n}] {t}")
        if args.skip_done and is_task_done(t, out_root):
            print("  skipping: all per-trial outputs present")
            skipped.append(t)
            continue
        rc = await process_task(t, args)
        completed.append((t, rc))
        if rc != 0:
            rc_total = rc

    if n > 1:
        print(f"\n=== chunk summary ===")
        print(f"completed: {len(completed)} / {n}  "
              f"({sum(1 for _, rc in completed if rc == 0)} clean, "
              f"{sum(1 for _, rc in completed if rc != 0)} with errors)")
        if skipped:
            print(f"skipped  : {len(skipped)}  (use --no-skip-done to re-run)")
        bad = [t for t, rc in completed if rc != 0]
        if bad:
            print("errors in: " + ", ".join(bad))

    return rc_total


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("task_id", nargs="?",
                    help="single task id (sanitised dir name or canonical with /). "
                         "Omit when using --chunks or --list-tasks.")
    ap.add_argument("-o", "--out-root", default="./results",
                    help="root for the per-trial markdown tree (default: ./results)")
    ap.add_argument("-j", "--max-parallel", type=int, default=18,
                    help="concurrent trials per task (default: 18)")
    ap.add_argument("-m", "--model", default="gpt-5.5")
    ap.add_argument("-t", "--timeout-sec", type=int, default=1800)
    ap.add_argument("--prompt-file", help="override the default prompt template")

    ap.add_argument("--chunks", metavar="SPEC",
                    help="run a comma-separated subset of chunks (1-indexed), "
                         "e.g. --chunks 1,3,7. Chunks are deterministic across "
                         "teammates so two people with the same SPEC do the "
                         "same tasks.")
    ap.add_argument("--num-chunks", type=int, default=10,
                    help="how many chunks the full task list is split into "
                         "(default: 10). Must match across teammates.")
    ap.add_argument("--list-tasks", action="store_true",
                    help="print every task's chunk assignment and exit")
    ap.add_argument("--skip-done", action="store_true",
                    help="skip a task if every trial already has a "
                         "<trial_id>.md under <out-root>/<task>/")

    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
