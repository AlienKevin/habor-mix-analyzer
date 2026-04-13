from __future__ import annotations

from ..core import *


def task_reliability_tables(item_stats: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    tasks = item_stats.copy()
    tasks["is_bounded_score_task"] = (
        (tasks["negative_count"] == 0)
        & (tasks["gt_one_count"] == 0)
        & (tasks["observed_min"] >= 0)
        & (tasks["observed_max"] <= 1)
    )
    tasks["is_reliable_observed_task"] = tasks["observed_count"] >= 12
    tasks["is_discriminative_task"] = (tasks["observed_std"] >= 0.05) & (tasks["strength_correlation"] >= 0.10)
    tasks["is_mix_candidate_pool"] = (
        tasks["is_bounded_score_task"]
        & tasks["is_reliable_observed_task"]
        & tasks["is_discriminative_task"]
        & tasks["difficulty_tier"].isin(["hard", "medium", "easy"])
    )
    difficulty_bonus = tasks["difficulty_tier"].map({"hard": 0.35, "medium": 0.45, "easy": 0.15}).fillna(0.0)
    tasks["mix_selection_score"] = (
        tasks["strength_correlation"].clip(lower=0).fillna(0)
        + tasks["observed_std"].fillna(0)
        + difficulty_bonus
        + 0.05 * (tasks["observed_count"] / 26.0)
    )

    summary = (
        tasks.groupby("benchmark")
        .agg(
            n_tasks=("task_column", "size"),
            reliable_bounded_tasks=("is_reliable_observed_task", "sum"),
            candidate_pool_tasks=("is_mix_candidate_pool", "sum"),
            mean_observed_count=("observed_count", "mean"),
            mean_missing_fraction=("missing_fraction", "mean"),
            mean_strength_correlation=("strength_correlation", "mean"),
            median_task_score=("imputed_mean", "median"),
        )
        .reset_index()
    )
    tiers = (
        tasks[tasks["is_reliable_observed_task"] & tasks["is_bounded_score_task"]]
        .pivot_table(index="benchmark", columns="difficulty_tier", values="task_column", aggfunc="count", fill_value=0)
        .reset_index()
    )
    summary = summary.merge(tiers, on="benchmark", how="left").fillna(0)

    candidates = tasks[tasks["is_mix_candidate_pool"]].copy()
    selected_groups = []
    for _, group in candidates.sort_values("mix_selection_score", ascending=False).groupby("benchmark"):
        selected_groups.append(group.head(6))
    selected = (
        pd.concat(selected_groups, ignore_index=True)
        .sort_values("mix_selection_score", ascending=False)
        .head(120)
        .reset_index(drop=True)
        if selected_groups
        else candidates
    )
    selected["selection_rank"] = np.arange(1, len(selected) + 1)
    selected = selected[
        [
            "selection_rank",
            "benchmark",
            "task_id",
            "task_column",
            "mix_selection_score",
            "difficulty_tier",
            "observed_count",
            "imputed_mean",
            "observed_mean",
            "observed_std",
            "strength_correlation",
        ]
    ]

    frontier = (
        tasks[
            tasks["is_bounded_score_task"]
            & tasks["is_reliable_observed_task"]
            & tasks["difficulty_tier"].isin(["frontier", "saturated"])
        ]
        .sort_values(["difficulty_tier", "observed_count", "strength_correlation"], ascending=[True, False, False])
        .head(200)
    )
    return tasks, summary.sort_values("candidate_pool_tasks", ascending=False), selected, frontier
