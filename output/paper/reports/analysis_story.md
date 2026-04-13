# Paper-Facing Cross-Benchmark Analysis

This report is intended to be read directly. Figures and compact table previews are embedded inline; CSV paths are listed for exact numbers and reproducibility.

## Directory Contract

- Paper-facing tables: `output/paper/tables/`
- Paper-facing figures: `output/paper/figures/`
- Expanded study outputs: `output/studies/`
- Intermediate imputed matrices and diagnostics: `data/processed/intermediate/`

All score-based studies consume the SVD-filled processed matrices. Missingness in this report means original input coverage before SVD filling; observed-count and missingness fields are retained as evidence-quality metadata so we can distinguish measured cells from SVD-filled cells.

Data provenance for the main studies:

| analysis | primary_matrix | processed_output |
| --- | --- | --- |
| coverage filtering | raw benchmark matrix metadata | data/processed/intermediate/benchmark_column_quality.csv |
| agent+model aggregate leaderboard | SVD-filled benchmark score matrix | data/processed/intermediate/benchmark_svd_imputed_matrix.csv |
| per-benchmark mini-leaderboards | SVD-filled benchmark score matrix | data/processed/intermediate/benchmark_svd_imputed_matrix.csv |
| model vs agent roles | SVD-filled benchmark-relative matrix | data/processed/intermediate/benchmark_svd_imputed_normalized_matrix.csv |
| benchmark predictability and similarity | SVD-filled benchmark-relative matrix | data/processed/intermediate/benchmark_svd_imputed_normalized_matrix.csv |
| terminus harness deltas | SVD-filled benchmark-relative matrix | data/processed/intermediate/benchmark_svd_imputed_normalized_matrix.csv |
| task similarity and representatives | SVD-filled task benchmark-relative matrix plus task quality metadata | data/processed/intermediate/task_svd_imputed_normalized_matrix.csv |
| HaborMix candidate selection | processed task item statistics | data/processed/intermediate/task_item_stats.csv |

SVD imputation diagnostics:

Imputation method: each score column is robustly centered and scaled after `log1p` for nonnegative unbounded columns; rank is selected by held-out observed-cell cross-validation; missing cells are filled by iterative low-rank SVD reconstruction; observed input cells are restored exactly; filled scores are inverse-transformed and clipped to the observed range of that column. This is most defensible for benchmark-level analysis after sparse-column filtering. Task-level imputation is less stable because the task matrix is much wider and sparser, so task conclusions are restricted to reliable bounded non-degenerate tasks.

| matrix | missing_fraction_before_svd | selected_svd_rank | holdout_cells | holdout_rmse_scaled_score_space | holdout_mae_scaled_score_space |
| --- | --- | --- | --- | --- | --- |
| benchmark | 0.255 | 10 | 105 | 1.875 | 1.300 |
| task | 0.652 | 16 | 3790 | 87.620 | 3.359 |

## Research Question Coverage Checklist

| Question | Status | Main artifacts |
| --- | --- | --- |
| Agent vs model role overall and per benchmark | covered | `benchmark_variance_decomposition_filtered.csv`, `benchmark_model_agent_role_by_benchmark.csv`, `benchmark_model_vs_agent_role.png` |
| BenchPress-style benchmark predictability and hard-to-predict benchmarks/tasks | covered | `benchmark_uniqueness_filtered.csv`, `task_predictability_ranked.csv`, `benchmark_uniqueness_vs_coverage.png`, `task_hard_to_predict_ranked.png` |
| Benchmark/task similarity and clustering | covered | `benchmark_similarity_clusters.csv`, `benchmark_correlation_clustered.csv`, `task_within_benchmark_similarity.csv`, `task_cross_benchmark_similarity.csv`, clustered heatmaps |
| Representative tasks per benchmark | covered | `task_representative_tasks.csv`, `task_best_representatives.png` |
| Mini-leaderboards grouped by similar benchmarks | covered | `benchmark_mini_leaderboards.csv`, `mini_leaderboards_cluster_*.png` |
| Agent harness improvements over Terminus | covered | `benchmark_agent_lift_vs_terminus.csv`, `terminus_delta_by_model.csv`, Terminus heatmaps |
| Quantitative HaborMix task selection | covered | `harbormix_candidate_tasks.csv`, `harbormix_selection_by_benchmark.csv`, `harbormix_selection_diagnostics.png` |

