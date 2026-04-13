# Key Analysis Cross-Benchmark Analysis

This report is intended to be read directly. Figures and compact table previews are embedded inline; CSV paths are listed for exact numbers and reproducibility.

## Directory Contract

- Key analysis tables: `output/key_analyses/tables/`
- Key analysis figures: `output/key_analyses/figures/`
- Layered table groups: `benchmark_level/`, `leaderboards/`, `task_level/`, `harbormix/`, and `provenance/`.
- Layered figure groups: `benchmark_level/`, `leaderboards/`, `task_level/`, and `harbormix/`.
- Intermediate study outputs: `output/intermediate_studies/`
- Intermediate imputed matrices and diagnostics: `data/processed/intermediate/`

The current preprocessing contract is task-first: task scores are SVD-filled, then benchmark scores are aggregated from the filled task matrix. The original benchmark matrix is retained as metadata and as a sanity check, but benchmark scores are not SVD-filled directly.

BenchPress mapping note: Dimitris's BenchPress repo treats benchmark prediction as an explicit analysis problem, compares benchmark-regression and SVD families under held-out validation, and uses a blend because regression can be more accurate while SVD gives broader coverage. Our schema is task-rich rather than model-benchmark-only, so we map that lesson by using task-SVD for coverage, benchmark/task predictability tables for difficulty ranking, and task aggregate alignment as a diagnostic rather than blindly trusting every aggregate.

Data provenance for the main studies:

| analysis | primary_matrix | processed_output |
| --- | --- | --- |
| coverage filtering | task-observed benchmark aggregate metadata | data/processed/intermediate/benchmark_from_task_aggregate_column_quality.csv |
| agent+model aggregate leaderboard | benchmark scores aggregated from SVD-filled task matrix | data/processed/intermediate/benchmark_from_task_aggregate_matrix.csv |
| per-benchmark mini-leaderboards | benchmark scores aggregated from SVD-filled task matrix | data/processed/intermediate/benchmark_from_task_aggregate_matrix.csv |
| model vs agent roles | benchmark-relative matrix aggregated from SVD-filled tasks | data/processed/intermediate/benchmark_from_task_aggregate_normalized_matrix.csv |
| benchmark predictability and similarity | benchmark-relative matrix aggregated from SVD-filled tasks | data/processed/intermediate/benchmark_from_task_aggregate_normalized_matrix.csv |
| terminus harness deltas | benchmark-relative matrix aggregated from SVD-filled tasks | data/processed/intermediate/benchmark_from_task_aggregate_normalized_matrix.csv |
| task similarity and representatives | SVD-filled task benchmark-relative matrix plus task quality metadata | data/processed/intermediate/task_svd_imputed_normalized_matrix.csv |
| HaborMix candidate selection | processed task item statistics | data/processed/intermediate/task_item_stats.csv |

Preprocessing diagnostics:

Task imputation method: each score column is robustly centered and scaled after `log1p` for nonnegative unbounded columns; task SVD rank is selected by held-out observed-cell cross-validation; missing task cells are filled by iterative low-rank SVD reconstruction; observed task cells are restored exactly; filled task scores are inverse-transformed and clipped to the observed range of that task. Benchmark scores are then calculated as per-benchmark means across those task scores. Task-level imputation remains less stable than dense benchmark tables because the task matrix is much wider and sparser, so task conclusions are restricted to reliable bounded non-degenerate tasks.

| matrix | preprocessing_method | missing_fraction_before_processing | selected_svd_rank | task_svd_rank_used_for_benchmark_aggregation | holdout_cells | holdout_rmse_scaled_score_space | holdout_mae_scaled_score_space |
| --- | --- | --- | --- | --- | --- | --- | --- |
| benchmark | task_svd_then_benchmark_aggregate | 0.243 |  | 2.000 | 0 |  |  |
| task | column_scaled_iterative_svd | 0.618 | 2.000 |  | 4325 | 10.401 | 0.881 |

## Research Question Coverage Checklist

| Question | Status | Main artifacts |
| --- | --- | --- |
| Agent vs model role overall and per benchmark | covered | `tables/benchmark_level/benchmark_variance_decomposition_filtered.csv`, `tables/benchmark_level/benchmark_model_agent_role_by_benchmark.csv`, `figures/benchmark_level/benchmark_model_vs_agent_role.png` |
| BenchPress-style benchmark predictability and hard-to-predict benchmarks/tasks | covered | `tables/benchmark_level/benchmark_uniqueness_filtered.csv`, `tables/task_level/task_predictability_ranked.csv`, benchmark/task predictability figures |
| Benchmark/task similarity and clustering | covered | `tables/benchmark_level/benchmark_similarity_clusters.csv`, `tables/task_level/task_cross_benchmark_similarity.csv`, clustered heatmaps |
| Representative tasks per benchmark | covered | `tables/task_level/task_representative_tasks.csv`, `figures/task_level/task_best_representatives.png` |
| Mini-leaderboards grouped by similar benchmarks | covered | `tables/leaderboards/benchmark_mini_leaderboards.csv`, `figures/leaderboards/mini_leaderboards_cluster_*.png` |
| Agent harness improvements over Terminus | covered | `tables/benchmark_level/benchmark_agent_lift_vs_terminus.csv`, `tables/benchmark_level/terminus_delta_by_model.csv`, Terminus heatmaps |
| Quantitative HaborMix task selection | covered | `tables/harbormix/harbormix_selected_tasks.csv`, `tables/harbormix/harbormix_selection_by_benchmark.csv`, `figures/harbormix/harbormix_selection_diagnostics.png` |

## Study 1: Coverage Filtering

**Method:** Benchmark-level claims use benchmark aggregates derived from the task-SVD matrix, but coverage filtering still uses evidence metadata: at least 15 agent+model rows need some observed task evidence for that benchmark, and the missingness fields describe coverage before task-SVD filling. This filter keeps the key analysis story from leaning too heavily on filled task values.

**Code files:**
- `src/habor_mix_analyzer/core/`
- `src/habor_mix_analyzer/preprocessing/svd_imputation.py`
- `src/habor_mix_analyzer/studies/coverage_filtering.py`
- `src/habor_mix_analyzer/studies/intermediate_tables.py`
- `src/habor_mix_analyzer/studies/model_agent_roles.py`
- `src/habor_mix_analyzer/studies/benchmark_predictability.py`
- `src/habor_mix_analyzer/studies/benchmark_similarity.py`
- `src/habor_mix_analyzer/studies/leaderboards.py`
- `src/habor_mix_analyzer/studies/terminus_comparison.py`
- `src/habor_mix_analyzer/studies/task_alignment.py`
- `src/habor_mix_analyzer/studies/task_selection.py`
- `src/habor_mix_analyzer/studies/task_similarity.py`
- `src/habor_mix_analyzer/studies/provenance.py`
- `src/habor_mix_analyzer/visualization/`
- `src/habor_mix_analyzer/reporting/key_analysis_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/key_analyses/tables/benchmark_level/benchmark_filtering.csv`

