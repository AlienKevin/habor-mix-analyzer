# habor-mix-analyzer

Analysis pipeline for large-scale agent benchmark matrices used in the adapters / HaborMix study.

## Quick Start

Run the current pipeline with `uv`:

```bash
uv run habor-analyze
```

The command reads raw matrices from `data/raw/`, writes processed data under `data/processed/generated/`, and writes analysis tables, figures, and a Markdown report under `output/`.

## Current Inputs

- `data/raw/benchmark_level_matrix.csv`: `(model, agent) x benchmark` score matrix.
- `data/raw/task_level_matrix.csv`: `(model, agent) x benchmark/task` score matrix.
- `brainstorm/Adapter Large-scale-eval study guide (opus46) 20260409.pdf`: analysis plan reference.

## Current Outputs

Processed data:

- `data/processed/generated/benchmark_svd_imputed_matrix.csv`
- `data/processed/generated/benchmark_svd_imputed_normalized_matrix.csv`
- `data/processed/generated/task_svd_imputed_matrix.csv`
- `data/processed/generated/task_svd_imputed_normalized_matrix.csv`
- `data/processed/generated/*_column_quality.csv`
- `data/processed/generated/*_svd_rank_cv.csv`
- `data/processed/generated/benchmark_observed_imputed_long.csv`
- `data/processed/generated/task_item_stats.csv`
- `data/processed/generated/task_benchmark_summary.csv`
- `data/processed/generated/variance_decomposition.csv`
- `data/processed/generated/benchmark_correlations.csv`
- `data/processed/generated/benchmark_predictability.csv`
- `data/processed/generated/benchmark_latent_loadings.csv`
- `data/processed/generated/benchmark_latent_explained_variance.csv`

Readable results:

- `output/reports/analysis_summary.md`
- `output/figures/benchmark_missingness.png`
- `output/figures/benchmark_correlation_heatmap.png`
- `output/figures/system_rankings.png`
- `output/figures/variance_attribution.png`
- `output/figures/task_difficulty_tiers_top30.png`
- `output/figures/svd_rank_cv.png`

## Method Notes

The raw matrices are incomplete and have mixed score scales. The pipeline therefore:

1. Profiles missingness and raw value ranges by benchmark/task column.
2. Applies `log1p` to nonnegative unbounded columns, then robustly centers and scales each column.
3. Selects an SVD imputation rank by held-out observed-cell cross-validation.
4. Imputes missing cells in normalized space.
5. Restores observed raw values exactly and clips imputed raw values to each column's observed range.
6. Builds benchmark correlation, predictability, variance attribution, task difficulty, latent loading, and agent-differential tables.

Trial consistency, pass@k, efficiency, IRT/DIF, and trajectory failure taxonomy are not implemented yet because the current raw files do not include trial IDs, trajectories, token/tool counts, wall time, or run-level error labels.
