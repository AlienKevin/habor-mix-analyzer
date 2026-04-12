# Paper-Facing Cross-Benchmark Analysis

This is the curated, paper-facing result index. The bulky matrices and diagnostics are intentionally moved to intermediate directories; the files listed here are the ones to inspect first.

## Directory Contract

- Important paper-facing tables: `output/paper/tables/`
- Important paper-facing figures: `output/paper/figures/`
- Important paper-facing reports: `output/paper/reports/`
- Study-specific expanded outputs: `output/studies/`
- Intermediate imputed matrices and diagnostics: `data/processed/intermediate/` and `output/intermediate/`

## Study 1: Benchmark-Level Coverage and Filtering

**Method:** I first filter benchmark-level columns by observed coverage. A benchmark is included in paper-facing benchmark-level analyses when it has at least 15 observed agent+model rows and at most 45% missingness. This avoids building the paper story on columns where matrix completion is doing most of the work.

**Code files:**
- `src/habor_mix_analyzer/pipeline.py`

**Result paths:**
- `output/paper/tables/benchmark_filtering.csv`

**Result overview and analysis:**
- Included 39 of 45 benchmarks in the paper-facing benchmark-level analyses.
- Excluded sparse benchmarks: gso, quixbugs, skillsbench, hle, financeagent, ds-1000.
- Benchmark matrix imputation used rank 10; raw missing fraction was 0.255.

**Insight and findings:**
- Treat `ds-1000`, `financeagent`, `hle`, `skillsbench`, `quixbugs`, and similarly sparse columns as provisional until more runs land. They can be shown in appendix diagnostics, but they should not anchor the core benchmark-level story yet.

## Study 2: Separate Model and Agent Effects

**Method:** I treat `model` and `agent` as separate fixed-effect dimensions. For model effects, I residualize out agent and benchmark effects; for agent effects, I residualize out model and benchmark effects. I also keep an `agent+model` ranking as a descriptive table, but it is not the primary causal interpretation.

**Code files:**
- `src/habor_mix_analyzer/pipeline.py`

**Result paths:**
- `output/paper/tables/benchmark_agent_model_scores.csv`
- `output/paper/tables/benchmark_model_adjusted_effects.csv`
- `output/paper/tables/benchmark_agent_adjusted_effects.csv`
- `output/paper/figures/benchmark_agent_model_top_scores.png`
- `output/paper/figures/benchmark_model_adjusted_effects.png`
- `output/paper/figures/benchmark_agent_adjusted_effects.png`

**Result overview and analysis:**
- rank=1, agent_model=gemini-cli + gemini-3.1-pro-preview, mean_normalized_score=0.877, observed_fraction_on_included_benchmarks=0.949
- rank=2, agent_model=codex + gpt-5.4, mean_normalized_score=0.718, observed_fraction_on_included_benchmarks=1.000
- rank=3, agent_model=terminus-2 + gemini-3.1-pro-preview, mean_normalized_score=0.701, observed_fraction_on_included_benchmarks=0.974
- rank=4, agent_model=terminus-2 + claude-opus-4-6, mean_normalized_score=0.612, observed_fraction_on_included_benchmarks=0.333
- rank=5, agent_model=claude-code + claude-opus-4-6, mean_normalized_score=0.469, observed_fraction_on_included_benchmarks=0.308
- rank=6, agent_model=terminus-2 + claude-sonnet-4-6, mean_normalized_score=0.219, observed_fraction_on_included_benchmarks=0.333
- rank=7, agent_model=terminus-2 + kimi-k2.5, mean_normalized_score=0.194, observed_fraction_on_included_benchmarks=0.949
- rank=8, agent_model=claude-code + claude-sonnet-4-6, mean_normalized_score=0.138, observed_fraction_on_included_benchmarks=0.308

**Insight and findings:**
- Top adjusted models: gpt-5.4, claude-opus-4-6, gemini-3.1-pro-preview, claude-sonnet-4-6, deepseek-chat.
- Top adjusted agents: terminus-2, gemini-cli, codex, claude-code.
- The agent main effect remains much smaller than model-by-benchmark interaction. This supports a paper story where agents are not global multipliers; they are benchmark- and model-dependent adapters.

## Study 3: Variance, Redundancy, and Benchmark Uniqueness

**Method:** I use fixed-effect variance attribution to estimate how much normalized-score structure is explained by model, agent, benchmark, and interactions. I then compute Spearman benchmark correlations and ridge leave-fold-out predictability to identify redundant and unique benchmarks.

**Code files:**
- `src/habor_mix_analyzer/pipeline.py`

