# habor-mix-analyzer

Analysis pipeline for large-scale agent benchmark matrices used in the adapters / HaborMix study.

## Quick Start

Run the full pipeline with `uv`:

```bash
uv run habor-analyze
```

The command reads raw matrices from `data/raw/`, writes intermediate processed data under `data/processed/intermediate/`, and writes curated study results under `output/intermediate_studies/` and `output/key_analyses/`.

The pipeline is also step-based, so you do not need to recompute everything after every edit:

```bash
uv run habor-analyze impute --clean
uv run habor-analyze intermediate
uv run habor-analyze studies --clean
```

Available steps:

- `impute`: raw task matrix -> SVD-filled task matrix, benchmark-from-task aggregates, and preprocessing diagnostics.
- `intermediate`: processed matrices -> intermediate analysis tables under `data/processed/intermediate/`.
- `studies`: intermediate tables -> key analysis tables, figures, and reports.
- `all`: runs `impute`, `intermediate`, and `studies` in dependency order.

Use `--clean` to clean generated outputs for the selected step before running it. Without `--clean`, the command only rewrites the deterministic files produced by that step.

## Code Structure

- `src/habor_mix_analyzer/cli.py`: minimal CLI entry point exposed by `uv run habor-analyze`.
- `src/habor_mix_analyzer/main.py`: compatibility entry point that forwards to the CLI.
- `src/habor_mix_analyzer/orchestration/runner.py`: step composition for `impute`, `intermediate`, and `studies`.
- `src/habor_mix_analyzer/core/`: paths, constants, shared I/O helpers, report helpers, and plotting style.
- `src/habor_mix_analyzer/preprocessing/svd_imputation.py`: task-level robust scaling, SVD rank selection, task imputation, and benchmark aggregation from task scores.
- `src/habor_mix_analyzer/studies/intermediate_tables.py`: shared processed tables used by later studies.
- `src/habor_mix_analyzer/studies/coverage_filtering.py`: benchmark coverage filtering.
- `src/habor_mix_analyzer/studies/model_agent_roles.py`: model-vs-agent fixed-effect and per-benchmark role analysis.
- `src/habor_mix_analyzer/studies/benchmark_predictability.py`: BenchPress-style benchmark predictability and PCA.
- `src/habor_mix_analyzer/studies/benchmark_similarity.py`: benchmark correlations, similarity, and clustering.
- `src/habor_mix_analyzer/studies/leaderboards.py`: agent+model aggregate and per-benchmark leaderboard tables.
- `src/habor_mix_analyzer/studies/terminus_comparison.py`: paired Terminus harness deltas.
- `src/habor_mix_analyzer/studies/task_alignment.py`: task aggregate to benchmark score alignment.
- `src/habor_mix_analyzer/studies/task_selection.py`: task reliability filtering and HaborMix candidate selection.
- `src/habor_mix_analyzer/studies/task_similarity.py`: task predictability, representativeness, and within/cross-benchmark similarity.
- `src/habor_mix_analyzer/studies/provenance.py`: provenance and imputation diagnostics tables.
- `src/habor_mix_analyzer/visualization/`: key analysis benchmark, leaderboard, and task figures.
- `src/habor_mix_analyzer/reporting/key_analysis_report.py`: embedded Markdown reports.

## Current Inputs

- `data/raw/benchmark_level_matrix.csv`: `(model, agent) x benchmark` score matrix.
- `data/raw/task_level_matrix.csv`: `(model, agent) x benchmark/task` score matrix.
- `brainstorm/Adapter Large-scale-eval study guide (opus46) 20260409.pdf`: analysis plan reference.

## Current Outputs

Intermediate processed data:

- `data/processed/intermediate/benchmark_from_task_aggregate_matrix.csv`
- `data/processed/intermediate/benchmark_from_task_aggregate_normalized_matrix.csv`
- `data/processed/intermediate/benchmark_from_task_aggregate_column_quality.csv`
- `data/processed/intermediate/task_svd_imputed_matrix.csv`
- `data/processed/intermediate/task_svd_imputed_normalized_matrix.csv`
- `data/processed/intermediate/*_column_quality.csv`
- `data/processed/intermediate/*_svd_rank_cv.csv`
- `data/processed/intermediate/task_item_stats.csv`

Key analysis results:

- `output/key_analyses/reports/analysis_story.md`
- `output/key_analyses/reports/key_findings.md`
- `output/key_analyses/tables/benchmark_level/`: benchmark filtering, variance, predictability, similarity, and Terminus tables.
- `output/key_analyses/tables/leaderboards/`: aggregate and per-benchmark agent+model leaderboard tables.
- `output/key_analyses/tables/task_level/`: task reliability, task alignment, task similarity, task predictability, and representative-task tables.
- `output/key_analyses/tables/harbormix/`: HaborMix candidate-selection tables.
- `output/key_analyses/tables/provenance/`: data provenance and preprocessing diagnostics.
- `output/key_analyses/figures/benchmark_level/`: benchmark role, similarity, uniqueness, variance, and Terminus figures.
- `output/key_analyses/figures/leaderboards/`: aggregate leaderboard plus per-benchmark and cluster mini-leaderboards.
- `output/key_analyses/figures/task_level/`: task difficulty, similarity, predictability, representative-task, and alignment figures.
- `output/key_analyses/figures/harbormix/`: HaborMix candidate-selection diagnostics.

Expanded study outputs:

- `output/intermediate_studies/benchmark_level/`
- `output/intermediate_studies/task_level/`

## Method Notes

The raw matrices are incomplete and have mixed score scales. The pipeline therefore:

1. Profiles missingness and raw value ranges by task column.
2. Applies `log1p` to nonnegative unbounded task columns, then robustly centers and scales each task column.
3. Selects a task-SVD imputation rank by held-out observed-cell cross-validation.
4. Imputes missing task cells in normalized space.
5. Restores observed task values exactly and clips imputed task values to each column's observed range.
6. Aggregates SVD-filled task scores into benchmark scores. Benchmark scores are not SVD-imputed directly.
7. Builds benchmark correlation, predictability, similarity clusters, variance attribution, task difficulty, task similarity, task predictability, useful task representativeness, mini-leaderboards, and agent-differential tables.
8. Filters sparse benchmarks before key analysis, then writes separate benchmark-level and task-level study outputs plus an embedded key analysis narrative report.

The task SVD-filled processed matrix is dense. Benchmark scores are calculated from that task matrix. Missingness columns in reports and tables refer to original input-table coverage and are retained to distinguish measured evidence from SVD-filled task cells.

Per-benchmark mini-leaderboards use benchmark scores aggregated from SVD-filled task scores on each benchmark's original metric scale. Cross-benchmark regressions, similarity, and Terminus deltas still use benchmark-relative scores because benchmark score scales are heterogeneous and cannot be averaged directly across benchmarks.

Trial consistency, pass@k, efficiency, and trajectory failure taxonomy require run-level records with trial IDs, trajectories, tokens, tool calls, wall time, and error labels. Formal IRT/DIF remains deferred until repeated binary or calibrated response data is available; the current task matrix supports weaker task difficulty, discrimination, predictability, and representativeness analyses.
