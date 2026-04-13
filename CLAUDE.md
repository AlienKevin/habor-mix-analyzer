# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Everything runs through `uv` and the `habor-analyze` console script defined in `pyproject.toml`.

```bash
uv run habor-analyze                         # full pipeline: impute -> intermediate -> studies
uv run habor-analyze impute                  # raw matrices -> SVD-filled processed matrices
uv run habor-analyze intermediate            # processed -> shared intermediate tables
uv run habor-analyze studies                 # intermediate -> paper/study tables, figures, reports
uv run habor-analyze studies --clean         # wipe that step's outputs first
uv run habor-analyze impute intermediate     # run a subset in dependency order
```

There is no test suite, lint config, or build step — this is a data-analysis pipeline, not a library. Iterate by re-running the step whose inputs changed; later steps load prior outputs from disk via `load_imputation_results()` / `load_intermediate_tables()` and will raise `FileNotFoundError` telling you which earlier step to run.

## Pipeline architecture

The `habor-analyze` CLI (`src/habor_mix_analyzer/pipeline.py`) is a thin orchestrator. Three steps, each reading from disk and writing to disk — no in-memory handoff between CLI invocations:

1. **impute** (`imputation.py`) — reads `data/raw/{benchmark,task}_level_matrix.csv`, profiles per-column missingness and scale, applies `log1p` to nonnegative unbounded columns, robustly centers/scales, selects SVD rank by held-out cross-validation, imputes in normalized space, restores observed raw values exactly, and clips imputed raw values to each column's observed range. Writes to `data/processed/intermediate/` with `benchmark_` / `task_` prefixes (`*_svd_imputed_matrix.csv`, `*_svd_imputed_normalized_matrix.csv`, `*_column_quality.csv`, `*_svd_rank_cv.csv`, `*_imputation_diagnostics.json`).
2. **intermediate** (`intermediate_tables.py`) — produces shared tables listed in `pipeline.INTERMEDIATE_TABLES` (correlations, predictability, variance decomposition, latent loadings, task item stats, etc.). Both step-1 and step-3 code depend on these filenames.
3. **studies** (`pipeline.build_study_tables`) — composes study outputs from many modules, filters benchmarks via `coverage_filtering.benchmark_filter_table`, writes tables to `output/studies/{benchmark_level,task_level}/`, mirrors a curated subset (`pipeline.PAPER_TABLES`) to `output/paper/tables/`, writes figures to `output/paper/figures/`, and renders embedded Markdown via `reports.write_paper_reports`.

Study logic is split by research question, not by data type. When editing a specific study, touch that module and the matching figure module:

| Study | Logic | Figures |
| --- | --- | --- |
| Benchmark coverage filter | `coverage_filtering.py` | — |
| Model vs. agent fixed effects, per-benchmark roles | `model_agent_roles.py` | `benchmark_figures.py` |
| Benchmark predictability, similarity, clustering, PCA | `benchmark_predictability_similarity.py` | `benchmark_figures.py` |
| Aggregate + per-benchmark mini leaderboards | `leaderboards.py` | `leaderboard_figures.py` |
| Paired Terminus harness deltas, agent lift | `terminus_harness.py` | `benchmark_figures.py` |
| Task predictability, representativeness, HaborMix candidate selection | `task_studies.py` | `task_figures.py` |
| Provenance + imputation diagnostics | `study_provenance.py` | — |
| Embedded Markdown reports | `reports.py` | — |

`common.py` is the only place that owns paths, constants (`KEY_COLUMNS = ["model", "agent"]`, `RANDOM_SEED = 42`, axis labels), matplotlib setup (`set_plot_style`, `save_paper_figure`), and the `ImputationResult` dataclass. Prefer adding to `common.py` over duplicating paths/labels in study modules.

## Data invariants — read before changing methods

- Rows of both raw matrices are `(model, agent)` systems. `read_raw_matrices()` asserts the two matrices share identical `KEY_COLUMNS` rows — do not break that alignment.
- Score scales are heterogeneous: most columns are bounded pass-rate metrics, `algotune` is unbounded, and some benchmarks carry negative values. This is why imputation runs in robust per-column normalized space with `log1p` on nonnegative unbounded columns.
- **Two score scales exist downstream and must not be mixed.** Per-benchmark mini-leaderboards use SVD-filled scores on the benchmark's original metric scale. Cross-benchmark regressions, correlations, similarity, PCA, and Terminus deltas use benchmark-relative (normalized) scores because raw scales cannot be averaged across benchmarks.
- SVD-filled processed matrices are dense. Any `missingness` column in reports refers to the *original* raw coverage and is retained so evidence quality (measured vs. SVD-filled cells) remains distinguishable in downstream analyses. Do not overwrite missingness metadata with post-imputation coverage.
- Paper-facing benchmark analyses exclude benchmarks with fewer than 15 observed `(model, agent)` rows or more than 45% missingness — driven by `coverage_filtering.benchmark_filter_table`, then propagated as `included_benchmarks` throughout `build_study_tables`.
- For descriptive row labels prefer `agent+model`. For analysis claims, treat `model` and `agent` as separate factors unless a method explicitly combines them (e.g. `adjusted_group_effects`).
- Task column names in `task_level_matrix.csv` follow `benchmark/task_id` — downstream code splits on `/` to attribute tasks to benchmarks.

## Deferred analyses (don't try to implement without new data)

Trial consistency, pass@k, efficiency, and trajectory failure taxonomy need run-level records (trial IDs, trajectories, tokens, tool calls, wall time, error labels) that aren't in the current matrices. Formal IRT/DIF needs repeated binary or calibrated response data. The current task matrix only supports weaker task difficulty/discrimination/predictability/representativeness analyses.

## Outputs layout

- `data/processed/intermediate/` — step-1 and step-2 artifacts (consumed by step 3; safe to delete with `--clean`).
- `output/studies/{benchmark_level,task_level}/` — full expanded study tables.
- `output/paper/{tables,figures,reports}/` — curated paper-facing subset. `PAPER_TABLES` in `pipeline.py` is the authoritative list of which study tables get mirrored to `output/paper/tables/`.
- `clean_legacy_output_dirs()` removes older layouts (`output/{figures,tables,reports,intermediate}`, `data/processed/generated`) on every run — don't reintroduce those paths.