## Study 1: Coverage Filtering

**Method:** Benchmark-level claims use only columns with at least 15 observed agent+model rows and at most 45% original raw-data missingness. The SVD-filled processed matrix is dense, but this filter keeps the paper story from leaning too heavily on filled values.

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
- `src/habor_mix_analyzer/reporting/paper_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/paper/tables/benchmark_filtering.csv`

**Result overview and analysis:**
- Included 39 of 45 benchmarks.
- Excluded sparse benchmarks: gso, quixbugs, skillsbench, hle, financeagent, ds-1000.
- Benchmark matrix imputation used rank 10; original benchmark missing fraction was 0.255.

| benchmark | include_in_paper_analysis | observed_count | missing_fraction |
| --- | --- | --- | --- |
| aider-polyglot | True | 26 | 0.000 |
| algotune | True | 26 | 0.000 |
| bfcl | True | 26 | 0.000 |
| bigcodebench | True | 26 | 0.000 |
| crustbench | True | 26 | 0.000 |
| featurebench-modal | True | 26 | 0.000 |
| gaia | True | 26 | 0.000 |
| seal0 | True | 26 | 0.000 |
| swtbench | True | 26 | 0.000 |
| omnimath | True | 24 | 0.077 |
| lawbench | True | 23 | 0.115 |
| spider2 | True | 23 | 0.115 |

**Insight and findings:** Sparse columns should stay in appendix/provisional analysis until more experiments land. The main paper story should use the coverage-filtered benchmark set.

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
- `src/habor_mix_analyzer/reporting/paper_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/paper/tables/benchmark_variance_decomposition_filtered.csv`
- `output/paper/tables/benchmark_model_agent_role_by_benchmark.csv`
- `output/paper/tables/benchmark_model_adjusted_effects.csv`
- `output/paper/tables/benchmark_agent_adjusted_effects.csv`

![Benchmark-level variance attribution](../figures/benchmark_variance_attribution.png)

![Per-benchmark model vs agent explanatory power](../figures/benchmark_model_vs_agent_role.png)

![Model effects adjusted for agent and benchmark](../figures/benchmark_model_adjusted_effects.png)

![Agent effects adjusted for model and benchmark](../figures/benchmark_agent_adjusted_effects.png)

**Result overview and analysis:**
| component | partial_r2_over_other_main_effects | r2 | type |
| --- | --- | --- | --- |
| model:benchmark | 0.421 | 0.673 | interaction_increment |
| all_main_effects | 0.251 | 0.251 | combined |
| benchmark | 0.195 | 0.195 | main_effect |
| agent:benchmark | 0.088 | 0.340 | interaction_increment |
| model | 0.049 | 0.054 | main_effect |
| model:agent | 0.011 | 0.262 | interaction_increment |
| agent | 0.002 | 0.008 | main_effect |

Benchmarks with the largest model-vs-agent role imbalance:
| benchmark | model_partial_r2_over_agent | agent_partial_r2_over_model | dominant_dimension |
| --- | --- | --- | --- |
| kumo | 0.920 | 0.068 | model |
| swtbench | 0.871 | 0.033 | model |
| omnimath | 0.878 | 0.044 | model |
| sldbench | 0.845 | 0.014 | model |
| aider-polyglot | 0.813 | 0.044 | model |
| qcircuitbench | 0.790 | 0.057 | model |
| swe-lancer | 0.728 | 0.010 | model |
| strongreject | 0.849 | 0.132 | model |
| swesmith | 0.770 | 0.057 | model |
| bfcl | 0.732 | 0.022 | model |

