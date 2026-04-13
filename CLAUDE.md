# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Everything runs through `uv` and the `habor-analyze` console script (`habor_mix_analyzer.main:main` → `orchestration.runner.main`).

```bash
uv run habor-analyze                         # full pipeline: impute -> intermediate -> studies
uv run habor-analyze impute                  # raw matrices -> SVD-filled task matrix + benchmark-from-task aggregates
uv run habor-analyze intermediate            # processed -> shared intermediate tables
uv run habor-analyze studies                 # intermediate -> key-analysis tables, figures, reports
uv run habor-analyze studies --clean         # wipe that step's outputs first
uv run habor-analyze impute intermediate     # run a subset (always executed in dependency order)
```

There is no test suite, lint config, or build step — this is a data-analysis pipeline, not a library. Iterate by re-running the step whose inputs changed; later steps load prior outputs from disk via `load_imputation_results()` / `load_intermediate_tables()` and will raise `FileNotFoundError` naming the missing file (and the step that produces it).

## Pipeline architecture

The `habor-analyze` CLI lives in `orchestration/runner.py` and is a thin orchestrator. Three steps, each reading from disk and writing to disk — no in-memory handoff between CLI invocations:

1. **impute** (`preprocessing/svd_imputation.py`) — reads `data/raw/{benchmark,task}_level_matrix.csv`, profiles per-column missingness and scale on the **task** matrix, applies `log1p` to nonnegative unbounded columns, robustly centers/scales, selects SVD rank by held-out cross-validation (ranks tried: `[2, 4, 6, 8, 10, 12, 16, 20]`, holdout 5%), imputes missing task cells in normalized space, restores observed raw values exactly, and clips imputed raw values to each column's observed range. The **benchmark** matrix is *not* SVD-imputed directly; instead `aggregate_task_result_to_benchmarks` aggregates the SVD-filled task matrix into benchmark scores. Writes `task_svd_imputed_matrix.csv`, `task_svd_imputed_normalized_matrix.csv`, `task_column_quality.csv`, `task_svd_rank_cv.csv`, `task_imputation_diagnostics.json`, plus the `benchmark_from_task_aggregate_*` counterparts under `data/processed/intermediate/`.
2. **intermediate** (`studies/intermediate_tables.py`, via `write_tables`) — produces shared tables listed in `runner.INTERMEDIATE_TABLES` (correlations, predictability, variance decomposition, latent loadings, task item stats, etc.). Both step-1 and step-3 code depend on these filenames.
3. **studies** (`runner.build_study_tables`) — composes study outputs from many modules, filters benchmarks via `studies.coverage_filtering.benchmark_filter_table`, writes full expanded tables to `output/intermediate_studies/{benchmark_level,task_level}/`, mirrors a curated subset (`runner.KEY_ANALYSIS_TABLES`, routed via `KEY_TABLE_SUBDIRS`) into `output/key_analyses/tables/{benchmark_level,task_level,leaderboards,harbormix,provenance}/`, writes figures into `output/key_analyses/figures/...`, and renders embedded Markdown via `reporting.key_analysis_report.write_key_analysis_reports`.

Study logic is split by research question, not by data type. When editing a specific study, touch that module and the matching figure module:

| Study | Logic | Figures |
| --- | --- | --- |
| Benchmark coverage filter | `studies/coverage_filtering.py` | — |
| Model vs. agent fixed effects, per-benchmark roles | `studies/model_agent_roles.py` | `visualization/benchmark_plots.py` |
| Benchmark predictability, PCA latent structure | `studies/benchmark_predictability.py` | `visualization/benchmark_plots.py` |
| Benchmark correlations, similarity, clustering | `studies/benchmark_similarity.py` | `visualization/benchmark_plots.py` |
| Aggregate + per-benchmark mini leaderboards | `studies/leaderboards.py` | `visualization/leaderboard_plots.py` |
| Paired Terminus harness deltas, agent lift | `studies/terminus_comparison.py` | `visualization/benchmark_plots.py` |
| Task aggregate vs. benchmark alignment | `studies/task_alignment.py` | `visualization/task_plots.py` |
| Task predictability, representativeness, within/cross-benchmark similarity | `studies/task_similarity.py` | `visualization/task_plots.py` |
| Task reliability filtering + HaborMix candidate selection | `studies/task_selection.py` | `visualization/task_plots.py` |
| Provenance + imputation diagnostics | `studies/provenance.py` | — |
| Embedded Markdown reports | `reporting/key_analysis_report.py` | — |

