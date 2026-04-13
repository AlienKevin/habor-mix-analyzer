from __future__ import annotations

from ..core import *
from .intermediate_tables import corr_or_nan


def task_similarity_and_representatives(
    task_result: ImputationResult,
    tasks_enriched: pd.DataFrame,
    benchmark_clusters: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    reliable = tasks_enriched[
        tasks_enriched["is_bounded_score_task"]
        & tasks_enriched["is_reliable_observed_task"]
        & (tasks_enriched["observed_std"] >= 0.05)
    ].copy()
    reliable_columns = [col for col in reliable["task_column"] if col in task_result.normalized.columns]
    matrix = task_result.normalized[reliable_columns].astype(float)
    standardized = (matrix - matrix.mean(axis=0)) / matrix.std(axis=0, ddof=0).replace(0, np.nan)
    standardized = standardized.fillna(0)
    task_profiles = standardized.to_numpy().T
    corr = (task_profiles @ task_profiles.T) / task_profiles.shape[1]
    corr = np.clip(np.nan_to_num(corr), -1, 1)
    np.fill_diagonal(corr, 1)
    task_index = pd.Index(reliable_columns)
    bench_for_task = reliable.set_index("task_column").loc[task_index, "benchmark"]

    within_rows = []
    representative_rows = []
    predictability_rows = []
    positions_by_benchmark: dict[str, list[int]] = {}
    for position, benchmark in enumerate(bench_for_task.to_numpy()):
        positions_by_benchmark.setdefault(str(benchmark), []).append(position)

    for benchmark, positions in positions_by_benchmark.items():
        idx = np.array(positions, dtype=int)
        if len(idx) < 2:
            continue
        sub = np.abs(corr[np.ix_(idx, idx)])
        np.fill_diagonal(sub, np.nan)
        mean_peer = np.nanmean(sub, axis=1)
        max_peer = np.nanmax(sub, axis=1)
        within_rows.append(
            {
                "benchmark": benchmark,
                "n_reliable_tasks": len(idx),
                "median_abs_task_similarity_within_benchmark": float(np.nanmedian(sub)),
                "mean_abs_task_similarity_within_benchmark": float(np.nanmean(sub)),
            }
        )
        aggregate = task_profiles[idx].mean(axis=0)
        aggregate_corr = np.array([corr_or_nan(task_profiles[i], aggregate) for i in idx])
        for local_pos, task_idx in enumerate(idx):
            task_col = task_index[task_idx]
            task_row = reliable[reliable["task_column"] == task_col].iloc[0]
            representative_rows.append(
                {
                    "benchmark": benchmark,
                    "task_column": task_col,
                    "task_id": task_row["task_id"],
                    "representativeness_score": float(abs(aggregate_corr[local_pos])),
                    "mean_abs_similarity_to_peer_tasks": float(mean_peer[local_pos]),
                    "difficulty_tier": task_row["difficulty_tier"],
                    "task_score": task_row["imputed_mean"],
                    "observed_mean": task_row["observed_mean"],
                    "observed_std": task_row["observed_std"],
                    "strength_correlation": task_row["strength_correlation"],
                }
            )
            predictability_rows.append(
                {
                    "benchmark": benchmark,
                    "task_column": task_col,
                    "task_id": task_row["task_id"],
                    "task_predictability_proxy_max_abs_peer_spearman": float(max_peer[local_pos]),
                    "task_unpredictability_score": float(1 - max_peer[local_pos]),
                    "observed_count": int(task_row["observed_count"]),
                    "difficulty_tier": task_row["difficulty_tier"],
                    "task_score": task_row["imputed_mean"],
                    "observed_mean": task_row["observed_mean"],
                    "observed_std": task_row["observed_std"],
                }
            )

    sampled = (
        reliable.sort_values(["mix_selection_score", "observed_count"], ascending=False)
        .groupby("benchmark")
        .head(40)
        .reset_index(drop=True)
    )
    sampled_cols = [col for col in sampled["task_column"] if col in task_index]
    sampled_positions = task_index.get_indexer(sampled_cols)
    pair_rows = []
    for left_bench, left_group in sampled.groupby("benchmark"):
        left_idx = task_index.get_indexer(left_group["task_column"])
        for right_bench, right_group in sampled.groupby("benchmark"):
            if right_bench < left_bench:
                continue
            right_idx = task_index.get_indexer(right_group["task_column"])
            pair_corr = np.abs(corr[np.ix_(left_idx, right_idx)])
            if left_bench == right_bench:
                pair_corr = pair_corr[~np.eye(pair_corr.shape[0], dtype=bool)]
            pair_rows.append(
                {
                    "left_benchmark": left_bench,
                    "right_benchmark": right_bench,
                    "median_abs_task_similarity": float(np.nanmedian(pair_corr)) if pair_corr.size else np.nan,
                    "mean_abs_task_similarity": float(np.nanmean(pair_corr)) if pair_corr.size else np.nan,
                    "sampled_left_tasks": len(left_idx),
                    "sampled_right_tasks": len(right_idx),
                }
            )

    within = pd.DataFrame(within_rows).sort_values("median_abs_task_similarity_within_benchmark", ascending=False)
    representatives = pd.DataFrame(representative_rows).sort_values("representativeness_score", ascending=False)
    task_predictability = pd.DataFrame(predictability_rows).sort_values("task_unpredictability_score", ascending=False)
    cross = pd.DataFrame(pair_rows).sort_values("median_abs_task_similarity", ascending=False)
    return within, representatives, task_predictability, cross