**Insight and findings:** Model identity explains much more overall variation than agent identity, but the role varies by benchmark. Agent effects are more useful as benchmark-specific harnessing effects than as a universal main effect.

## Study 3: Agent+Model Leaderboards

**Method:** I keep `agent+model` rankings as descriptive mini-leaderboards. Per-benchmark mini-leaderboards use SVD-filled benchmark scores on each benchmark's original metric scale. The aggregate top-agent plot uses mean within-benchmark score percentile, because averaging scores across benchmarks with different scales would be misleading.

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
- `src/habor_mix_analyzer/reporting/paper_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/paper/tables/benchmark_agent_model_scores.csv`
- `output/paper/tables/benchmark_scores_long.csv`
- `output/paper/tables/benchmark_mini_leaderboards.csv`
- `output/paper/tables/benchmark_similarity_clusters.csv`
- `output/paper/figures/mini_leaderboards_cluster_*.png`

![Top agent+model pairs on included benchmarks](../figures/benchmark_agent_model_top_scores.png)

![Mini-leaderboards mini_leaderboards_cluster_1.png](../figures/mini_leaderboards_cluster_1.png)
![Mini-leaderboards mini_leaderboards_cluster_2.png](../figures/mini_leaderboards_cluster_2.png)
![Mini-leaderboards mini_leaderboards_cluster_3.png](../figures/mini_leaderboards_cluster_3.png)
![Mini-leaderboards mini_leaderboards_cluster_4.png](../figures/mini_leaderboards_cluster_4.png)
![Mini-leaderboards mini_leaderboards_cluster_5.png](../figures/mini_leaderboards_cluster_5.png)
![Mini-leaderboards mini_leaderboards_cluster_6.png](../figures/mini_leaderboards_cluster_6.png)

**Result overview and analysis:**
| rank | agent_model | mean_score_percentile_across_benchmarks | observed_fraction_on_included_benchmarks |
| --- | --- | --- | --- |
| 1 | gemini-cli + gemini-3.1-pro-preview | 0.788 | 0.949 |
| 2 | codex + gpt-5.4 | 0.778 | 1.000 |
| 3 | terminus-2 + gemini-3.1-pro-preview | 0.757 | 0.974 |
| 4 | terminus-2 + claude-opus-4-6 | 0.669 | 0.333 |
| 5 | terminus-2 + kimi-k2.5 | 0.622 | 0.949 |
| 6 | claude-code + claude-opus-4-6 | 0.619 | 0.308 |
| 7 | terminus-2 + gemini-3-flash-preview | 0.597 | 0.949 |
| 8 | codex + gpt-5-mini | 0.587 | 0.974 |
| 9 | terminus-2 + claude-sonnet-4-6 | 0.586 | 0.333 |
| 10 | gemini-cli + gemini-3-flash-preview | 0.573 | 0.974 |

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
- `src/habor_mix_analyzer/reporting/paper_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/paper/tables/benchmark_uniqueness_filtered.csv`
- `output/paper/tables/benchmark_redundancy_pairs_filtered.csv`
- `output/paper/tables/benchmark_correlation_clustered.csv`

![Benchmark uniqueness after coverage filtering](../figures/benchmark_uniqueness_vs_coverage.png)

![Clustered benchmark similarity heatmap](../figures/benchmark_similarity_clustered_heatmap.png)

**Result overview and analysis:**
Hardest-to-predict benchmarks:
| benchmark | cv_r2_from_other_included_benchmarks | cv_rmse |
| --- | --- | --- |
| swe-lancer | -1.595 | 2.135 |
| bfcl | -1.411 | 1.180 |
| swesmith | -0.779 | 1.613 |
| bigcodebench | -0.655 | 1.043 |
| algotune | -0.640 | 0.834 |
| mmmlu | -0.597 | 1.508 |
| qcircuitbench | -0.583 | 1.515 |
| strongreject | -0.440 | 1.971 |
| humanevalfix | -0.424 | 14.996 |
| aider-polyglot | -0.268 | 0.858 |