**Result overview and analysis:**
- Included 40 of 45 benchmarks.
- Excluded sparse benchmarks: quixbugs, skillsbench, hle, financeagent, ds-1000.
- Benchmark scores are task aggregates, not direct benchmark-SVD outputs; pre-aggregation benchmark missing fraction was 0.243.

| benchmark | include_in_key_analysis | observed_count | missing_fraction | task_cell_missing_fraction |
| --- | --- | --- | --- | --- |
| aider-polyglot | True | 26 | 0.000 | 0.044 |
| algotune | True | 26 | 0.000 | 0.131 |
| bfcl | True | 26 | 0.000 | 0.000 |
| bigcodebench | True | 26 | 0.000 | 0.559 |
| crustbench | True | 26 | 0.000 | 0.117 |
| featurebench-modal | True | 26 | 0.000 | 0.052 |
| gaia | True | 26 | 0.000 | 0.206 |
| lawbench | True | 26 | 0.000 | 0.409 |
| omnimath | True | 26 | 0.000 | 0.770 |
| seal0 | True | 26 | 0.000 | 0.002 |
| spider2 | True | 26 | 0.000 | 0.396 |
| swtbench | True | 26 | 0.000 | 0.494 |

**Insight and findings:** Sparse columns should stay in appendix/provisional analysis until more experiments land. The main key analysis story should use the coverage-filtered benchmark set.

## Study 2: Model vs Agent Roles

**Method:** I fit fixed-effect regressions in two views. The overall view decomposes benchmark-relative score into model, agent, benchmark, and interaction terms. The per-benchmark view fits each benchmark separately and compares partial R2 from model after controlling for agent against partial R2 from agent after controlling for model.

**Code files:**
- `src/habor_mix_analyzer/core/`
- `src/habor_mix_analyzer/preprocessing/svd_imputation.py`
- `src/habor_mix_analyzer/studies/coverage_filtering.py`
- `src/habor_mix_analyzer/studies/intermediate_tables.py`
- `src/habor_mix_analyzer/studies/model_agent_roles.py`
- `src/habor_mix_analyzer/studies/benchmark_predictability.py`
- `src/habor_mix_analyzer/studies/benchmark_similarity.py`
- `src/habor_mix_analyzer/studies/leaderboards.py`
- `src/habor_mix_analyzer/studies/terminus_comparison.py`
- `src/habor_mix_analyzer/studies/task_alignment.py`
- `src/habor_mix_analyzer/studies/task_selection.py`
- `src/habor_mix_analyzer/studies/task_similarity.py`
- `src/habor_mix_analyzer/studies/provenance.py`
- `src/habor_mix_analyzer/visualization/`
- `src/habor_mix_analyzer/reporting/key_analysis_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/key_analyses/tables/benchmark_level/benchmark_variance_decomposition_filtered.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_model_agent_role_by_benchmark.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_model_adjusted_effects.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_agent_adjusted_effects.csv`

![Benchmark-level variance attribution](../figures/benchmark_level/benchmark_variance_attribution.png)

![Per-benchmark model vs agent explanatory power](../figures/benchmark_level/benchmark_model_vs_agent_role.png)

![Model effects adjusted for agent and benchmark](../figures/benchmark_level/benchmark_model_adjusted_effects.png)

![Agent effects adjusted for model and benchmark](../figures/benchmark_level/benchmark_agent_adjusted_effects.png)

**Result overview and analysis:**
| component | partial_r2_over_other_main_effects | r2 | type |
| --- | --- | --- | --- |
| all_main_effects | 0.676 | 0.676 | combined |
| benchmark | 0.570 | 0.570 | main_effect |
| model:benchmark | 0.190 | 0.866 | interaction_increment |
| model | 0.089 | 0.101 | main_effect |
| agent:benchmark | 0.067 | 0.744 | interaction_increment |
| model:agent | 0.012 | 0.688 | interaction_increment |
| agent | 0.006 | 0.017 | main_effect |

Benchmarks with the largest model-vs-agent role imbalance:
| benchmark | model_partial_r2_over_agent | agent_partial_r2_over_model | dominant_dimension |
| --- | --- | --- | --- |
| kumo | 0.856 | 0.037 | model |
| sldbench | 0.826 | 0.013 | model |
| aider-polyglot | 0.841 | 0.031 | model |
| qcircuitbench | 0.824 | 0.025 | model |
| livecodebench | 0.798 | 0.014 | model |
| strongreject | 0.897 | 0.144 | model |
| algotune | 0.776 | 0.026 | model |
| swe-lancer | 0.751 | 0.015 | model |
| crustbench | 0.732 | 0.016 | model |
| bfcl | 0.732 | 0.022 | model |

**Insight and findings:** Model identity explains much more overall variation than agent identity, but the role varies by benchmark. Agent effects are more useful as benchmark-specific harnessing effects than as a universal main effect.

## Study 3: Agent+Model Leaderboards

**Method:** I keep `agent+model` rankings as descriptive mini-leaderboards. Per-benchmark mini-leaderboards use benchmark scores aggregated from SVD-filled tasks on each benchmark's original metric scale. Each mini-leaderboard shows all available agent+model rows, grouped by model with colored bars for agents, so the same plot makes model differences and agent harness differences visible. The aggregate top-agent plot uses mean within-benchmark score percentile, because averaging scores across benchmarks with different scales would be misleading.

**Code files:**
- `src/habor_mix_analyzer/core/`
- `src/habor_mix_analyzer/preprocessing/svd_imputation.py`
- `src/habor_mix_analyzer/studies/coverage_filtering.py`
- `src/habor_mix_analyzer/studies/intermediate_tables.py`
- `src/habor_mix_analyzer/studies/model_agent_roles.py`
- `src/habor_mix_analyzer/studies/benchmark_predictability.py`
- `src/habor_mix_analyzer/studies/benchmark_similarity.py`
- `src/habor_mix_analyzer/studies/leaderboards.py`
- `src/habor_mix_analyzer/studies/terminus_comparison.py`
- `src/habor_mix_analyzer/studies/task_alignment.py`
- `src/habor_mix_analyzer/studies/task_selection.py`
- `src/habor_mix_analyzer/studies/task_similarity.py`
- `src/habor_mix_analyzer/studies/provenance.py`
- `src/habor_mix_analyzer/visualization/`
- `src/habor_mix_analyzer/reporting/key_analysis_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/key_analyses/tables/leaderboards/benchmark_agent_model_scores.csv`
- `output/key_analyses/tables/leaderboards/benchmark_scores_long.csv`
- `output/key_analyses/tables/leaderboards/benchmark_mini_leaderboards.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_similarity_clusters.csv`
- `output/key_analyses/figures/leaderboards/mini_leaderboards_cluster_*.png`

