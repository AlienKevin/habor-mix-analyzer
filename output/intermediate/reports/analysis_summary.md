# Cross-Benchmark Analysis Summary

## Scope

This run uses the two currently available raw score matrices: `benchmark_level_matrix.csv` and `task_level_matrix.csv`. The pipeline treats rows as `(model, agent)` systems, benchmark columns as benchmark-level scores, and task columns as `benchmark/task_id` scores.

The current data does not include repeated trials, trajectories, token counts, wall time, or run-level error labels, so the pipeline implements the matrix analyses now and records the trial/trajectory phases as pending.

## Imputation

- Benchmark matrix: 26 systems x 45 benchmarks, raw missing fraction 0.255, selected SVD rank 10.
- Task matrix: 26 systems x 8376 tasks, raw missing fraction 0.652, selected SVD rank 16.
- Imputation is performed after `log1p` transforms for nonnegative unbounded columns and robust per-column centering/scaling; observed values are written back exactly; imputed raw values are inverse-transformed and clipped to each column's observed min/max.

## Top Systems

- rank=1, model=gemini-3.1-pro-preview, agent=gemini-cli, normalized_mean=0.791, observed_fraction=0.844
- rank=2, model=gemini-3.1-pro-preview, agent=terminus-2, normalized_mean=0.667, observed_fraction=0.867
- rank=3, model=gpt-5.4, agent=codex, normalized_mean=0.655, observed_fraction=0.889
- rank=4, model=claude-opus-4-6, agent=terminus-2, normalized_mean=0.551, observed_fraction=0.289
- rank=5, model=claude-opus-4-6, agent=claude-code, normalized_mean=0.446, observed_fraction=0.289
- rank=6, model=claude-sonnet-4-6, agent=claude-code, normalized_mean=0.210, observed_fraction=0.289
- rank=7, model=claude-sonnet-4-6, agent=terminus-2, normalized_mean=0.171, observed_fraction=0.289
- rank=8, model=kimi-k2.5, agent=terminus-2, normalized_mean=0.165, observed_fraction=0.867
- rank=9, model=gemini-3-flash-preview, agent=terminus-2, normalized_mean=0.144, observed_fraction=0.844
- rank=10, model=gemini-3-flash-preview, agent=gemini-cli, normalized_mean=0.125, observed_fraction=0.867

## Variance Attribution

- component=model:benchmark, partial_r2_over_other_main_effects=0.426, r2=0.672, type=interaction_increment
- component=all_main_effects, partial_r2_over_other_main_effects=0.246, r2=0.246, type=combined
- component=benchmark, partial_r2_over_other_main_effects=0.196, r2=0.196, type=main_effect
- component=agent:benchmark, partial_r2_over_other_main_effects=0.089, r2=0.335, type=interaction_increment
- component=model, partial_r2_over_other_main_effects=0.043, r2=0.048, type=main_effect
- component=model:agent, partial_r2_over_other_main_effects=0.009, r2=0.255, type=interaction_increment
- component=agent, partial_r2_over_other_main_effects=0.002, r2=0.007, type=main_effect

## Redundant Benchmark Pairs

- left=gaia, right=simpleqa, spearman=0.861

## Most Anti-Correlated or Divergent Pairs

- left=financeagent, right=strongreject, spearman=-0.869
- left=hle, right=strongreject, spearman=-0.789
- left=ineqmath, right=skillsbench, spearman=-0.749
- left=codepde, right=spider2, spearman=-0.678
- left=codepde, right=simpleqa, spearman=-0.652
- left=ds-1000, right=gaia, spearman=-0.614
- left=aime, right=skillsbench, spearman=-0.610
- left=gpqa-diamond, right=spider2, spearman=-0.556

## Least Predictable Benchmarks