Most similar benchmark pairs:
| left | right | spearman |
| --- | --- | --- |
| gaia | simpleqa | 0.861 |
| featurebench-modal | lawbench | 0.828 |
| aime | gpqa-diamond | 0.816 |
| crustbench | replicationbench | 0.815 |
| arc-agi-2 | kumo | 0.804 |
| swtbench | qcircuitbench | 0.779 |
| mmmlu | swebenchpro | 0.758 |

**Insight and findings:** Predictable benchmarks are candidates for compression; hard-to-predict benchmarks should be preserved when the goal is behavioral breadth. Similarity clusters are also the basis for the grouped mini-leaderboards.

## Study 5: Task Similarity, Predictability, and Representatives

**Method:** Task-level analysis uses reliable, bounded, non-degenerate tasks only. A task is hard to predict when its maximum absolute Spearman correlation to peer tasks in the same benchmark is low. A representative task is one whose score profile correlates strongly with the benchmark's reliable-task aggregate. Within- and cross-benchmark task similarity use median absolute task-profile correlations. Difficulty tiers use mean task score thresholds: frontier <5%, hard 5-30%, medium 30-70%, easy 70-95%, saturated >95%.

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
- `src/habor_mix_analyzer/reporting/paper_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/paper/tables/task_predictability_ranked.csv`
- `output/paper/tables/task_representative_tasks.csv`
- `output/paper/tables/task_within_benchmark_similarity.csv`
- `output/paper/tables/task_cross_benchmark_similarity.csv`

![Hard-to-predict reliable tasks](../figures/task_hard_to_predict_ranked.png)

![Best representative task per benchmark](../figures/task_best_representatives.png)

![Task similarity across benchmark pairs](../figures/task_similarity_benchmark_pair_heatmap.png)

**Result overview and analysis:**
Hardest-to-predict reliable tasks:
| benchmark | task_id | task_unpredictability_score | difficulty_tier | task_score |
| --- | --- | --- | --- | --- |
| swebench-verified | matplotlib__matplotlib-26208 | 0.817 | frontier | 0.024 |
| omnimath | omnimath_1354 | 0.813 | medium | 0.638 |
| omnimath | omnimath_1181 | 0.813 | hard | 0.100 |
| bigcodebench | bigcodebench_1003 | 0.781 | medium | 0.687 |
| compilebench | jq | 0.770 | saturated | 0.958 |
| compilebench | curl-ssl | 0.770 | saturated | 0.952 |
| bigcodebench | bigcodebench_1019 | 0.745 | hard | 0.073 |
| qcircuitbench | diffusion_operator-n7 | 0.739 | easy | 0.701 |
| swesmith | oauthlib__oauthlib.1fd52536.combine_file__5wgd819s | 0.715 | medium | 0.316 |
| bigcodebench | bigcodebench_1020 | 0.705 | easy | 0.930 |
| swe-lancer | 48694_681 | 0.703 | frontier | 0.016 |
| bigcodebench | bigcodebench_1022 | 0.670 | hard | 0.296 |

