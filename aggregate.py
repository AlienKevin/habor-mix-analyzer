#!/usr/bin/env python3
"""
aggregate.py — task / model / harness rollups over per-trial codex audits.

Three subcommands. All read per-trial reports from a `--base` directory
(default: `./result`) plus the `_run.json` files written next to them by
`analyze.py`. Each `_run.json` must list per-trial entries with `trial_id`,
`model`, and `agent` keys so we can group by dimension.

    aggregate.py task    <task_id>       # 1 codex session
                                         # inputs : <base>/<task>/*.md
                                         # output : task_aggregation/<task>.md

    aggregate.py model   <model_name>    # N parallel extractions + 1 rollup
                                         # extractions: model_aggregation/
                                         #   model_extractions/<model>/<task>/<trial>.md
                                         # rollup     : model_aggregation/<model>.md

    aggregate.py harness <harness_name>  # symmetric to `model`
                                         # extractions: harness_aggregation/
                                         #   harness_extractions/<harness>/<task>/<trial>.md
                                         # rollup     : harness_aggregation/<harness>.md

Common flags: `-m MODEL` (codex model, default gpt-5.5), `-t TIMEOUT_SEC`
(default 1800), `-j MAX_PARALLEL` (default 18, only relevant to extract
phase), `--base PATH` (per-trial reports root, default ./result),
`--out PATH` (project root for aggregation/* dirs, default cwd),
`--dry-run`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

DEFAULT_BASE = "./result"
DEFAULT_OUT = "./"
DEFAULT_MODEL = "gpt-5.5"
DEFAULT_TIMEOUT = 1800
DEFAULT_PARALLEL = 18

_SANITISE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def sanitise(s: str) -> str:
    """Make a value safe for use as a path segment."""
    return _SANITISE_RE.sub("_", s).strip("_") or "_"


# ----------------------------------------------------------------- index

@dataclass(frozen=True)
class TrialReport:
    task: str
    trial_id: str
    model: str
    agent: str
    path: Path  # the .md per-trial report


def load_index(base: Path) -> list[TrialReport]:
    out: list[TrialReport] = []
    for run_json in sorted(base.glob("*/_run.json")):
        task = run_json.parent.name
        try:
            run = json.loads(run_json.read_text())
        except Exception as exc:
            print(f"warn: cannot read {run_json}: {exc}", file=sys.stderr)
            continue
        for t in run.get("trials", []):
            tid = t.get("trial_id")
            if not tid:
                continue
            md = run_json.parent / f"{tid}.md"
            if not md.exists():
                continue
            out.append(TrialReport(
                task=task,
                trial_id=tid,
                model=t.get("model") or "?",
                agent=t.get("agent") or "?",
                path=md,
            ))
    return out


# ----------------------------------------------------------------- prompts

TASK_AGG_PROMPT = """\
You are synthesising {n} per-trial codex audits of a single Harbor-Mix task
into ONE task-level summary.

Task: `{task}`

Inputs (read-only — do not modify). Each file is structured: task summary,
closeness, surface failure, root cause, failing-test evidence, hacking risk,
task quality verdict.

{inputs}

Aggregate across all {n} into one markdown file. Cover, in order:

1. Task summary (one paragraph distilled from inputs).
2. Closeness to success — distribution across trials. Use a small table or
   list. No sampling — every trial must be reflected.
3. Variance across (model, agent) — what's the same across cells, what
   differs? Distinguish surface failure from root cause.
4. Concrete failing behaviours — quote actual code/test snippets that
   appear in inputs. Cite trial ids when quoting.
5. Hacking / cheating risk — list every vector mentioned across inputs.
6. Task quality verdict — accept / reject, with reasoning.

Write the result to `task_aggregation/{task}.md` (create the directory).
No padding. Stop after writing.
"""


EXTRACT_PROMPT = """\
You are extracting `{value}` specific observations from ONE per-trial audit.
The dimension here is `{dimension}`; you are reading a trial whose
{dimension} = `{value}`.

Trial metadata: task=`{task}` trial_id=`{trial_id}` model=`{model}` agent=`{agent}`.
Input (read-only): {input_path}

Pull only the signal that is specific to this trial's {dimension}
(`{value}`): how it reasoned / orchestrated, what tools it called or
skipped, where it stopped, and any quoted code/output/observation that
illustrates a {dimension}-level tendency. Ignore observations that are
purely about the task spec or about the OTHER dimension (the
{other_dimension}).