- benchmark=swe-lancer, cv_r2=-1.539, cv_rmse=2.112
- benchmark=bfcl, cv_r2=-1.457, cv_rmse=1.192
- benchmark=swebench-multilingual, cv_r2=-1.030, cv_rmse=1.444
- benchmark=swesmith, cv_r2=-0.722, cv_rmse=1.587
- benchmark=algotune, cv_r2=-0.636, cv_rmse=0.833
- benchmark=mmmlu, cv_r2=-0.603, cv_rmse=1.511
- benchmark=bigcodebench, cv_r2=-0.529, cv_rmse=1.002
- benchmark=qcircuitbench, cv_r2=-0.523, cv_rmse=1.486
- benchmark=humanevalfix, cv_r2=-0.199, cv_rmse=13.760
- benchmark=livecodebench, cv_r2=-0.160, cv_rmse=1.590
- benchmark=gaia, cv_r2=-0.090, cv_rmse=0.662
- benchmark=seal0, cv_r2=-0.076, cv_rmse=0.829

## Most Incomplete Benchmarks

- column=ds-1000, missing_fraction=0.962, observed_count=1
- column=financeagent, missing_fraction=0.885, observed_count=3
- column=hle, missing_fraction=0.846, observed_count=4
- column=skillsbench, missing_fraction=0.692, observed_count=8
- column=quixbugs, missing_fraction=0.654, observed_count=9
- column=gso, missing_fraction=0.462, observed_count=14
- column=swebench-multilingual, missing_fraction=0.423, observed_count=15
- column=codepde, missing_fraction=0.385, observed_count=16
- column=swe-lancer, missing_fraction=0.269, observed_count=19
- column=devopsgym, missing_fraction=0.269, observed_count=19
- column=compilebench, missing_fraction=0.231, observed_count=20
- column=arc-agi-2, missing_fraction=0.231, observed_count=20

## Task-Level Frontier Candidates

- benchmark=hle, n_tasks=2272, frontier=1703, hard=52, mean_missing_fraction=0.917
- benchmark=ds-1000, n_tasks=776, frontier=776, hard=0, mean_missing_fraction=0.962
- benchmark=mmau, n_tasks=999, frontier=363, hard=16, mean_missing_fraction=0.872
- benchmark=featurebench-modal, n_tasks=200, frontier=55, hard=122, mean_missing_fraction=0.052
- benchmark=gso, n_tasks=102, frontier=39, hard=32, mean_missing_fraction=0.726
- benchmark=medagentbench, n_tasks=100, frontier=34, hard=1, mean_missing_fraction=0.231
- benchmark=spider2, n_tasks=63, frontier=33, hard=6, mean_missing_fraction=0.794
- benchmark=reasoning-gym, n_tasks=576, frontier=29, hard=54, mean_missing_fraction=0.712
- benchmark=swebench-multilingual, n_tasks=270, frontier=24, hard=40, mean_missing_fraction=0.505
- benchmark=seal0, n_tasks=111, frontier=23, hard=36, mean_missing_fraction=0.002
- benchmark=replicationbench, n_tasks=90, frontier=20, hard=43, mean_missing_fraction=0.408
- benchmark=bixbench, n_tasks=50, frontier=17, hard=13, mean_missing_fraction=0.270

## Strongest Agent Differentials vs terminus-2

- agent=codex, benchmark=sldbench, delta_normalized=3.400
- agent=codex, benchmark=mmmlu, delta_normalized=2.258
- agent=gemini-cli, benchmark=strongreject, delta_normalized=2.203
- agent=codex, benchmark=kumo, delta_normalized=1.818
- agent=gemini-cli, benchmark=labbench, delta_normalized=1.719
- agent=codex, benchmark=arc-agi-2, delta_normalized=1.698
- agent=codex, benchmark=simpleqa, delta_normalized=1.579
- agent=codex, benchmark=seal0, delta_normalized=1.538
- agent=codex, benchmark=quixbugs, delta_normalized=1.473
- agent=claude-code, benchmark=swebench-verified, delta_normalized=1.425
- agent=claude-code, benchmark=livecodebench, delta_normalized=1.389
- agent=claude-code, benchmark=hle, delta_normalized=1.258

## Pending Analyses

- Trial consistency, pass@k, reliability profiles, and efficiency metrics need per-trial run data.
- LLM trajectory failure taxonomy, bottleneck CDFs, and step-level error distributions need trajectories and run metadata.
- Full IRT/DIF is deferred until repeated binary response data is available. The current task table includes item difficulty tiers and strength-correlation proxies as a preparatory layer.
- Scaling/provider analysis needs provider metadata such as parameter count, release date, and model family labels.