Most representative tasks:
| benchmark | task_id | representativeness_score | difficulty_tier | task_score |
| --- | --- | --- | --- | --- |
| arc-agi-2 | 8e5c0c38_0 | 0.991 | hard | 0.118 |
| swebench-multilingual | valkey-io__valkey-1499 | 0.983 | medium | 0.653 |
| swebench-multilingual | fmtlib__fmt-3750 | 0.982 | medium | 0.641 |
| swebench-multilingual | briannesbitt__carbon-2752 | 0.982 | medium | 0.641 |
| swebench-multilingual | briannesbitt__carbon-2981 | 0.982 | medium | 0.641 |
| swebench-multilingual | redis__redis-10095 | 0.982 | medium | 0.666 |
| swebench-multilingual | rubocop__rubocop-13375 | 0.982 | medium | 0.666 |
| swebench-multilingual | tokio-rs__tokio-7139 | 0.982 | medium | 0.666 |
| swebench-multilingual | tokio-rs__tokio-6838 | 0.982 | medium | 0.648 |
| swebench-multilingual | briannesbitt__carbon-3103 | 0.981 | medium | 0.659 |
| swebench-multilingual | fluent__fluentd-3917 | 0.981 | medium | 0.659 |
| swebench-multilingual | caddyserver__caddy-6115 | 0.981 | medium | 0.659 |

Benchmarks with strongest within-benchmark task similarity:
| benchmark | n_reliable_tasks | median_abs_task_similarity_within_benchmark |
| --- | --- | --- |
| arc-agi-2 | 94 | 0.754 |
| swebench-multilingual | 240 | 0.725 |
| gso | 2 | 0.694 |
| swebench-verified | 9 | 0.683 |
| humanevalfix | 19 | 0.677 |
| crustbench | 96 | 0.561 |
| medagentbench | 71 | 0.490 |
| aime | 6 | 0.482 |
| labbench | 180 | 0.447 |
| simpleqa | 200 | 0.433 |

**Insight and findings:** Task predictability and representativeness are different objectives. Representative tasks are good compact proxies for a benchmark; hard-to-predict tasks are better stress tests for broad coverage.

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
- `src/habor_mix_analyzer/reporting/paper_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/paper/tables/benchmark_agent_lift_vs_terminus.csv`
- `output/paper/tables/terminus_delta_by_model.csv`
- `output/studies/benchmark_level/benchmark_agent_lift_by_benchmark.csv`

![Agent lift vs terminus by benchmark](../figures/benchmark_agent_lift_heatmap.png)

![Agent lift vs terminus by model](../figures/terminus_delta_by_model_heatmap.png)

**Result overview and analysis:**
| agent | mean_delta_vs_terminus | win_rate_vs_terminus | compared_models |
| --- | --- | --- | --- |
| gemini-cli | 0.084 | 0.500 | 2 |
| codex | 0.041 | 0.667 | 3 |
| claude-code | -0.392 | 0.399 | 7 |

| model | agent | mean_delta_vs_terminus | win_rate_vs_terminus |
| --- | --- | --- | --- |
| gpt-5-mini | codex | 0.799 | 0.744 |
| gpt-5.4 | codex | 0.779 | 0.744 |
| gemini-3.1-pro-preview | gemini-cli | 0.176 | 0.487 |
| claude-haiku-4-5-20251001 | claude-code | 0.106 | 0.590 |
| gemini-3-flash-preview | gemini-cli | -0.008 | 0.513 |
| claude-sonnet-4-6 | claude-code | -0.081 | 0.436 |
| MiniMax-M2.5 | claude-code | -0.117 | 0.410 |
| claude-opus-4-6 | claude-code | -0.143 | 0.436 |
| kimi-k2.5 | claude-code | -0.325 | 0.282 |
| mimo-v2-pro | claude-code | -0.463 | 0.333 |
| gpt-5-nano | codex | -1.455 | 0.513 |
| glm-5 | claude-code | -1.717 | 0.308 |

**Insight and findings:** Paired deltas are the best current evidence for whether an agent harness improves over Terminus. The deltas vary by model and benchmark, so claims should avoid saying one harness universally dominates.

## Study 7: HaborMix Selection

**Method:** Candidate tasks must be reliable, bounded, discriminative, and non-degenerate. The selection score rewards positive correlation with overall agent+model strength, observed variance, moderate difficulty, and observation count. I cap selection at 6 tasks per benchmark to avoid overrepresenting large benchmarks.

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
- `src/habor_mix_analyzer/reporting/paper_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/paper/tables/harbormix_candidate_tasks.csv`
- `output/paper/tables/harbormix_selection_by_benchmark.csv`
- `output/studies/task_level/task_frontier_or_saturated_watchlist.csv`

