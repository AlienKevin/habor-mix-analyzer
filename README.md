# habor-mix-analyzer

For adapters paper experiments (correlation study, trajectory analysis, etc.) and harbor mix selection.

## `analyze.py` — per-trial codex auditor

`analyze.py` takes a Harbor-Mix task id and spawns up to 18 `codex exec` sessions in parallel, one per trial of that task, and asks each to produce a structured failure analysis. It expects the trial corpus laid out as

```
harbor-mix-trials/
├── trials_extracted/<sanitised_task>/<trial_id>/{trajectory.json,result.json}
└── uploaded_trials.jsonl
```

(matching the shape of the `harbor-mix-final-for-analysis` dataset). The corpus directory is gitignored — keep it local.

### Usage

```bash
# from the project root
python3 analyze.py <task_id> [-o OUT_ROOT] [-j MAX_PARALLEL] [-m MODEL] [-t TIMEOUT_SEC]
                             [--prompt-file PATH] [--dry-run]
```

`task_id` accepts either form:

- sanitised dir name: `bigcodebench-bigcodebench_657`
- canonical name with slash: `bigcodebench/bigcodebench_657`

Defaults: `-j 18`, `-m gpt-5.5`, `-t 1800`, `-o ./results`. Codex runs with `--dangerously-bypass-approvals-and-sandbox` (workspace-write fails under bubblewrap in the dev env), so the sessions can also explore the host filesystem to pick up packaged test sources (e.g. `/data/packaged/harbor-datasets/.../tests/test_outputs.py`) and quote them in the report.

### Outputs

```
<OUT_ROOT>/<sanitised_task>/
├── <trial_id>.md            ← per-trial codex reports (7 sections each)
├── _run.json                ← summary (durations, exit codes, wrote_output flags)
└── _logs/<trial_id>.log     ← raw codex stdout/stderr
```

The default prompt asks each session for: task summary → closeness to success → surface failure → root cause → failing-test evidence (with quoted snippets) → cheating/hacking risk → task-quality verdict. Override the template with `--prompt-file path/to/prompt.txt`; placeholders are `{trajectory_path}`, `{result_path}`, `{task_name}`, `{sanitised_task_name}`, `{trial_id}`, `{model}`, `{agent}`, `{reward}`, `{exception}`.

### Why per-trial output paths instead of `result/{task_name}.md`

18 concurrent sessions writing the same file race. The CLI substitutes a per-trial filename so reports don't clobber each other and so an aggregator can synthesise across trials afterwards.

## Example audit: `bigcodebench/bigcodebench_657`

A full run (18 trials, ~270 s wall time on `gpt-5.5`) is committed under [`result/bigcodebench-bigcodebench_657/`](result/bigcodebench-bigcodebench_657/):

- `result/bigcodebench-bigcodebench_657/<trial_id>.md` — 18 per-trial reports.
- `result/bigcodebench-bigcodebench_657/_run.json` — orchestrator summary.
- [`analyses/bigcodebench_657.md`](analyses/bigcodebench_657.md) — synthesised four-question writeup over those 18 reports (closeness to success, model/agent variance with surface-vs-root-cause split, concrete failing behaviours with test snippets, hacking-risk audit, task-quality verdict).

Headline finding: 16 of 18 cells fail the same hidden test (`test_case_3` with `texts=[]`), with identical root cause across 9 models × 5 harnesses — premature `task_complete` after a single happy-path smoke test, no probing of edge cases. Most-damning trace is `gemini-3.1-pro-preview + gemini-cli`, which observed `RuntimeError: you must first build vocabulary before training the model` live during its own self-test and shipped anyway after a syntax-only `py_compile` check.