![Top agent+model pairs on included benchmarks](../figures/leaderboards/benchmark_agent_model_top_scores.png)

![Mini-leaderboards leaderboards/mini_leaderboard_medagentbench.png](../figures/leaderboards/mini_leaderboard_medagentbench.png)
![Mini-leaderboards leaderboards/mini_leaderboard_mmau.png](../figures/leaderboards/mini_leaderboard_mmau.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_1_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_1_page_1.png)
![Mini-leaderboards leaderboards/mini_leaderboard_ineqmath.png](../figures/leaderboards/mini_leaderboard_ineqmath.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_2_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_2_page_1.png)
![Mini-leaderboards leaderboards/mini_leaderboard_compilebench.png](../figures/leaderboards/mini_leaderboard_compilebench.png)
![Mini-leaderboards leaderboards/mini_leaderboard_swtbench.png](../figures/leaderboards/mini_leaderboard_swtbench.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_3_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_3_page_1.png)
![Mini-leaderboards leaderboards/mini_leaderboard_aider-polyglot.png](../figures/leaderboards/mini_leaderboard_aider-polyglot.png)
![Mini-leaderboards leaderboards/mini_leaderboard_aime.png](../figures/leaderboards/mini_leaderboard_aime.png)
![Mini-leaderboards leaderboards/mini_leaderboard_algotune.png](../figures/leaderboards/mini_leaderboard_algotune.png)
![Mini-leaderboards leaderboards/mini_leaderboard_arc-agi-2.png](../figures/leaderboards/mini_leaderboard_arc-agi-2.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_4_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_1.png)
![Mini-leaderboards leaderboards/mini_leaderboard_bixbench.png](../figures/leaderboards/mini_leaderboard_bixbench.png)
![Mini-leaderboards leaderboards/mini_leaderboard_crustbench.png](../figures/leaderboards/mini_leaderboard_crustbench.png)
![Mini-leaderboards leaderboards/mini_leaderboard_featurebench-modal.png](../figures/leaderboards/mini_leaderboard_featurebench-modal.png)
![Mini-leaderboards leaderboards/mini_leaderboard_gaia.png](../figures/leaderboards/mini_leaderboard_gaia.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_4_page_2.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_2.png)
![Mini-leaderboards leaderboards/mini_leaderboard_gpqa-diamond.png](../figures/leaderboards/mini_leaderboard_gpqa-diamond.png)
![Mini-leaderboards leaderboards/mini_leaderboard_gso.png](../figures/leaderboards/mini_leaderboard_gso.png)
![Mini-leaderboards leaderboards/mini_leaderboard_humanevalfix.png](../figures/leaderboards/mini_leaderboard_humanevalfix.png)
![Mini-leaderboards leaderboards/mini_leaderboard_kumo.png](../figures/leaderboards/mini_leaderboard_kumo.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_4_page_3.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_3.png)
![Mini-leaderboards leaderboards/mini_leaderboard_labbench.png](../figures/leaderboards/mini_leaderboard_labbench.png)
![Mini-leaderboards leaderboards/mini_leaderboard_lawbench.png](../figures/leaderboards/mini_leaderboard_lawbench.png)
![Mini-leaderboards leaderboards/mini_leaderboard_livecodebench.png](../figures/leaderboards/mini_leaderboard_livecodebench.png)
![Mini-leaderboards leaderboards/mini_leaderboard_mmmlu.png](../figures/leaderboards/mini_leaderboard_mmmlu.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_4_page_4.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_4.png)
![Mini-leaderboards leaderboards/mini_leaderboard_omnimath.png](../figures/leaderboards/mini_leaderboard_omnimath.png)
![Mini-leaderboards leaderboards/mini_leaderboard_qcircuitbench.png](../figures/leaderboards/mini_leaderboard_qcircuitbench.png)
![Mini-leaderboards leaderboards/mini_leaderboard_reasoning-gym.png](../figures/leaderboards/mini_leaderboard_reasoning-gym.png)
![Mini-leaderboards leaderboards/mini_leaderboard_replicationbench.png](../figures/leaderboards/mini_leaderboard_replicationbench.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_4_page_5.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_5.png)
![Mini-leaderboards leaderboards/mini_leaderboard_seal0.png](../figures/leaderboards/mini_leaderboard_seal0.png)
![Mini-leaderboards leaderboards/mini_leaderboard_simpleqa.png](../figures/leaderboards/mini_leaderboard_simpleqa.png)
![Mini-leaderboards leaderboards/mini_leaderboard_sldbench.png](../figures/leaderboards/mini_leaderboard_sldbench.png)
![Mini-leaderboards leaderboards/mini_leaderboard_spider2.png](../figures/leaderboards/mini_leaderboard_spider2.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_4_page_6.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_6.png)
![Mini-leaderboards leaderboards/mini_leaderboard_swe-lancer.png](../figures/leaderboards/mini_leaderboard_swe-lancer.png)
![Mini-leaderboards leaderboards/mini_leaderboard_swebench-multilingual.png](../figures/leaderboards/mini_leaderboard_swebench-multilingual.png)
![Mini-leaderboards leaderboards/mini_leaderboard_swebenchpro.png](../figures/leaderboards/mini_leaderboard_swebenchpro.png)
![Mini-leaderboards leaderboards/mini_leaderboard_usaco.png](../figures/leaderboards/mini_leaderboard_usaco.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_4_page_7.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_7.png)
![Mini-leaderboards leaderboards/mini_leaderboard_bfcl.png](../figures/leaderboards/mini_leaderboard_bfcl.png)
![Mini-leaderboards leaderboards/mini_leaderboard_bigcodebench.png](../figures/leaderboards/mini_leaderboard_bigcodebench.png)
![Mini-leaderboards leaderboards/mini_leaderboard_codepde.png](../figures/leaderboards/mini_leaderboard_codepde.png)
![Mini-leaderboards leaderboards/mini_leaderboard_devopsgym.png](../figures/leaderboards/mini_leaderboard_devopsgym.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_5_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_5_page_1.png)
![Mini-leaderboards leaderboards/mini_leaderboard_swebench-verified.png](../figures/leaderboards/mini_leaderboard_swebench-verified.png)
![Mini-leaderboards leaderboards/mini_leaderboard_swesmith.png](../figures/leaderboards/mini_leaderboard_swesmith.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_5_page_2.png](../figures/leaderboards/mini_leaderboards_cluster_5_page_2.png)
![Mini-leaderboards leaderboards/mini_leaderboard_strongreject.png](../figures/leaderboards/mini_leaderboard_strongreject.png)
![Mini-leaderboards leaderboards/mini_leaderboards_cluster_6_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_6_page_1.png)