![HaborMix selection diagnostics](../figures/harbormix_selection_diagnostics.png)

![Reliable bounded task difficulty composition](../figures/task_reliable_difficulty_composition.png)

**Result overview and analysis:**
| benchmark | difficulty_tier | selected_tasks | mean_selection_score |
| --- | --- | --- | --- |
| aider-polyglot | medium | 6 | 1.567 |
| featurebench-modal | medium | 6 | 1.543 |
| seal0 | medium | 6 | 1.485 |
| crustbench | medium | 6 | 1.425 |
| labbench | medium | 6 | 1.420 |
| gpqa-diamond | medium | 6 | 1.401 |
| gaia | medium | 6 | 1.391 |
| mmau | medium | 6 | 1.372 |
| simpleqa | medium | 6 | 1.350 |
| swebench-multilingual | medium | 6 | 1.349 |
| lawbench | medium | 6 | 1.309 |
| medagentbench | medium | 6 | 1.283 |
| replicationbench | medium | 5 | 1.380 |
| bixbench | medium | 4 | 1.376 |

- Selected 120 diversified candidate tasks.

**Insight and findings:** HaborMix selection is quantitative and auditable: it balances discriminativeness, difficulty, coverage, and benchmark diversity rather than taking the largest benchmarks wholesale.

## Study 8: Task Aggregate vs Benchmark-Level Score Alignment

**Method:** For each benchmark, I average benchmark-relative task scores and correlate that aggregate with the benchmark-level benchmark-relative score across agent+model rows.

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
- `src/habor_mix_analyzer/reporting/paper_report.py`
- `src/habor_mix_analyzer/cli.py`

**Result paths:**
- `output/paper/tables/task_to_benchmark_alignment.csv`

![Task aggregate vs benchmark score alignment](../figures/task_to_benchmark_alignment.png)

**Result overview and analysis:**
| benchmark | n_reliable_bounded_tasks | spearman_agent_model_correlation |
| --- | --- | --- |
| aider-polyglot | 218 | 0.995 |
| seal0 | 111 | 0.984 |
| bfcl | 123 | 0.955 |
| featurebench-modal | 200 | 0.939 |
| swebenchpro | 8 | 0.852 |
| replicationbench | 90 | 0.830 |
| bigcodebench | 15 | 0.808 |
| bixbench | 50 | 0.781 |
| lawbench | 50 | 0.776 |
| labbench | 181 | 0.774 |
| medagentbench | 100 | 0.755 |
| swesmith | 10 | 0.713 |

**Insight and findings:** Strong alignment means the task matrix explains the benchmark-level score; weak alignment flags benchmarks whose aggregation rule or metric scale needs closer inspection.

## Cross-Study Story

The emerging story is that benchmark diversity matters more than a single aggregate leaderboard. Coverage filtering removes sparse columns from the main benchmark-level claims. Within the retained benchmarks, model identity is usually more explanatory than agent identity, but agent effects vary sharply by model and benchmark. BenchPress-style predictability analysis finds benchmarks that are redundant enough to compress and benchmarks that add distinct signal. The task-level layer then answers a different question: which items are representative, which are hard to predict, and which form a balanced HaborMix candidate set. Terminus paired deltas are the fairest current way to talk about harness improvement.

## Not Completed Yet

- Trial reliability, pass@k, efficiency curves, token/tool cost analysis, and trajectory failure taxonomy still require per-trial run records.
- Full IRT/DIF still requires repeated binary/calibrated task outcomes or enough dense task observations to fit stable item-response models.
- Provider scaling analysis still requires external model metadata such as provider family, parameter scale, release date, and inference budget.
