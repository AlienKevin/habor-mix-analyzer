# habor-mix-analyzer

Analysis pipeline for large-scale agent benchmark matrices used in the adapters / HaborMix study.

## Quick Start

Run the full pipeline with `uv`:

```bash
uv run habor-analyze
```

The command reads raw matrices from `data/raw/`, writes intermediate processed data under `data/processed/intermediate/`, and writes curated study results under `output/studies/` and `output/paper/`.

The pipeline is also step-based, so you do not need to recompute everything after every edit:

```bash
uv run habor-analyze impute --clean
uv run habor-analyze intermediate
uv run habor-analyze studies --clean
```

Available steps:

- `impute`: raw matrices -> SVD-filled processed matrices and imputation diagnostics.
- `intermediate`: processed matrices -> intermediate analysis tables under `data/processed/intermediate/`.
- `studies`: intermediate tables -> paper/study tables, figures, and reports.
- `all`: runs `impute`, `intermediate`, and `studies` in dependency order.

Use `--clean` to clean generated outputs for the selected step before running it. Without `--clean`, the command only rewrites the deterministic files produced by that step.

## Code Structure

- `src/habor_mix_analyzer/cli.py`: minimal CLI entry point exposed by `uv run habor-analyze`.
- `src/habor_mix_analyzer/pipeline.py`: compatibility entry point that forwards to the CLI.
- `src/habor_mix_analyzer/orchestration/runner.py`: step composition for `impute`, `intermediate`, and `studies`.
- `src/habor_mix_analyzer/core/`: paths, constants, shared I/O helpers, report helpers, and plotting style.
- `src/habor_mix_analyzer/preprocessing/svd_imputation.py`: robust scaling, SVD rank selection, imputation, and processed matrix writing.
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
- `src/habor_mix_analyzer/visualization/`: paper-facing benchmark, leaderboard, and task figures.
- `src/habor_mix_analyzer/reporting/paper_report.py`: embedded Markdown reports.

## Current Inputs

- `data/raw/benchmark_level_matrix.csv`: `(model, agent) x benchmark` score matrix.
- `data/raw/task_level_matrix.csv`: `(model, agent) x benchmark/task` score matrix.
- `brainstorm/Adapter Large-scale-eval study guide (opus46) 20260409.pdf`: analysis plan reference.

## Current Outputs

Intermediate processed data:

- `data/processed/intermediate/benchmark_svd_imputed_matrix.csv`
- `data/processed/intermediate/benchmark_svd_imputed_normalized_matrix.csv`
- `data/processed/intermediate/task_svd_imputed_matrix.csv`
- `data/processed/intermediate/task_svd_imputed_normalized_matrix.csv`
- `data/processed/intermediate/*_column_quality.csv`
- `data/processed/intermediate/*_svd_rank_cv.csv`
- `data/processed/intermediate/task_item_stats.csv`

Paper-facing results:

- `output/paper/reports/analysis_story.md`
- `output/paper/reports/key_findings.md`
- `output/paper/tables/benchmark_filtering.csv`
- `output/paper/tables/analysis_data_provenance.csv`
- `output/paper/tables/imputation_diagnostics_summary.csv`
- `output/paper/tables/benchmark_scores_long.csv`
- `output/paper/tables/benchmark_model_adjusted_effects.csv`
- `output/paper/tables/benchmark_agent_adjusted_effects.csv`
- `output/paper/tables/benchmark_agent_lift_vs_terminus.csv`
- `output/paper/tables/benchmark_model_agent_role_by_benchmark.csv`
- `output/paper/tables/benchmark_similarity_clusters.csv`
- `output/paper/tables/benchmark_uniqueness_filtered.csv`
- `output/paper/tables/task_predictability_ranked.csv`
- `output/paper/tables/task_representative_tasks.csv`
- `output/paper/tables/task_cross_benchmark_similarity.csv`
- `output/paper/tables/task_benchmark_reliable_summary.csv`
- `output/paper/tables/task_to_benchmark_alignment.csv`
- `output/paper/tables/harbormix_candidate_tasks.csv`
- `output/paper/tables/harbormix_selection_by_benchmark.csv`
- `output/paper/figures/benchmark_agent_model_top_scores.png`
- `output/paper/figures/benchmark_variance_attribution.png`
- `output/paper/figures/benchmark_model_vs_agent_role.png`
- `output/paper/figures/benchmark_similarity_clustered_heatmap.png`
- `output/paper/figures/benchmark_model_adjusted_effects.png`
- `output/paper/figures/benchmark_agent_adjusted_effects.png`
- `output/paper/figures/benchmark_agent_lift_heatmap.png`
- `output/paper/figures/terminus_delta_by_model_heatmap.png`
- `output/paper/figures/benchmark_uniqueness_vs_coverage.png`
- `output/paper/figures/task_hard_to_predict_ranked.png`
- `output/paper/figures/task_best_representatives.png`
- `output/paper/figures/task_similarity_benchmark_pair_heatmap.png`
- `output/paper/figures/harbormix_selection_diagnostics.png`
- `output/paper/figures/task_reliable_difficulty_composition.png`
- `output/paper/figures/task_to_benchmark_alignment.png`

Expanded study outputs:

- `output/studies/benchmark_level/`
- `output/studies/task_level/`

## Method Notes

The raw matrices are incomplete and have mixed score scales. The pipeline therefore:

1. Profiles missingness and raw value ranges by benchmark/task column.
2. Applies `log1p` to nonnegative unbounded columns, then robustly centers and scales each column.
3. Selects an SVD imputation rank by held-out observed-cell cross-validation.
4. Imputes missing cells in normalized space.
5. Restores observed raw values exactly and clips imputed raw values to each column's observed range.
6. Builds benchmark correlation, predictability, similarity clusters, variance attribution, task difficulty, task similarity, task predictability, task representativeness, mini-leaderboards, and agent-differential tables.
7. Filters sparse benchmarks before paper-facing analysis, then writes separate benchmark-level and task-level study outputs plus an embedded paper-facing narrative report.

The SVD-filled processed matrices are dense. Missingness columns in reports and tables refer to the original input-table coverage, and are retained to distinguish measured evidence from SVD-filled cells.

Per-benchmark mini-leaderboards use SVD-filled benchmark scores on each benchmark's original metric scale. Cross-benchmark regressions, similarity, and Terminus deltas still use benchmark-relative scores because benchmark score scales are heterogeneous and cannot be averaged directly across benchmarks.

Trial consistency, pass@k, efficiency, and trajectory failure taxonomy require run-level records with trial IDs, trajectories, tokens, tool calls, wall time, and error labels. Formal IRT/DIF remains deferred until repeated binary or calibrated response data is available; the current task matrix supports weaker task difficulty, discrimination, predictability, and representativeness analyses.
