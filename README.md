# habor-mix-analyzer

For adapters paper experiments (correlation study, trajectory analysis, etc.) and harbor mix selection.

## Quick start for teammates

```bash
git clone https://github.com/AlienKevin/habor-mix-analyzer.git
cd habor-mix-analyzer

# one-time: install + auth Codex CLI
npm install -g @openai/codex
codex login

# pick a chunk (1..10) and run it
python3 analyze.py --chunks 3 --skip-done
```

Default model is `gpt-5.5` with reasoning effort `high` — same on every teammate's machine, no `~/.codex/config.toml` editing required. Override with `-m <model>` and/or `--reasoning-effort {minimal,low,medium,high,xhigh}`.

The 100 tasks are split deterministically into 10 chunks of 10. Same `--num-chunks` value across teammates → same partition; coordinate by chunk number. `--skip-done` makes a chunk resumable: if a task already has all its `<trial_id>.md` files under `./results/`, that task is skipped without spending credits.

Useful one-liners:

```bash
python3 analyze.py --list-tasks                # show every task and its chunk
python3 analyze.py --chunks 3 --dry-run        # preview prompt + command, no codex calls
python3 aggregate.py task <task_id>            # task-level rollup once trials are done
```

Per-trial reports land in `./results/<task>/<trial_id>.md` (gitignored — your runs don't conflict with teammates' commits). To share results back, copy the relevant subtree into the committed `./result/` and open a PR.

## `analyze.py` — per-trial codex auditor

`analyze.py` takes a Harbor-Mix task id and spawns up to 18 `codex exec` sessions in parallel, one per trial of that task, and asks each to produce a structured failure analysis. The two data inputs ship in-repo, so a fresh `git clone` is sufficient:

```
harbor-mix-trials/                                           # trial corpus (~616 MB, in-repo)
├── trials_extracted/<sanitised_task>/<trial_id>/
│   ├── trajectory.json     — agent transcript
│   ├── result.json         — harbor wrapper's reward + exception
│   └── test_stdout.txt     — verifier pytest output
└── uploaded_trials.jsonl

task_dataset/                                                # canonical task source (~116 MB, in-repo)
└── harbor-mix/datasets/{daytona,modal}/<daytona_name>/
    ├── instruction.md           — canonical task brief
    ├── tests/test.sh            — verifier entrypoint, defines reward gating
    ├── tests/*                  — pytest fixtures / verifier scripts
    ├── solution/solve.sh        — canonical oracle solution
    ├── environment/Dockerfile   — agent environment image
    └── task.toml                — timeouts, scoring mode, image tag
```

If `test_stdout.txt` is missing for some trials (or you want to refresh after a corpus update), re-run the backfill:

```bash
python3 backfill_test_stdout.py        # idempotent; ~93 s at 32 parallel for 1777 trials
```

Source provenance: `harbor-mix-trials/` originates from the `harbor-mix-final-for-analysis` dataset (Harbor production Supabase, materialized view `mv_harbor_mix_kept_w5`); `task_dataset/` mirrors `harbor-framework/harbor-adapters-experiments@main:harbor-mix/datasets/`.
```

The auditor prompt references, per trial:
- the trajectory and result.json (always present),
- the verifier's actual `test_stdout.txt` (downloaded from Supabase storage by `backfill_test_stdout.py` from `https://hnkceovsiaczvcwhdlkb.supabase.co/storage/v1/object/public/trials/<trial_id>.tar.gz`),
- the canonical task source dir resolved via `uploaded_trials.jsonl`'s `requested_task_name`,

and the codex session is given `--add-dir` for the trials root *and* the task dataset, so it can `cat` the real verifier code and oracle solution rather than guessing from the trajectory. Coverage on the current 1777-trial corpus: 100/100 tasks for source, ~100% for `test_stdout.txt` (a handful may have been pruned upstream and return 404, in which case the prompt notes the file is unavailable and the audit falls back to inferring from the trajectory).

### Usage

```bash
# single task — original interface, still supported
python3 analyze.py <task_id> [-o OUT_ROOT] [-j MAX_PARALLEL] [-m MODEL] [-t TIMEOUT_SEC]
                             [--prompt-file PATH] [--dry-run]

# many tasks via chunked work-sharing (see "Splitting work across teammates" below)
python3 analyze.py --chunks 2,5 [--num-chunks 10] [--skip-done] [other flags]

# enumerate the chunk assignment without running anything
python3 analyze.py --list-tasks [--num-chunks 10]
```

`task_id` accepts either form:

- sanitised dir name: `bigcodebench-bigcodebench_657`
- canonical name with slash: `bigcodebench/bigcodebench_657`

Defaults: `-j 18`, `-m gpt-5.5`, `-t 1800`, `-o ./results`, `--num-chunks 10`. Codex runs with `--dangerously-bypass-approvals-and-sandbox` (workspace-write fails under bubblewrap in the dev env), so the sessions can also explore the host filesystem to pick up packaged test sources (e.g. `/data/packaged/harbor-datasets/.../tests/test_outputs.py`) and quote them in the report.

### Splitting work across teammates

`analyze.py` deterministically splits the full task list (every directory under `harbor-mix-trials/trials_extracted/`) into `--num-chunks` contiguous slices, sorted alphabetically. The same `--num-chunks` value on different machines yields the same chunk membership, so teammates can divide Codex spend by claiming chunks:

```bash
# teammate A
python3 analyze.py --chunks 1,2,3 --skip-done

# teammate B
python3 analyze.py --chunks 4,5,6 --skip-done

# teammate C
python3 analyze.py --chunks 7,8,9,10 --skip-done
```

`--list-tasks` prints `chunk <id>  <task_name>` for every task so a teammate can verify what they'll run before spending credits.

`--skip-done` checks `<out-root>/<task>/` for a `<trial_id>.md` per trial and skips the task if all are present. This makes a partially-completed run resumable: re-run the same command and it picks up where it left off. (Failed trials still re-run because their `.md` is missing.)

Within a chunk, tasks run sequentially; each task still runs its 18 trials in parallel up to `-j`. Approximate wall time per task is 3-6 minutes on `gpt-5.5`, so a 10-task chunk takes roughly 30-60 minutes.

### Outputs

```
<OUT_ROOT>/<sanitised_task>/
├── <trial_id>.md            ← per-trial codex reports (7 sections each)
├── _run.json                ← summary (durations, exit codes, wrote_output flags)
└── _logs/<trial_id>.log     ← raw codex stdout/stderr
```

The default prompt asks each session for: task summary → closeness to success → surface failure → root cause → failing-test evidence (with quoted snippets) → cheating/hacking risk → task-quality verdict. Override the template with `--prompt-file path/to/prompt.txt`; placeholders are `{trajectory_path}`, `{result_path}`, `{task_name}`, `{sanitised_task_name}`, `{trial_id}`, `{model}`, `{agent}`, `{reward}`, `{exception}`.

### Why per-trial output paths instead of `result/{task_name}.md`

18 concurrent sessions writing the same file race. The CLI substitutes a per-trial filename so reports don't clobber each other and so an aggregator can synthesise across trials afterwards (see `aggregate.py`).

## `aggregate.py` — task / model / harness rollups

Once `analyze.py` has produced per-trial reports for one or more tasks under `./result/`, `aggregate.py` synthesises them along three orthogonal dimensions. Each `_run.json` written by `analyze.py` carries `model` and `agent` per trial, so the aggregator is self-contained — no need to re-read `harbor-mix-trials/uploaded_trials.jsonl`.

```bash
# 1 codex session: synthesise result/<task>/*.md  ->  task_aggregation/<task>.md
python3 aggregate.py task    bigcodebench-bigcodebench_657

# N parallel extractions then 1 rollup:
#   model_aggregation/model_extractions/<model>/<task>/<trial_id>.md  (extract phase)
#   model_aggregation/<model>.md                                       (rollup)
python3 aggregate.py model   gpt-5.5

# symmetric:
#   harness_aggregation/harness_extractions/<harness>/<task>/<trial_id>.md
#   harness_aggregation/<harness>.md
python3 aggregate.py harness terminus-2
```

Common flags: `--base PATH` (per-trial reports root, default `./result`), `--out PATH` (project root for `*_aggregation/` dirs, default cwd), `-m MODEL` (codex model, default `gpt-5.5`), `-j MAX_PARALLEL`, `-t TIMEOUT_SEC`, `--dry-run`.

### Why two stages for model and harness, but one for task

A task's per-trial reports are already focused on that one task — aggregating them is a single synthesis. Model / harness rollups, by contrast, need to first *strip out* the task-specific signal from each per-trial report and keep only what's specific to that model or harness. The extraction phase produces one focused file per (dimension-value, trial); the rollup phase reads only those extractions, which keeps the rollup prompt small and on-topic.

## Example audit: `bigcodebench/bigcodebench_657`

A full run (18 trials, ~270 s wall time on `gpt-5.5`) is committed under [`result/bigcodebench-bigcodebench_657/`](result/bigcodebench-bigcodebench_657/), along with all three aggregation flavours generated by `aggregate.py`:

- `result/bigcodebench-bigcodebench_657/<trial_id>.md` — 18 per-trial reports.
- `result/bigcodebench-bigcodebench_657/_run.json` — orchestrator summary (model + agent per trial).
- [`task_aggregation/bigcodebench-bigcodebench_657.md`](task_aggregation/bigcodebench-bigcodebench_657.md) — task-level synthesis over the 18 reports.
- [`model_aggregation/`](model_aggregation/) — one rollup per model (10 files), built on top of per-trial extractions in [`model_aggregation/model_extractions/`](model_aggregation/model_extractions/).
- [`harness_aggregation/`](harness_aggregation/) — one rollup per harness (5 files), built on top of per-trial extractions in [`harness_aggregation/harness_extractions/`](harness_aggregation/harness_extractions/).

Headline finding (refer to `task_aggregation/bigcodebench-bigcodebench_657.md` for the regenerated synthesis): the cell is dominated by a single hidden-test failure (`test_case_3` with `texts=[]`) across 9 models × 5 harnesses, with a common root cause — premature `task_complete` after a happy-path smoke test, no probing of edge cases. Most-damning trace: `gemini-3.1-pro-preview + gemini-cli`, which observed `RuntimeError: you must first build vocabulary before training the model` live during its own self-test and shipped anyway after a syntax-only `py_compile` check.