Be concise. Use the same five-section framing as the input where it fits
(closeness / surface / root cause / failing-test evidence / hacking risk).

Write to `{output_path}` (create directories). Stop after writing.
"""


ROLLUP_PROMPT = """\
You are synthesising `{value}`'s cross-trial behaviour ({dimension} rollup)
from {n} per-trial extractions. Each input was prepared by an earlier
codex session that pulled out only the {dimension}-specific signal from a
single trial audit.

Inputs (read-only):

{inputs}

Produce a {dimension}-level synthesis covering:

1. Recurring strengths.
2. Recurring weaknesses / failure modes.
3. Common reasoning / verification patterns observed.
4. Examples illustrating each finding — quote snippets and cite
   `(task, trial_id)` sources from the input filenames.
5. Where the {dimension} appears insensitive to the OTHER dimension
   (the {other_dimension}) and where the OTHER dimension visibly changes
   behaviour.
6. Open questions / what is not visible from these extractions alone.

Write to `{output_path}` (create the directory). No padding. Stop after
writing.
"""


# ----------------------------------------------------------------- codex driver

@dataclass
class CodexJob:
    name: str           # short label for logging
    prompt: str
    cwd: Path
    expected_output: Path
    log_path: Path


def is_claude_model(model: str) -> bool:
    m = model.lower().strip()
    return m.startswith("claude") or m in ("opus", "sonnet", "haiku")


def build_session_cmd(*, model: str, reasoning_effort: str, cwd: Path,
                      add_dirs: list[Path], prompt: str
                      ) -> tuple[list[str], dict]:
    """Return (argv, subprocess_kwargs). Routes to codex or claude based on model."""
    if is_claude_model(model):
        cmd = ["claude", "-p",
               "--model", model,
               "--dangerously-skip-permissions",
               "--output-format", "text"]
        if reasoning_effort:
            cmd += ["--effort", reasoning_effort]
        for d in add_dirs:
            cmd += ["--add-dir", str(d)]
        cmd.append(prompt)
        return cmd, {"cwd": str(cwd)}
    cmd = ["codex", "exec",
           "--skip-git-repo-check",
           "--dangerously-bypass-approvals-and-sandbox",
           "-C", str(cwd),
           "-m", model]
    if reasoning_effort:
        cmd += ["-c", f"model_reasoning_effort={reasoning_effort}"]
    for d in add_dirs:
        cmd += ["--add-dir", str(d)]
    cmd.append(prompt)
    return cmd, {}


async def run_codex(job: CodexJob, *, codex_model: str, reasoning_effort: str,
                    timeout_sec: int, sem: asyncio.Semaphore, dry_run: bool) -> dict:
    started = time.time()
    rec = {
        "name": job.name,
        "expected_output": str(job.expected_output),
        "exit_code": None,
        "wrote_output": False,
        "error": None,
        "duration_sec": None,
    }
    if dry_run:
        rec["exit_code"] = 0
        rec["dry_run"] = True
        return rec

    cmd, popen_kwargs = build_session_cmd(
        model=codex_model, reasoning_effort=reasoning_effort,
        cwd=job.cwd, add_dirs=[], prompt=job.prompt,
    )
    job.log_path.parent.mkdir(parents=True, exist_ok=True)
    job.cwd.mkdir(parents=True, exist_ok=True)

    async with sem:
        try:
            with job.log_path.open("wb") as logfh:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=logfh,
                    stderr=asyncio.subprocess.STDOUT,
                    stdin=asyncio.subprocess.DEVNULL,
                    **popen_kwargs,
                )
                try:
                    rc = await asyncio.wait_for(proc.wait(), timeout=timeout_sec)
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()
                    rec["error"] = f"timeout after {timeout_sec}s"
                    rec["exit_code"] = -1
                else:
                    rec["exit_code"] = rc
        except Exception as exc:  # noqa: BLE001
            rec["error"] = repr(exc)
            rec["exit_code"] = -2

    rec["duration_sec"] = round(time.time() - started, 2)
    rec["wrote_output"] = job.expected_output.exists()
    return rec


def fmt_inputs(paths: list[Path], cwd: Path) -> str:
    lines = []
    for p in paths:
        try:
            rel = p.resolve().relative_to(cwd.resolve())
            lines.append(f"- {rel}")
        except ValueError:
            lines.append(f"- {p}")
    return "\n".join(lines)


# ----------------------------------------------------------------- subcommands

async def cmd_task(args, idx: list[TrialReport]) -> int:
    task_reports = [t for t in idx if t.task == args.task_id]
    if not task_reports:
        print(f"no trials found for task {args.task_id!r} under {args.base}",
              file=sys.stderr)
        return 2

    out_root = Path(args.out).resolve()
    cwd = out_root
    expected = out_root / "task_aggregation" / f"{args.task_id}.md"
    log_path = out_root / "task_aggregation" / "_logs" / f"{args.task_id}.log"

    paths = sorted(t.path for t in task_reports)
    prompt = TASK_AGG_PROMPT.format(
        task=args.task_id,
        n=len(paths),
        inputs=fmt_inputs(paths, cwd),
    )
    job = CodexJob(
        name=f"task:{args.task_id}",
        prompt=prompt,
        cwd=cwd,
        expected_output=expected,
        log_path=log_path,
    )
    print(f"task     : {args.task_id}")
    print(f"inputs   : {len(paths)}")
    print(f"output   : {expected}")
    if args.dry_run:
        print("\n--- dry-run prompt (head) ---")
        print(prompt[:800] + ("..." if len(prompt) > 800 else ""))
        return 0

    sem = asyncio.Semaphore(1)
    rec = await run_codex(job, codex_model=args.model, reasoning_effort=args.reasoning_effort,
                          timeout_sec=args.timeout_sec, sem=sem, dry_run=False)
    print(f"finished in {rec['duration_sec']}s, exit={rec['exit_code']}, "
          f"wrote_output={rec['wrote_output']}")
    return 0 if rec["wrote_output"] else 1


async def cmd_dimension(args, idx: list[TrialReport],
                         *, dimension: str) -> int:
    """Shared logic for `model` and `harness` subcommands."""
    other_dim = "agent" if dimension == "model" else "model"
    target = args.value
    matches = [t for t in idx if getattr(t, dimension) == target]
    if not matches:
        existing = sorted({getattr(t, dimension) for t in idx})
        print(f"no trials found with {dimension}={target!r} under {args.base}",
              file=sys.stderr)
        print(f"  available {dimension}s: {', '.join(existing)}", file=sys.stderr)
        return 2

    out_root = Path(args.out).resolve()
    cwd = out_root
    safe_target = sanitise(target)

    if dimension == "model":
        agg_root = out_root / "model_aggregation"
        ext_root = agg_root / "model_extractions"
    else:
        agg_root = out_root / "harness_aggregation"
        ext_root = agg_root / "harness_extractions"
    log_dir = agg_root / "_logs" / safe_target
    rollup_path = agg_root / f"{safe_target}.md"

    # Stage A: parallel extractions
    extract_jobs: list[CodexJob] = []
    for t in matches:
        out_md = ext_root / safe_target / t.task / f"{t.trial_id}.md"
        prompt = EXTRACT_PROMPT.format(
            dimension=dimension,
            other_dimension=other_dim,
            value=target,
            task=t.task,
            trial_id=t.trial_id,
            model=t.model,
            agent=t.agent,
            input_path=t.path,
            output_path=out_md.relative_to(cwd) if out_md.is_relative_to(cwd) else out_md,
        )
        extract_jobs.append(CodexJob(
            name=f"{dimension}:{target}:extract:{t.trial_id[:8]}",
            prompt=prompt,
            cwd=cwd,
            expected_output=out_md,
            log_path=log_dir / "extract" / f"{t.trial_id}.log",
        ))

    print(f"{dimension:8s}: {target}")
    print(f"matches : {len(matches)} trial(s) across "
          f"{len({t.task for t in matches})} task(s)")
    print(f"extracts: {ext_root.relative_to(out_root) if ext_root.is_relative_to(out_root) else ext_root}/{safe_target}/")
    print(f"rollup  : {rollup_path}")

    if args.dry_run:
        print("\n--- dry-run extract prompt (head) ---")
        print(extract_jobs[0].prompt[:600] + "...")
        return 0

    sem = asyncio.Semaphore(min(args.max_parallel, len(extract_jobs)))
    started = time.time()
    extract_recs = await asyncio.gather(*(
        run_codex(j, codex_model=args.model, reasoning_effort=args.reasoning_effort, timeout_sec=args.timeout_sec,
                  sem=sem, dry_run=False)
        for j in extract_jobs
    ))
    extract_wall = round(time.time() - started, 2)
    n_ok = sum(1 for r in extract_recs if r["wrote_output"])
    print(f"  extract: {n_ok}/{len(extract_jobs)} ok in {extract_wall}s")
    if n_ok == 0:
        print("  no extractions succeeded; aborting rollup", file=sys.stderr)
        return 1

    # Stage B: rollup
    extract_paths = sorted(j.expected_output for j in extract_jobs
                           if j.expected_output.exists())
    rollup_prompt = ROLLUP_PROMPT.format(
        dimension=dimension,
        other_dimension=other_dim,
        value=target,
        n=len(extract_paths),
        inputs=fmt_inputs(extract_paths, cwd),
        output_path=rollup_path.relative_to(cwd) if rollup_path.is_relative_to(cwd) else rollup_path,
    )
    rollup_job = CodexJob(
        name=f"{dimension}:{target}:rollup",
        prompt=rollup_prompt,
        cwd=cwd,
        expected_output=rollup_path,
        log_path=log_dir / "rollup.log",
    )
    sem1 = asyncio.Semaphore(1)
    started = time.time()
    rec = await run_codex(rollup_job, codex_model=args.model, reasoning_effort=args.reasoning_effort,
                          timeout_sec=args.timeout_sec, sem=sem1, dry_run=False)
    rollup_wall = round(time.time() - started, 2)
    print(f"  rollup : exit={rec['exit_code']} wrote={rec['wrote_output']} "
          f"in {rollup_wall}s")
    print(f"-> {rollup_path}")
    return 0 if rec["wrote_output"] else 1


# ----------------------------------------------------------------- entry

def make_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--base", default=DEFAULT_BASE,
                        help="root of per-trial reports (default: ./result)")
    common.add_argument("--out", default=DEFAULT_OUT,
                        help="project root where aggregation/* dirs are created (default: cwd)")
    common.add_argument("-m", "--model", default=DEFAULT_MODEL,
                        help="model to drive aggregation. Names starting with "
                             "'claude' (or 'opus'/'sonnet'/'haiku') route "
                             "through the `claude` CLI; everything else "
                             "routes through `codex exec`. Default: gpt-5.5.")
    common.add_argument("--reasoning-effort", default="high",
                        choices=["", "minimal", "low", "medium", "high", "xhigh", "max"],
                        help="reasoning effort. For codex passed as "
                             "-c model_reasoning_effort=<v>; for claude as "
                             "--effort <v>. Default 'high'.")
    common.add_argument("-t", "--timeout-sec", type=int, default=DEFAULT_TIMEOUT)
    common.add_argument("-j", "--max-parallel", type=int, default=DEFAULT_PARALLEL,
                        help="max concurrent extractions (default: 18)")
    common.add_argument("--dry-run", action="store_true")

    p_task = sub.add_parser("task", parents=[common],
                             help="aggregate one task's per-trial reports")
    p_task.add_argument("task_id")

    p_model = sub.add_parser("model", parents=[common],
                              help="extract+rollup one model's behaviour")
    p_model.add_argument("value", help="model name (e.g. gpt-5.5)")

    p_harness = sub.add_parser("harness", parents=[common],
                                help="extract+rollup one harness's behaviour")
    p_harness.add_argument("value", help="harness/agent name (e.g. terminus-2)")

    return ap


async def amain(args) -> int:
    base = Path(args.base).resolve()
    if not base.is_dir():
        print(f"base directory not found: {base}", file=sys.stderr)
        return 2
    idx = load_index(base)
    if not idx:
        print(f"no per-trial reports under {base}", file=sys.stderr)
        return 2

    if args.cmd == "task":
        return await cmd_task(args, idx)
    if args.cmd == "model":
        return await cmd_dimension(args, idx, dimension="model")
    if args.cmd == "harness":
        return await cmd_dimension(args, idx, dimension="agent")
    print(f"unknown subcommand: {args.cmd}", file=sys.stderr)
    return 2


def main() -> int:
    args = make_parser().parse_args()
    return asyncio.run(amain(args))


if __name__ == "__main__":
    sys.exit(main())