**Result overview and analysis:**
| rank | agent_model | mean_score_percentile_across_benchmarks | original_benchmark_table_coverage |
| --- | --- | --- | --- |
| 1 | terminus-2 + gemini-3.1-pro-preview | 0.834 | 0.450 |
| 2 | gemini-cli + gemini-3.1-pro-preview | 0.825 | 0.450 |
| 3 | codex + gpt-5.4 | 0.792 | 0.500 |
| 4 | claude-code + claude-sonnet-4-6 | 0.754 | 0.050 |
| 5 | terminus-2 + gemini-3-flash-preview | 0.652 | 0.500 |
| 6 | terminus-2 + claude-opus-4-6 | 0.622 | 0.075 |
| 7 | gemini-cli + gemini-3-flash-preview | 0.615 | 0.425 |
| 8 | claude-code + claude-opus-4-6 | 0.606 | 0.050 |
| 9 | terminus-2 + kimi-k2.5 | 0.598 | 0.400 |
| 10 | terminus-2 + claude-sonnet-4-6 | 0.588 | 0.075 |

**Insight and findings:** Benchmark scores should be read benchmark by benchmark. The percentile aggregate is a compact descriptive ranking only; it is not a causal agent claim because model and agent are entangled in the row identity.

## Study 4: Benchmark Predictability and Similarity

**Method:** Following the BenchPress idea, each included benchmark is predicted from the other included benchmarks using ridge regression with cross-validation over agent+model rows. Low or negative R2 means the benchmark is hard to reconstruct from the rest and likely contributes distinct information. Benchmark similarity uses Spearman correlation of agent+model score profiles and hierarchical clustering.

**Code files:**
- `src/habor_mix_analyzer/core/`
- `src/habor_mix_analyzer/preprocessing/svd_imputation.py`
- `src/habor_mix_analyzer/studies/coverage_filtering.py`
- `src/habor_mix_analyzer/studies/intermediate_tables.py`
- `src/habor_mix_analyzer/studies/model_agent_roles.py`
- `src/habor_mix_analyzer/studies/benchmark_predictability.py`
- `src/habor_mix_analyzer/studies/benchmark_similarity.py`
- `src/habor_mix_analyzer/studies/leaderboards.py`
- `src/habor_mix_analyzer/studies/terminus_comparison.py`
- `src/habor_mix_analyzer/studies/task_alignment.py`
- `src/habor_mix_analyzer/studies/task_selection.py`
- `src/habor_mix_analyzer/studies/task_similarity.py`
- `src/habor_mix_analyzer/studies/provenance.py`
- `src/habor_mix_analyzer/visualization/`
- `src/habor_mix_analyzer/reporting/key_analysis_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/key_analyses/tables/benchmark_level/benchmark_uniqueness_filtered.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_redundancy_pairs_filtered.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_correlation_clustered.csv`

![Benchmark uniqueness after coverage filtering](../figures/benchmark_level/benchmark_uniqueness_vs_coverage.png)

![Clustered benchmark similarity heatmap](../figures/benchmark_level/benchmark_similarity_clustered_heatmap.png)

**Result overview and analysis:**
Hardest-to-predict benchmarks:
| benchmark | cv_r2_from_other_included_benchmarks | cv_rmse |
| --- | --- | --- |
| strongreject | -0.957 | 1.648 |
| codepde | -0.601 | 0.169 |
| bfcl | -0.462 | 0.919 |
| mmau | -0.338 | 0.315 |
| bigcodebench | -0.305 | 0.633 |
| swtbench | -0.288 | 0.367 |
| humanevalfix | -0.282 | 1.173 |
| swebench-verified | -0.218 | 2.271 |
| swebench-multilingual | -0.214 | 0.824 |
| compilebench | -0.078 | 0.924 |

Most similar benchmark pairs:
| left | right | spearman |
| --- | --- | --- |
| labbench | livecodebench | 0.869 |
| featurebench-modal | spider2 | 0.858 |
| replicationbench | gso | 0.845 |
| algotune | gso | 0.841 |
| arc-agi-2 | replicationbench | 0.831 |
| seal0 | arc-agi-2 | 0.808 |
| crustbench | arc-agi-2 | 0.804 |
| algotune | swebenchpro | 0.794 |
| swebenchpro | gso | 0.790 |
| lawbench | spider2 | 0.787 |

**Insight and findings:** Predictable benchmarks are candidates for compression; hard-to-predict benchmarks should be preserved when the goal is behavioral breadth. Similarity clusters are also the basis for the grouped mini-leaderboards.

## Study 5: Task Similarity, Predictability, and Representatives

**Method:** Task-level analysis uses reliable, bounded, non-degenerate tasks only. A task is hard to predict when its maximum absolute Spearman correlation to peer tasks in the same benchmark is low. Representativeness is no longer pure correlation with the benchmark aggregate: I compute a leave-one-out aggregate correlation and multiply it by observed cross-agent/model variance, so redundant but low-discrimination tasks no longer dominate. Within- and cross-benchmark task similarity use median absolute task-profile correlations. Difficulty tiers use mean task score thresholds: frontier <5%, hard 5-30%, medium 30-70%, easy 70-95%, saturated >95%.

