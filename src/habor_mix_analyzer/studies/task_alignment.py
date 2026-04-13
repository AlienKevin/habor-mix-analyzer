from __future__ import annotations

from ..core import *
from .intermediate_tables import corr_or_nan, task_metadata


def task_aggregate_alignment(
    benchmark_result: ImputationResult,
    task_result: ImputationResult,
    item_stats: pd.DataFrame,
    included_benchmarks: list[str],
) -> pd.DataFrame:
    task_cols = score_columns(task_result.normalized)
    meta = task_metadata(task_cols)
    rows = []
    for benchmark, group in meta.groupby("benchmark"):
        columns = group["task_column"].tolist()
        task_aggregate = task_result.normalized[columns].mean(axis=1).to_numpy(dtype=float)
        benchmark_values = benchmark_result.normalized[benchmark].to_numpy(dtype=float)
        reliable_tasks = int(
            (
                (item_stats["benchmark"] == benchmark)
                & (item_stats["observed_count"] >= 12)
                & (item_stats["negative_count"] == 0)
                & (item_stats["gt_one_count"] == 0)
            ).sum()
        )
        rows.append(
            {
                "benchmark": benchmark,
                "included_in_benchmark_level_paper_filter": benchmark in included_benchmarks,
                "n_tasks": len(columns),
                "n_reliable_bounded_tasks": reliable_tasks,
                "pearson_agent_model_correlation": corr_or_nan(task_aggregate, benchmark_values),
                "spearman_agent_model_correlation": (
                    np.nan
                    if np.nanstd(task_aggregate) < 1e-12 or np.nanstd(benchmark_values) < 1e-12
                    else float(pd.Series(task_aggregate).corr(pd.Series(benchmark_values), method="spearman"))
                ),
            }
        )
    return pd.DataFrame(rows).sort_values("spearman_agent_model_correlation", ascending=False)
