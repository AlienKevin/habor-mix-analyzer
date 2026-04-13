# Agent Notes

This repository contains a `uv`-run analysis pipeline for cross-benchmark agent evaluation matrices.

## Current Pipeline

- Run the full pipeline with `uv run habor-analyze`.
- Run steps independently with `uv run habor-analyze impute`, `uv run habor-analyze intermediate`, and `uv run habor-analyze studies`.
- Use `--clean` to clean generated outputs for the selected steps before running them.
- Raw inputs live under `data/raw/`.
- Intermediate processed data lives under `data/processed/intermediate/`.
- Expanded study outputs live under `output/intermediate_studies/`.
- Important key analysis tables, figures, and reports live under `output/key_analyses/`.
- Key analysis tables are layered by purpose under `output/key_analyses/tables/{benchmark_level,leaderboards,task_level,harbormix,provenance}/`.
- Key analysis figures are layered by purpose under `output/key_analyses/figures/{benchmark_level,leaderboards,task_level,harbormix}/`, with mini-leaderboards further split into `leaderboards/per_benchmark/` and `leaderboards/clustered/`.
- The CLI entry point is `src/habor_mix_analyzer/cli.py`; `src/habor_mix_analyzer/main.py` is a compatibility wrapper for the installed script.
- Step orchestration lives in `src/habor_mix_analyzer/orchestration/runner.py`.
- Shared helpers live in `src/habor_mix_analyzer/core/`.
- Task imputation preprocessing lives in `src/habor_mix_analyzer/preprocessing/svd_imputation.py`.
- Analysis methods are organized by study question under `src/habor_mix_analyzer/studies/`: coverage filtering, model-vs-agent roles, benchmark predictability, benchmark similarity, leaderboards, Terminus comparison, task alignment, task selection, task similarity, and provenance.
- Key analysis figure code lives under `src/habor_mix_analyzer/visualization/`.
- Embedded Markdown reporting lives in `src/habor_mix_analyzer/reporting/key_analysis_report.py`.

## Data Assumptions

- Rows are `(model, agent)` agent+model pairs.
- `data/raw/benchmark_level_matrix.csv` columns after `model,agent` are benchmark-level scores.
- `data/raw/task_level_matrix.csv` columns after `model,agent` are task scores named `benchmark/task_id`.
- Raw score scales are mixed. Most task columns are bounded pass-rate style metrics, but some tasks can be unbounded or negative, so task imputation is done in robust per-column normalized space. Nonnegative unbounded columns use `log1p` before normalization and are inverse-transformed after imputation.
- The pipeline fills the task matrix only, then aggregates task scores into benchmark scores. Benchmark scores are not directly imputed.
- Task imputation is selected by held-out observed-cell validation across column median, row-mean shrinkage, two-way shrinkage, and low-rank iterative SVD candidates.
- Filled processed task matrices are dense. Missingness fields refer to original input coverage and are retained for evidence-quality filtering.
- Per-benchmark mini-leaderboards use benchmark scores aggregated from filled task scores. Cross-benchmark regressions, correlations, and Terminus deltas use benchmark-relative scores because benchmark scales are heterogeneous.
- Key analysis benchmark-level analyses filter out benchmarks with fewer than 15 observed agent+model rows or more than 45% missingness.
- Prefer `agent+model` for descriptive row labels. Treat `model` and `agent` separately for analysis claims unless the method explicitly says otherwise.

## Pending Data Needs

- Trial consistency, pass@k, efficiency, and trajectory failure analysis require run-level records with trial IDs, success flags, trajectories, tokens, tool calls, wall time, and error labels.
- Full IRT/DIF analysis is deferred until repeated binary or calibrated response data is available.