**Result paths:**
- `output/paper/tables/benchmark_variance_decomposition_filtered.csv`
- `output/paper/tables/benchmark_redundancy_pairs_filtered.csv`
- `output/paper/tables/benchmark_uniqueness_filtered.csv`
- `output/paper/figures/benchmark_uniqueness_vs_coverage.png`

**Result overview and analysis:**
- component=model:benchmark, partial_r2_over_other_main_effects=0.421, r2=0.673, type=interaction_increment
- component=all_main_effects, partial_r2_over_other_main_effects=0.251, r2=0.251, type=combined
- component=benchmark, partial_r2_over_other_main_effects=0.195, r2=0.195, type=main_effect
- component=agent:benchmark, partial_r2_over_other_main_effects=0.088, r2=0.340, type=interaction_increment
- component=model, partial_r2_over_other_main_effects=0.049, r2=0.054, type=main_effect
- component=model:agent, partial_r2_over_other_main_effects=0.011, r2=0.262, type=interaction_increment
- component=agent, partial_r2_over_other_main_effects=0.002, r2=0.008, type=main_effect

High-correlation benchmark pairs:
- left=gaia, right=simpleqa, spearman=0.861
- left=featurebench-modal, right=lawbench, spearman=0.828
- left=aime, right=gpqa-diamond, spearman=0.816
- left=crustbench, right=replicationbench, spearman=0.815
- left=arc-agi-2, right=kumo, spearman=0.804
- left=swtbench, right=qcircuitbench, spearman=0.779
- left=mmmlu, right=swebenchpro, spearman=0.758

Least predictable included benchmarks:
- benchmark=swe-lancer, cv_r2_from_other_included_benchmarks=-1.595, cv_rmse=2.135
- benchmark=bfcl, cv_r2_from_other_included_benchmarks=-1.411, cv_rmse=1.180
- benchmark=swesmith, cv_r2_from_other_included_benchmarks=-0.779, cv_rmse=1.613
- benchmark=bigcodebench, cv_r2_from_other_included_benchmarks=-0.655, cv_rmse=1.043
- benchmark=algotune, cv_r2_from_other_included_benchmarks=-0.640, cv_rmse=0.834
- benchmark=mmmlu, cv_r2_from_other_included_benchmarks=-0.597, cv_rmse=1.508
- benchmark=qcircuitbench, cv_r2_from_other_included_benchmarks=-0.583, cv_rmse=1.515
- benchmark=strongreject, cv_r2_from_other_included_benchmarks=-0.440, cv_rmse=1.971

**Insight and findings:**
- The dominant signal is interactional: model performance changes substantially across benchmarks. This argues for cross-benchmark analysis rather than a single aggregate leaderboard.
- Highly correlated benchmarks are candidates for compression in a benchmark mix, while low-predictability benchmarks should be preserved if the goal is broad behavioral coverage.

## Study 4: Paired Agent Lift Against terminus-2

**Method:** For every model that has both `terminus-2` and another agent row, I compute paired benchmark deltas in normalized space. This isolates the agent change while holding the model fixed.

**Code files:**
- `src/habor_mix_analyzer/pipeline.py`

**Result paths:**
- `output/paper/tables/benchmark_agent_lift_vs_terminus.csv`
- `output/studies/benchmark_level/benchmark_agent_lift_by_benchmark.csv`
- `output/paper/figures/benchmark_agent_lift_heatmap.png`

**Result overview and analysis:**
- agent=gemini-cli, mean_delta_vs_terminus=0.084, win_rate_vs_terminus=0.500, compared_models=2
- agent=codex, mean_delta_vs_terminus=0.041, win_rate_vs_terminus=0.667, compared_models=3
- agent=claude-code, mean_delta_vs_terminus=-0.392, win_rate_vs_terminus=0.399, compared_models=7

**Insight and findings:**
- This is the cleanest agent-vs-agent evidence currently available because it compares agents within the same model. Use this for claims about agent scaffolding rather than raw `agent+model` rankings.

## Study 5: Task-Level Difficulty, Discrimination, and Mix Candidates

**Method:** Task-level analysis uses a different lens: items are filtered by observed coverage, bounded score behavior, observed variance, and positive correlation with overall agent+model strength. The candidate mix favors hard/medium/easy tasks that discriminate among current agents, while frontier and saturated tasks are placed in a watchlist instead of the main mix.

**Code files:**
- `src/habor_mix_analyzer/pipeline.py`