**Code files:**
- `src/habor_mix_analyzer/core/`
- `src/habor_mix_analyzer/preprocessing/svd_imputation.py`
- `src/habor_mix_analyzer/studies/coverage_filtering.py`
- `src/habor_mix_analyzer/studies/intermediate_tables.py`
- `src/habor_mix_analyzer/studies/model_agent_roles.py`
- `src/habor_mix_analyzer/studies/benchmark_predictability.py`
- `src/habor_mix_analyzer/studies/benchmark_similarity.py`
- `src/habor_mix_analyzer/studies/leaderboards.py`
- `src/habor_mix_analyzer/studies/terminus_comparison.py`
- `src/habor_mix_analyzer/studies/task_alignment.py`
- `src/habor_mix_analyzer/studies/task_selection.py`
- `src/habor_mix_analyzer/studies/task_similarity.py`
- `src/habor_mix_analyzer/studies/provenance.py`
- `src/habor_mix_analyzer/visualization/`
- `src/habor_mix_analyzer/reporting/key_analysis_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/key_analyses/tables/task_level/task_predictability_ranked.csv`
- `output/key_analyses/tables/task_level/task_representative_tasks.csv`
- `output/key_analyses/tables/task_level/task_within_benchmark_similarity.csv`
- `output/key_analyses/tables/task_level/task_cross_benchmark_similarity.csv`

![Hard-to-predict reliable tasks](../figures/task_level/task_hard_to_predict_ranked.png)

![Best representative task per benchmark](../figures/task_level/task_best_representatives.png)

![Task similarity across benchmark pairs](../figures/task_level/task_similarity_benchmark_pair_heatmap.png)

**Result overview and analysis:**
Hardest-to-predict reliable tasks:
| benchmark | task_id | task_unpredictability_score | difficulty_tier | task_score |
| --- | --- | --- | --- | --- |
| humanevalfix | humanevalfix-python-6 | 0.915 | saturated | 0.962 |
| devopsgym | devopsgym-codegen__prometheus__prometheus-7667 | 0.891 | easy | 0.786 |
| gso | gso-pydantic--pydantic-addf1f9 | 0.811 | frontier | 0.021 |
| strongreject | strongreject_sexual_content_0005_pap_logical_appeal | 0.751 | saturated | 0.976 |
| devopsgym | devopsgym-testgen__spotbugs__spotbugs-2795 | 0.706 | medium | 0.670 |
| devopsgym | devopsgym-codegen__containerd__containerd-10275 | 0.706 | frontier | 0.038 |
| gaia | gaia-08f3a05f-5947-4089-a4c4-d4bcfaa6b7a0 | 0.691 | easy | 0.777 |
| swebench-verified | swebench-verified-matplotlib__matplotlib-26208 | 0.678 | frontier | 0.035 |
| gso | gso-huggingface--transformers-253f9a3 | 0.659 | medium | 0.602 |
| qcircuitbench | qcircuitbench-universal_2-n9 | 0.654 | frontier | 0.018 |
| swe-lancer | swe-lancer-43022-manager-0 | 0.632 | hard | 0.102 |
| bfcl | bfcl-live-multiple-83-38-0 | 0.630 | easy | 0.762 |

Most representative tasks:
| benchmark | task_id | useful_representativeness_score | representativeness_score | difficulty_tier | task_score |
| --- | --- | --- | --- | --- | --- |
| labbench | labbench-figqa-0036 | 0.443 | 0.944 | hard | 0.228 |
| swebench-multilingual | swebench-multilingual-jqlang__jq-2658 | 0.441 | 0.957 | easy | 0.844 |
| swebench-multilingual | swebench-multilingual-php-cs-fixer__php-cs-fixer-7523 | 0.441 | 0.957 | easy | 0.844 |
| swebench-multilingual | swebench-multilingual-caddyserver__caddy-6288 | 0.441 | 0.957 | easy | 0.843 |
| swebench-multilingual | swebench-multilingual-fmtlib__fmt-3729 | 0.441 | 0.957 | easy | 0.843 |
| lawbench | lawbench-3-7-11-zero-shot | 0.437 | 0.969 | easy | 0.739 |
| labbench | labbench-figqa-0128 | 0.436 | 0.938 | medium | 0.357 |
| swebench-multilingual | swebench-multilingual-jqlang__jq-2919 | 0.432 | 0.957 | easy | 0.844 |
| swebench-multilingual | swebench-multilingual-tokio-rs__tokio-7139 | 0.432 | 0.957 | easy | 0.844 |
| swebench-multilingual | swebench-multilingual-rubocop__rubocop-13375 | 0.432 | 0.957 | easy | 0.844 |
| swebench-multilingual | swebench-multilingual-php-cs-fixer__php-cs-fixer-8256 | 0.432 | 0.957 | easy | 0.844 |
| swebench-multilingual | swebench-multilingual-gin-gonic__gin-1805 | 0.432 | 0.957 | easy | 0.843 |

Benchmarks with strongest within-benchmark task similarity:
| benchmark | n_reliable_tasks | median_abs_task_similarity_within_benchmark |
| --- | --- | --- |
| arc-agi-2 | 94 | 0.859 |
| lawbench | 180 | 0.837 |
| usaco | 91 | 0.660 |
| swebench-verified | 9 | 0.615 |
| simpleqa | 200 | 0.599 |
| labbench | 180 | 0.542 |
| replicationbench | 78 | 0.538 |
| compilebench | 2 | 0.525 |
| ineqmath | 21 | 0.512 |
| medagentbench | 71 | 0.507 |

**Insight and findings:** Task predictability and useful representativeness are different objectives. Representative tasks are the base set for predicting benchmark aggregates; hard-to-predict and difficult tasks are additional stress tests for broad coverage.

## Study 6: Terminus Harnessing Effects

**Method:** Terminus is treated as the fair baseline across models. For every model with both `terminus-2` and another agent row, I compute paired benchmark-relative score deltas while holding the model fixed.

**Code files:**
- `src/habor_mix_analyzer/core/`
- `src/habor_mix_analyzer/preprocessing/svd_imputation.py`
- `src/habor_mix_analyzer/studies/coverage_filtering.py`
- `src/habor_mix_analyzer/studies/intermediate_tables.py`
- `src/habor_mix_analyzer/studies/model_agent_roles.py`
- `src/habor_mix_analyzer/studies/benchmark_predictability.py`
- `src/habor_mix_analyzer/studies/benchmark_similarity.py`
- `src/habor_mix_analyzer/studies/leaderboards.py`
- `src/habor_mix_analyzer/studies/terminus_comparison.py`
- `src/habor_mix_analyzer/studies/task_alignment.py`
- `src/habor_mix_analyzer/studies/task_selection.py`
- `src/habor_mix_analyzer/studies/task_similarity.py`
- `src/habor_mix_analyzer/studies/provenance.py`
- `src/habor_mix_analyzer/visualization/`
- `src/habor_mix_analyzer/reporting/key_analysis_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/key_analyses/tables/benchmark_level/benchmark_agent_lift_vs_terminus.csv`
- `output/key_analyses/tables/benchmark_level/terminus_delta_by_model.csv`
- `output/intermediate_studies/benchmark_level/benchmark_agent_lift_by_benchmark.csv`

