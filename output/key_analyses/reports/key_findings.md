# Key Findings for Key Analysis Drafting

1. Use 40 coverage-filtered benchmarks for benchmark-level claims; keep sparse benchmarks in appendix/provisional analysis.

The filtering table is now evidence-based on the task-first pipeline: benchmark scores come from task-SVD aggregates, while the missingness columns describe how much original task evidence supported each aggregate before filling.

![Benchmark uniqueness after coverage filtering](../figures/benchmark_level/benchmark_uniqueness_vs_coverage.png)

| benchmark | include_in_key_analysis | observed_count | task_cell_missing_fraction |
| --- | --- | --- | --- |
| aider-polyglot | True | 26 | 0.044 |
| algotune | True | 26 | 0.131 |
| bfcl | True | 26 | 0.000 |
| bigcodebench | True | 26 | 0.559 |
| crustbench | True | 26 | 0.117 |
| featurebench-modal | True | 26 | 0.052 |
| gaia | True | 26 | 0.206 |
| lawbench | True | 26 | 0.409 |

2. Model identity is the larger overall factor, but the model-vs-agent balance varies by benchmark; use the per-benchmark role plot for qualified claims.

This is the clean answer to the agent-vs-model question: make the broad statement from the overall fixed-effect decomposition, then qualify it with per-benchmark partial R2 rather than collapsing everything into a single agent+model row label.

![Per-benchmark model vs agent explanatory power](../figures/benchmark_level/benchmark_model_vs_agent_role.png)

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

3. Separate model and agent dimensions. The useful agent evidence is paired lift over `terminus-2` for the same model, not an unqualified agent+model leaderboard.

The Terminus table should be read as a harnessing-effect estimate: the paired comparison holds model fixed where the same model appears under Terminus and another agent.

![Agent lift vs terminus by model](../figures/benchmark_level/terminus_delta_by_model_heatmap.png)

| agent | mean_delta_vs_terminus | win_rate_vs_terminus | compared_models |
| --- | --- | --- | --- |
| codex | 0.358 | 0.617 | 3 |
| gemini-cli | 0.130 | 0.537 | 2 |
| claude-code | -0.123 | 0.450 | 7 |

4. BenchPress-style predictability applies here: redundant benchmarks can be compressed; least-predictable benchmarks should be preserved for behavioral breadth.

The benchmark-predictability result is deliberately separate from clustering: regression asks whether other benchmarks reconstruct a target, while the heatmap shows score-profile similarity. Use both when deciding whether two benchmarks are redundant.

![Clustered benchmark similarity heatmap](../figures/benchmark_level/benchmark_similarity_clustered_heatmap.png)

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

5. Task predictability and task representativeness are distinct: hard-to-predict tasks are stress tests, while representative tasks are compact proxies for a benchmark.

The representative-task score now uses leave-one-out aggregate correlation times task variance, so tasks that are merely typical but non-discriminative are less likely to dominate the selected base set.

![Hard-to-predict reliable tasks](../figures/task_level/task_hard_to_predict_ranked.png)

![Best representative task per benchmark](../figures/task_level/task_best_representatives.png)

| benchmark | task_id | task_unpredictability_score | difficulty_tier |
| --- | --- | --- | --- |
| humanevalfix | humanevalfix-python-6 | 0.915 | saturated |
| devopsgym | devopsgym-codegen__prometheus__prometheus-7667 | 0.891 | easy |
| gso | gso-pydantic--pydantic-addf1f9 | 0.811 | frontier |
| strongreject | strongreject_sexual_content_0005_pap_logical_appeal | 0.751 | saturated |
| devopsgym | devopsgym-testgen__spotbugs__spotbugs-2795 | 0.706 | medium |
| devopsgym | devopsgym-codegen__containerd__containerd-10275 | 0.706 | frontier |
| gaia | gaia-08f3a05f-5947-4089-a4c4-d4bcfaa6b7a0 | 0.691 | easy |
| swebench-verified | swebench-verified-matplotlib__matplotlib-26208 | 0.678 | frontier |

| benchmark | task_id | useful_representativeness_score | difficulty_tier |
| --- | --- | --- | --- |
| labbench | labbench-figqa-0036 | 0.443 | hard |
| swebench-multilingual | swebench-multilingual-jqlang__jq-2658 | 0.441 | easy |
| swebench-multilingual | swebench-multilingual-php-cs-fixer__php-cs-fixer-7523 | 0.441 | easy |
| swebench-multilingual | swebench-multilingual-caddyserver__caddy-6288 | 0.441 | easy |
| swebench-multilingual | swebench-multilingual-fmtlib__fmt-3729 | 0.441 | easy |
| lawbench | lawbench-3-7-11-zero-shot | 0.437 | easy |
| labbench | labbench-figqa-0128 | 0.436 | medium |
| swebench-multilingual | swebench-multilingual-jqlang__jq-2919 | 0.432 | easy |

6. The current task-level filter yields 1941 diversified candidate tasks for HaborMix-style selection.

The HaborMix scorer is no longer centered on moderate difficulty. It first takes useful representative base tasks, then adds difficult, frontier-with-variance, unique/unpredictable, and high-composite tasks without a per-benchmark cap.

![HaborMix selection diagnostics](../figures/harbormix/harbormix_selection_diagnostics.png)

| benchmark | difficulty_tier | selected_tasks | mean_selection_score |
| --- | --- | --- | --- |
| featurebench-modal | hard | 121 | 0.612 |
| labbench | hard | 86 | 0.558 |
| arc-agi-2 | hard | 79 | 0.616 |
| algotune | hard | 59 | 0.614 |
| featurebench-modal | frontier | 55 | 0.343 |
| swebench-multilingual | hard | 53 | 0.499 |
| gaia | hard | 52 | 0.534 |
| aider-polyglot | hard | 47 | 0.496 |
| lawbench | medium | 46 | 0.551 |
| aider-polyglot | medium | 45 | 0.686 |

7. Task-to-benchmark alignment should be used as a sanity check before interpreting benchmark-level scores from task-level tables.

This table is diagnostic rather than a gate. Weak alignment means the reliable bounded subset may not proxy the full task-derived aggregate well; it does not automatically remove the benchmark from the benchmark-level analysis.

![Task aggregate vs benchmark score alignment](../figures/task_level/task_to_benchmark_alignment.png)

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

Primary reference file: `output/key_analyses/reports/analysis_story.md`.