**Result paths:**
- `output/paper/tables/task_benchmark_reliable_summary.csv`
- `output/paper/tables/harbormix_candidate_tasks.csv`
- `output/studies/task_level/task_frontier_or_saturated_watchlist.csv`
- `output/paper/figures/task_reliable_difficulty_composition.png`

**Result overview and analysis:**
- benchmark=swebench-multilingual, n_tasks=270, candidate_pool_tasks=215, mean_strength_correlation=0.212
- benchmark=aider-polyglot, n_tasks=225, candidate_pool_tasks=176, mean_strength_correlation=0.434
- benchmark=simpleqa, n_tasks=200, candidate_pool_tasks=173, mean_strength_correlation=0.331
- benchmark=featurebench-modal, n_tasks=200, candidate_pool_tasks=140, mean_strength_correlation=0.322
- benchmark=labbench, n_tasks=181, candidate_pool_tasks=121, mean_strength_correlation=0.206
- benchmark=crustbench, n_tasks=100, candidate_pool_tasks=87, mean_strength_correlation=0.361
- benchmark=gpqa-diamond, n_tasks=198, candidate_pool_tasks=83, mean_strength_correlation=0.241
- benchmark=arc-agi-2, n_tasks=100, candidate_pool_tasks=83, mean_strength_correlation=0.290
- benchmark=kumo, n_tasks=212, candidate_pool_tasks=70, mean_strength_correlation=0.339
- benchmark=seal0, n_tasks=111, candidate_pool_tasks=69, mean_strength_correlation=0.262
- Selected 120 diversified HaborMix candidate tasks with a cap of 6 per benchmark.

**Insight and findings:**
- The task-level table is more useful for mix construction than benchmark-level averages because it exposes saturated, frontier, and discriminative tasks separately.
- Benchmarks with many tasks but few reliable discriminative items should not dominate a compact mix simply because they are large.

## Study 6: Task Aggregate vs Benchmark-Level Score Alignment

**Method:** For each benchmark, I average normalized task scores and correlate that aggregate with the benchmark-level normalized score across agent+model rows. This checks whether the task matrix and benchmark matrix tell the same story.

**Code files:**
- `src/habor_mix_analyzer/pipeline.py`

**Result paths:**
- `output/paper/tables/task_to_benchmark_alignment.csv`
- `output/paper/figures/task_to_benchmark_alignment.png`

**Result overview and analysis:**
- benchmark=aider-polyglot, n_reliable_bounded_tasks=218, spearman_agent_model_correlation=0.995
- benchmark=seal0, n_reliable_bounded_tasks=111, spearman_agent_model_correlation=0.984
- benchmark=bfcl, n_reliable_bounded_tasks=123, spearman_agent_model_correlation=0.955
- benchmark=featurebench-modal, n_reliable_bounded_tasks=200, spearman_agent_model_correlation=0.939
- benchmark=swebenchpro, n_reliable_bounded_tasks=8, spearman_agent_model_correlation=0.852
- benchmark=replicationbench, n_reliable_bounded_tasks=90, spearman_agent_model_correlation=0.830
- benchmark=bigcodebench, n_reliable_bounded_tasks=15, spearman_agent_model_correlation=0.808
- benchmark=bixbench, n_reliable_bounded_tasks=50, spearman_agent_model_correlation=0.781
- benchmark=lawbench, n_reliable_bounded_tasks=50, spearman_agent_model_correlation=0.776
- benchmark=labbench, n_reliable_bounded_tasks=181, spearman_agent_model_correlation=0.774

**Insight and findings:**
- Strong alignment means the task matrix can explain the benchmark-level score; weak alignment flags benchmarks where the aggregation rule or metric scale needs closer inspection before paper claims.

## Cross-Study Story

The first pass suggests three paper-relevant claims. First, coverage filtering is mandatory: several raw benchmark columns are too sparse to support benchmark-level conclusions. Second, after filtering, the most interesting structure is not a single leaderboard but model-benchmark and agent-benchmark interaction. Agent scaffolds should be discussed through paired within-model deltas, not just raw agent+model ranks. Third, task-level analysis is the right layer for HaborMix construction: reliable, bounded, discriminative tasks form a compact candidate pool, while frontier/saturated tasks are better treated as separate stress-test or monitoring sets.

## Not Completed Yet

- Trial reliability, pass@k, efficiency curves, token/tool cost analysis, and trajectory failure taxonomy still require per-trial run records.
- Full IRT/DIF still requires repeated binary/calibrated task outcomes or enough dense task observations to fit stable item-response models.
- Provider scaling analysis still requires external model metadata such as provider family, parameter scale, release date, and inference budget.
