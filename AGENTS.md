# Agent Notes

This repository contains a `uv`-run analysis pipeline for cross-benchmark agent evaluation matrices.

## Current Pipeline

- Run the full pipeline with `uv run habor-analyze`.
- Raw inputs live under `data/raw/`.
- Intermediate processed data lives under `data/processed/intermediate/`.
- Expanded study outputs live under `output/studies/`.
- Important paper-facing tables, figures, and reports live under `output/paper/`.
- The pipeline cleans only its generated output directories before each run.

## Data Assumptions

- Rows are `(model, agent)` systems.
- `data/raw/benchmark_level_matrix.csv` columns after `model,agent` are benchmark-level scores.
- `data/raw/task_level_matrix.csv` columns after `model,agent` are task scores named `benchmark/task_id`.
- Raw score scales are mixed. Most columns are bounded pass-rate style metrics, but `algotune` is unbounded and some benchmarks contain negative values, so imputation is done in robust per-column normalized space. Nonnegative unbounded columns use `log1p` before normalization and are inverse-transformed after imputation.
- Paper-facing benchmark-level analyses filter out benchmarks with fewer than 15 observed agent+model rows or more than 45% missingness.
- Prefer `agent+model` for descriptive row labels. Treat `model` and `agent` separately for analysis claims unless the method explicitly says otherwise.

## Pending Data Needs

- Trial consistency, pass@k, efficiency, and trajectory failure analysis require run-level records with trial IDs, success flags, trajectories, tokens, tool calls, wall time, and error labels.
- Full IRT/DIF analysis is deferred until repeated binary or calibrated response data is available.