![Agent lift vs terminus by benchmark](../figures/benchmark_level/benchmark_agent_lift_heatmap.png)

![Agent lift vs terminus by model](../figures/benchmark_level/terminus_delta_by_model_heatmap.png)

**Result overview and analysis:**
| agent | mean_delta_vs_terminus | win_rate_vs_terminus | compared_models |
| --- | --- | --- | --- |
| codex | 0.358 | 0.617 | 3 |
| gemini-cli | 0.130 | 0.537 | 2 |
| claude-code | -0.123 | 0.450 | 7 |

| model | agent | mean_delta_vs_terminus | win_rate_vs_terminus |
| --- | --- | --- | --- |
| gpt-5.4 | codex | 0.624 | 0.750 |
| gpt-5-mini | codex | 0.546 | 0.750 |
| claude-sonnet-4-6 | claude-code | 0.531 | 0.700 |
| gemini-3.1-pro-preview | gemini-cli | 0.172 | 0.525 |
| gemini-3-flash-preview | gemini-cli | 0.088 | 0.550 |
| claude-haiku-4-5-20251001 | claude-code | 0.064 | 0.675 |
| claude-opus-4-6 | claude-code | -0.002 | 0.400 |
| gpt-5-nano | codex | -0.096 | 0.350 |
| MiniMax-M2.5 | claude-code | -0.162 | 0.475 |
| kimi-k2.5 | claude-code | -0.300 | 0.225 |
| mimo-v2-pro | claude-code | -0.426 | 0.325 |
| glm-5 | claude-code | -0.565 | 0.350 |

**Insight and findings:** Paired deltas are the best current evidence for whether an agent harness improves over Terminus. The deltas vary by model and benchmark, so claims should avoid saying one harness universally dominates.

## Study 7: HaborMix Selection

**Method:** Candidate tasks must be reliable and bounded. The final HaborMix selection targets a compact 100-200 task set, currently 160 tasks. It first includes a small base set of useful representative tasks per benchmark, then fills the remaining slots with a diversity-aware ranking over difficult, frontier-with-variance, unique/unpredictable, and high-composite tasks. The composite score combines useful representativeness, difficulty, unique/unpredictable signal, and cross-agent/model discrimination; it no longer excludes frontier or saturated items by construction. The broader scored pool is retained under intermediate studies for auditability.

**Code files:**
- `src/habor_mix_analyzer/core/`
- `src/habor_mix_analyzer/preprocessing/svd_imputation.py`
- `src/habor_mix_analyzer/studies/coverage_filtering.py`
- `src/habor_mix_analyzer/studies/intermediate_tables.py`
- `src/habor_mix_analyzer/studies/model_agent_roles.py`
- `src/habor_mix_analyzer/studies/benchmark_predictability.py`
- `src/habor_mix_analyzer/studies/benchmark_similarity.py`
- `src/habor_mix_analyzer/studies/leaderboards.py`
- `src/habor_mix_analyzer/studies/terminus_comparison.py`
- `src/habor_mix_analyzer/studies/task_alignment.py`
- `src/habor_mix_analyzer/studies/task_selection.py`
- `src/habor_mix_analyzer/studies/task_similarity.py`
- `src/habor_mix_analyzer/studies/provenance.py`
- `src/habor_mix_analyzer/visualization/`
- `src/habor_mix_analyzer/reporting/key_analysis_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/key_analyses/tables/harbormix/harbormix_selected_tasks.csv`
- `output/key_analyses/tables/harbormix/harbormix_selection_by_benchmark.csv`
- `output/intermediate_studies/task_level/harbormix_scored_task_pool.csv`
- `output/intermediate_studies/task_level/task_frontier_or_saturated_watchlist.csv`

![HaborMix selection diagnostics](../figures/harbormix/harbormix_selection_diagnostics.png)

![Reliable bounded task difficulty composition](../figures/task_level/task_reliable_difficulty_composition.png)

![Reliable bounded task difficulty composition by percentage](../figures/task_level/task_reliable_difficulty_composition_percent.png)

**Result overview and analysis:**
| benchmark | difficulty_tier | selected_tasks | mean_selection_score | mean_representative_signal | mean_unique_unpredictable_signal | mean_difficulty_signal |
| --- | --- | --- | --- | --- | --- | --- |
| aider-polyglot | medium | 5 | 0.740 | 0.888 | 0.656 | 0.535 |
| arc-agi-2 | hard | 4 | 0.799 | 0.949 | 0.533 | 0.770 |
| livecodebench | medium | 4 | 0.789 | 0.860 | 0.860 | 0.532 |
| replicationbench | hard | 4 | 0.750 | 0.894 | 0.436 | 0.766 |
| humanevalfix | easy | 4 | 0.690 | 0.929 | 0.814 | 0.083 |
| featurebench-modal | medium | 3 | 0.813 | 0.954 | 0.716 | 0.623 |
| algotune | hard | 3 | 0.790 | 0.754 | 0.783 | 0.772 |
| gpqa-diamond | medium | 3 | 0.786 | 0.837 | 0.901 | 0.519 |
| mmmlu | hard | 3 | 0.767 | 0.672 | 0.846 | 0.785 |
| spider2 | medium | 3 | 0.762 | 0.938 | 0.656 | 0.555 |
| bixbench | medium | 3 | 0.748 | 0.956 | 0.640 | 0.467 |
| omnimath | medium | 3 | 0.726 | 0.860 | 0.772 | 0.475 |
| medagentbench | medium | 3 | 0.714 | 0.911 | 0.655 | 0.391 |
| labbench | hard | 3 | 0.711 | 0.854 | 0.344 | 0.794 |

- Selected 160 final HaborMix tasks from the broader scored candidate pool.

**Insight and findings:** HaborMix selection is quantitative and auditable: representative tasks anchor the minimal benchmark-prediction base, while difficult and unique/unpredictable tasks add breadth.

## Study 8: Task Aggregate vs Benchmark-Level Score Alignment

**Method:** For each benchmark, I average benchmark-relative task scores and correlate that aggregate with the benchmark-level benchmark-relative score across agent+model rows. This is intentionally diagnostic rather than a hard gate: the new benchmark score is already the task aggregate, so this table mainly identifies benchmarks where reliable bounded tasks alone do or do not track the full task-derived benchmark aggregate.

