# Key Findings for Paper Drafting

1. Use 39 coverage-filtered benchmarks for benchmark-level claims; keep sparse benchmarks in appendix/provisional analysis.
2. Model identity is the larger overall factor, but the model-vs-agent balance varies by benchmark; use the per-benchmark role plot for qualified claims.
3. Separate model and agent dimensions. The useful agent evidence is paired lift over `terminus-2` for the same model, not an unqualified agent+model leaderboard.
4. BenchPress-style predictability applies here: redundant benchmarks can be compressed; least-predictable benchmarks should be preserved for behavioral breadth.
5. Task predictability and task representativeness are distinct: hard-to-predict tasks are stress tests, while representative tasks are compact proxies for a benchmark.
6. The current task-level filter yields 120 diversified candidate tasks for HaborMix-style selection.
7. Task-to-benchmark alignment should be used as a sanity check before interpreting benchmark-level scores from task-level tables.

Primary reference file: `output/paper/reports/analysis_story.md`.