`core/` owns the shared vocabulary — `config.py` (paths, `KEY_COLUMNS = ["model", "agent"]`, `RANDOM_SEED = 42`, `RELATIVE_SCORE_LABEL`/`DELTA_SCORE_LABEL`, the `ImputationResult` dataclass), `io.py` (`read_matrix`, `write_csv`, `clean_dir`), and `plotting.py` (`set_plot_style`, paper-figure save helpers). Prefer adding to `core/` over duplicating paths/labels in study modules.

## Data invariants — read before changing methods

- Rows of both raw matrices are `(model, agent)` systems. `read_raw_matrices()` asserts the two matrices share identical `KEY_COLUMNS` rows — do not break that alignment.
- Score scales are heterogeneous: most columns are bounded pass-rate metrics, `algotune` is unbounded, and some benchmarks carry negative values. This is why task imputation runs in robust per-column normalized space with `log1p` on nonnegative unbounded columns.
- **Two score scales exist downstream and must not be mixed.** Per-benchmark mini-leaderboards use benchmark scores aggregated from SVD-filled tasks on each benchmark's original metric scale. Cross-benchmark regressions, correlations, similarity, PCA, and Terminus deltas use benchmark-relative (normalized) scores because raw scales cannot be averaged across benchmarks.
- **Only the task matrix is SVD-imputed.** Benchmark scores are aggregated from the filled task matrix — do not introduce a direct SVD over the raw benchmark matrix.
- SVD-filled task / aggregated benchmark matrices are dense. Any `missingness` column in reports refers to the *original* raw coverage (pre-imputation / pre-aggregation) and is retained so evidence quality (measured vs. SVD-filled cells) remains distinguishable in downstream analyses. Do not overwrite missingness metadata with post-imputation coverage.
- Key-analysis benchmark filtering (`benchmark_filter_table`) drops benchmarks with fewer than 15 observed `(model, agent)` rows or more than 45% missingness; the surviving list `included_benchmarks` is threaded through `build_study_tables` and must be used everywhere key-analysis outputs are produced.
- For descriptive row labels prefer `agent+model`. For analysis claims, treat `model` and `agent` as separate factors unless a method explicitly combines them (e.g. `adjusted_group_effects`).
- Task column names in `task_level_matrix.csv` follow `benchmark/task_id` — downstream code splits on the first `/` to attribute tasks to benchmarks.

## Deferred analyses (don't try to implement without new data)

Trial consistency, pass@k, efficiency, and trajectory failure taxonomy need run-level records (trial IDs, trajectories, tokens, tool calls, wall time, error labels) that aren't in the current matrices. Formal IRT/DIF needs repeated binary or calibrated response data. The current task matrix only supports weaker task difficulty/discrimination/predictability/representativeness analyses.

## Outputs layout

- `data/processed/intermediate/` — step-1 and step-2 artifacts (consumed by step 3; wiped by `--clean impute` / removal of matching files by `--clean intermediate`).
- `output/intermediate_studies/{benchmark_level,task_level}/` — full expanded study tables.
- `output/key_analyses/{tables,figures,reports}/` — curated key-analysis subset. `KEY_ANALYSIS_TABLES` in `orchestration/runner.py` is the authoritative list of which study tables get mirrored here; `KEY_TABLE_SUBDIRS` routes each one into `benchmark_level/`, `task_level/`, `leaderboards/`, `harbormix/`, or `provenance/`.
- `clean_legacy_output_dirs()` removes older layouts (`output/{figures,tables,reports,intermediate,paper,studies}`, `data/processed/generated`) on every run — don't reintroduce those paths.