**Code files:**
- `src/habor_mix_analyzer/core/`
- `src/habor_mix_analyzer/preprocessing/svd_imputation.py`
- `src/habor_mix_analyzer/studies/coverage_filtering.py`
- `src/habor_mix_analyzer/studies/intermediate_tables.py`
- `src/habor_mix_analyzer/studies/model_agent_roles.py`
- `src/habor_mix_analyzer/studies/benchmark_predictability.py`
- `src/habor_mix_analyzer/studies/benchmark_similarity.py`
- `src/habor_mix_analyzer/studies/leaderboards.py`
- `src/habor_mix_analyzer/studies/terminus_comparison.py`
- `src/habor_mix_analyzer/studies/task_alignment.py`
- `src/habor_mix_analyzer/studies/task_selection.py`
- `src/habor_mix_analyzer/studies/task_similarity.py`
- `src/habor_mix_analyzer/studies/provenance.py`
- `src/habor_mix_analyzer/visualization/`
- `src/habor_mix_analyzer/reporting/key_analysis_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/key_analyses/tables/task_level/task_to_benchmark_alignment.csv`

![Task aggregate vs benchmark score alignment](../figures/task_level/task_to_benchmark_alignment.png)

**Result overview and analysis:**
| benchmark | n_reliable_bounded_tasks | spearman_agent_model_correlation | alignment_quality |
| --- | --- | --- | --- |
| qcircuitbench | 3 | 0.997 | strong |
| aider-polyglot | 218 | 0.996 | strong |
| simpleqa | 200 | 0.991 | strong |
| usaco | 91 | 0.990 | strong |
| swebench-verified | 10 | 0.986 | strong |
| gpqa-diamond | 198 | 0.985 | strong |
| labbench | 181 | 0.984 | strong |
| swebench-multilingual | 270 | 0.983 | strong |
| seal0 | 111 | 0.982 | strong |
| lawbench | 181 | 0.981 | strong |
| crustbench | 100 | 0.978 | strong |
| arc-agi-2 | 100 | 0.970 | strong |

**Insight and findings:** Strong alignment means the reliable bounded subset is a good proxy for the task-derived benchmark score. Weak alignment is not used to remove benchmarks automatically; it flags cases for manual benchmark/task inspection.

## Cross-Study Story

The emerging story is that benchmark diversity matters more than a single aggregate leaderboard. Coverage filtering removes sparse columns from the main benchmark-level claims. Within the retained benchmarks, model identity is usually more explanatory than agent identity, but agent effects vary sharply by model and benchmark. BenchPress-style predictability analysis finds benchmarks that are redundant enough to compress and benchmarks that add distinct signal. The task-level layer then answers a different question: which items are representative, which are hard to predict, and which form a balanced HaborMix candidate set. Terminus paired deltas are the fairest current way to talk about harness improvement.

## Artifact Index

All key analysis tables:
- `output/key_analyses/tables/benchmark_level/benchmark_agent_adjusted_effects.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_agent_lift_vs_terminus.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_correlation_clustered.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_filtering.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_model_adjusted_effects.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_model_agent_role_by_benchmark.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_redundancy_pairs_filtered.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_similarity_clusters.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_uniqueness_filtered.csv`
- `output/key_analyses/tables/benchmark_level/benchmark_variance_decomposition_filtered.csv`
- `output/key_analyses/tables/benchmark_level/terminus_delta_by_model.csv`
- `output/key_analyses/tables/harbormix/harbormix_selected_tasks.csv`
- `output/key_analyses/tables/harbormix/harbormix_selection_by_benchmark.csv`
- `output/key_analyses/tables/leaderboards/benchmark_agent_model_scores.csv`
- `output/key_analyses/tables/leaderboards/benchmark_mini_leaderboards.csv`
- `output/key_analyses/tables/leaderboards/benchmark_scores_long.csv`
- `output/key_analyses/tables/provenance/analysis_data_provenance.csv`
- `output/key_analyses/tables/provenance/imputation_diagnostics_summary.csv`
- `output/key_analyses/tables/task_level/task_benchmark_reliable_summary.csv`
- `output/key_analyses/tables/task_level/task_cross_benchmark_similarity.csv`
- `output/key_analyses/tables/task_level/task_predictability_ranked.csv`
- `output/key_analyses/tables/task_level/task_representative_tasks.csv`
- `output/key_analyses/tables/task_level/task_to_benchmark_alignment.csv`
- `output/key_analyses/tables/task_level/task_within_benchmark_similarity.csv`

