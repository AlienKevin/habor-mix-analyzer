# habor-mix-analyzer

Analysis pipeline for large-scale agent benchmark matrices used in the adapters / HaborMix study.

## Quick Start

Run the current pipeline with `uv`:

```bash
uv run habor-analyze
```

The command reads raw matrices from `data/raw/`, writes intermediate processed data under `data/processed/intermediate/`, and writes curated study results under `output/studies/` and `output/paper/`.

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

Trial consistency, pass@k, efficiency, IRT/DIF, and trajectory failure taxonomy are not implemented yet because the current raw files do not include trial IDs, trajectories, token/tool counts, wall time, or run-level error labels.