All key analysis figures:
![benchmark_level/benchmark_agent_adjusted_effects.png](../figures/benchmark_level/benchmark_agent_adjusted_effects.png)
![benchmark_level/benchmark_agent_lift_heatmap.png](../figures/benchmark_level/benchmark_agent_lift_heatmap.png)
![benchmark_level/benchmark_model_adjusted_effects.png](../figures/benchmark_level/benchmark_model_adjusted_effects.png)
![benchmark_level/benchmark_model_vs_agent_role.png](../figures/benchmark_level/benchmark_model_vs_agent_role.png)
![benchmark_level/benchmark_similarity_clustered_heatmap.png](../figures/benchmark_level/benchmark_similarity_clustered_heatmap.png)
![benchmark_level/benchmark_uniqueness_vs_coverage.png](../figures/benchmark_level/benchmark_uniqueness_vs_coverage.png)
![benchmark_level/benchmark_variance_attribution.png](../figures/benchmark_level/benchmark_variance_attribution.png)
![benchmark_level/terminus_delta_by_model_heatmap.png](../figures/benchmark_level/terminus_delta_by_model_heatmap.png)
![harbormix/harbormix_selection_diagnostics.png](../figures/harbormix/harbormix_selection_diagnostics.png)
![leaderboards/benchmark_agent_model_top_scores.png](../figures/leaderboards/benchmark_agent_model_top_scores.png)
![leaderboards/mini_leaderboard_aider-polyglot.png](../figures/leaderboards/mini_leaderboard_aider-polyglot.png)
![leaderboards/mini_leaderboard_aime.png](../figures/leaderboards/mini_leaderboard_aime.png)
![leaderboards/mini_leaderboard_algotune.png](../figures/leaderboards/mini_leaderboard_algotune.png)
![leaderboards/mini_leaderboard_arc-agi-2.png](../figures/leaderboards/mini_leaderboard_arc-agi-2.png)
![leaderboards/mini_leaderboard_bfcl.png](../figures/leaderboards/mini_leaderboard_bfcl.png)
![leaderboards/mini_leaderboard_bigcodebench.png](../figures/leaderboards/mini_leaderboard_bigcodebench.png)
![leaderboards/mini_leaderboard_bixbench.png](../figures/leaderboards/mini_leaderboard_bixbench.png)
![leaderboards/mini_leaderboard_codepde.png](../figures/leaderboards/mini_leaderboard_codepde.png)
![leaderboards/mini_leaderboard_compilebench.png](../figures/leaderboards/mini_leaderboard_compilebench.png)
![leaderboards/mini_leaderboard_crustbench.png](../figures/leaderboards/mini_leaderboard_crustbench.png)
![leaderboards/mini_leaderboard_devopsgym.png](../figures/leaderboards/mini_leaderboard_devopsgym.png)
![leaderboards/mini_leaderboard_featurebench-modal.png](../figures/leaderboards/mini_leaderboard_featurebench-modal.png)
![leaderboards/mini_leaderboard_gaia.png](../figures/leaderboards/mini_leaderboard_gaia.png)
![leaderboards/mini_leaderboard_gpqa-diamond.png](../figures/leaderboards/mini_leaderboard_gpqa-diamond.png)
![leaderboards/mini_leaderboard_gso.png](../figures/leaderboards/mini_leaderboard_gso.png)
![leaderboards/mini_leaderboard_humanevalfix.png](../figures/leaderboards/mini_leaderboard_humanevalfix.png)
![leaderboards/mini_leaderboard_ineqmath.png](../figures/leaderboards/mini_leaderboard_ineqmath.png)
![leaderboards/mini_leaderboard_kumo.png](../figures/leaderboards/mini_leaderboard_kumo.png)
![leaderboards/mini_leaderboard_labbench.png](../figures/leaderboards/mini_leaderboard_labbench.png)
![leaderboards/mini_leaderboard_lawbench.png](../figures/leaderboards/mini_leaderboard_lawbench.png)
![leaderboards/mini_leaderboard_livecodebench.png](../figures/leaderboards/mini_leaderboard_livecodebench.png)
![leaderboards/mini_leaderboard_medagentbench.png](../figures/leaderboards/mini_leaderboard_medagentbench.png)
![leaderboards/mini_leaderboard_mmau.png](../figures/leaderboards/mini_leaderboard_mmau.png)
![leaderboards/mini_leaderboard_mmmlu.png](../figures/leaderboards/mini_leaderboard_mmmlu.png)
![leaderboards/mini_leaderboard_omnimath.png](../figures/leaderboards/mini_leaderboard_omnimath.png)
![leaderboards/mini_leaderboard_qcircuitbench.png](../figures/leaderboards/mini_leaderboard_qcircuitbench.png)
![leaderboards/mini_leaderboard_reasoning-gym.png](../figures/leaderboards/mini_leaderboard_reasoning-gym.png)
![leaderboards/mini_leaderboard_replicationbench.png](../figures/leaderboards/mini_leaderboard_replicationbench.png)
![leaderboards/mini_leaderboard_seal0.png](../figures/leaderboards/mini_leaderboard_seal0.png)
![leaderboards/mini_leaderboard_simpleqa.png](../figures/leaderboards/mini_leaderboard_simpleqa.png)
![leaderboards/mini_leaderboard_sldbench.png](../figures/leaderboards/mini_leaderboard_sldbench.png)
![leaderboards/mini_leaderboard_spider2.png](../figures/leaderboards/mini_leaderboard_spider2.png)
![leaderboards/mini_leaderboard_strongreject.png](../figures/leaderboards/mini_leaderboard_strongreject.png)
![leaderboards/mini_leaderboard_swe-lancer.png](../figures/leaderboards/mini_leaderboard_swe-lancer.png)
![leaderboards/mini_leaderboard_swebench-multilingual.png](../figures/leaderboards/mini_leaderboard_swebench-multilingual.png)
![leaderboards/mini_leaderboard_swebench-verified.png](../figures/leaderboards/mini_leaderboard_swebench-verified.png)
![leaderboards/mini_leaderboard_swebenchpro.png](../figures/leaderboards/mini_leaderboard_swebenchpro.png)
![leaderboards/mini_leaderboard_swesmith.png](../figures/leaderboards/mini_leaderboard_swesmith.png)
![leaderboards/mini_leaderboard_swtbench.png](../figures/leaderboards/mini_leaderboard_swtbench.png)
![leaderboards/mini_leaderboard_usaco.png](../figures/leaderboards/mini_leaderboard_usaco.png)
![leaderboards/mini_leaderboards_cluster_1_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_1_page_1.png)
![leaderboards/mini_leaderboards_cluster_2_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_2_page_1.png)
![leaderboards/mini_leaderboards_cluster_3_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_3_page_1.png)
![leaderboards/mini_leaderboards_cluster_4_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_1.png)
![leaderboards/mini_leaderboards_cluster_4_page_2.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_2.png)
![leaderboards/mini_leaderboards_cluster_4_page_3.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_3.png)
![leaderboards/mini_leaderboards_cluster_4_page_4.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_4.png)
![leaderboards/mini_leaderboards_cluster_4_page_5.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_5.png)
![leaderboards/mini_leaderboards_cluster_4_page_6.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_6.png)
![leaderboards/mini_leaderboards_cluster_4_page_7.png](../figures/leaderboards/mini_leaderboards_cluster_4_page_7.png)
![leaderboards/mini_leaderboards_cluster_5_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_5_page_1.png)
![leaderboards/mini_leaderboards_cluster_5_page_2.png](../figures/leaderboards/mini_leaderboards_cluster_5_page_2.png)
![leaderboards/mini_leaderboards_cluster_6_page_1.png](../figures/leaderboards/mini_leaderboards_cluster_6_page_1.png)
![task_level/task_best_representatives.png](../figures/task_level/task_best_representatives.png)
![task_level/task_hard_to_predict_ranked.png](../figures/task_level/task_hard_to_predict_ranked.png)
![task_level/task_reliable_difficulty_composition.png](../figures/task_level/task_reliable_difficulty_composition.png)
![task_level/task_reliable_difficulty_composition_percent.png](../figures/task_level/task_reliable_difficulty_composition_percent.png)
![task_level/task_similarity_benchmark_pair_heatmap.png](../figures/task_level/task_similarity_benchmark_pair_heatmap.png)
![task_level/task_to_benchmark_alignment.png](../figures/task_level/task_to_benchmark_alignment.png)

## Not Completed Yet

- Trial reliability, pass@k, efficiency curves, token/tool cost analysis, and trajectory failure taxonomy still require per-trial run records.
- Full IRT/DIF still requires repeated binary/calibrated task outcomes or enough dense task observations to fit stable item-response models.
- Provider scaling analysis still requires external model metadata such as provider family, parameter scale, release date, and inference budget.
