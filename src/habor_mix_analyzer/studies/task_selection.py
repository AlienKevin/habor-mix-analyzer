from __future__ import annotations

from ..core import *


def task_reliability_tables(item_stats: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    tasks = item_stats.copy()
    tasks["is_bounded_score_task"] = (
        (tasks["negative_count"] == 0)
        & (tasks["gt_one_count"] == 0)
        & (tasks["observed_min"] >= 0)
        & (tasks["observed_max"] <= 1)
    )
    tasks["is_reliable_observed_task"] = tasks["observed_count"] >= 12
    tasks["is_discriminative_task"] = tasks["observed_std"] >= 0.03
    tasks["is_mix_candidate_pool"] = tasks["is_bounded_score_task"] & tasks["is_reliable_observed_task"]

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

    frontier = (
        tasks[
            tasks["is_bounded_score_task"]
            & tasks["is_reliable_observed_task"]
            & tasks["difficulty_tier"].isin(["frontier", "saturated"])
        ]
        .sort_values(["difficulty_tier", "observed_count", "strength_correlation"], ascending=[True, False, False])
        .head(200)
    )
    return tasks, summary.sort_values("candidate_pool_tasks", ascending=False), frontier


def _rank01(series: pd.Series, ascending: bool = True) -> pd.Series:
    valid = series.replace([np.inf, -np.inf], np.nan)
    if valid.notna().sum() <= 1:
        return pd.Series(0.5, index=series.index)
    return valid.rank(pct=True, ascending=ascending).fillna(0.0)


def select_harbormix_tasks(
    tasks_enriched: pd.DataFrame,
    representative_tasks: pd.DataFrame,
    task_predictability: pd.DataFrame,
    base_representatives_per_benchmark: int = 2,
) -> pd.DataFrame:
    rep_cols = [
        "benchmark",
        "task_column",
        "representativeness_score",
        "useful_representativeness_score",
        "leave_one_out_aggregate_correlation",
    ]
    pred_cols = [
        "benchmark",
        "task_column",
        "task_unpredictability_score",
        "task_predictability_proxy_max_abs_peer_spearman",
    ]
    tasks = (
        tasks_enriched.merge(representative_tasks[rep_cols], on=["benchmark", "task_column"], how="left")
        .merge(task_predictability[pred_cols], on=["benchmark", "task_column"], how="left")
        .copy()
    )
    tasks["difficulty_signal"] = (1.0 - tasks["imputed_mean"].astype(float)).clip(0, 1)
    tasks["discrimination_signal"] = tasks.groupby("benchmark", group_keys=False)["observed_std"].apply(_rank01)
    tasks["representative_signal"] = tasks.groupby("benchmark", group_keys=False)["useful_representativeness_score"].apply(_rank01)
    tasks["unique_unpredictable_signal"] = tasks.groupby("benchmark", group_keys=False)["task_unpredictability_score"].apply(_rank01)
    tasks["mix_selection_score"] = (
        0.35 * tasks["representative_signal"]
        + 0.25 * tasks["difficulty_signal"]
        + 0.25 * tasks["unique_unpredictable_signal"]
        + 0.15 * tasks["discrimination_signal"]
    )

    eligible = tasks[tasks["is_mix_candidate_pool"]].copy()
    eligible["representative_rank_within_benchmark"] = eligible.groupby("benchmark")[
        "useful_representativeness_score"
    ].rank(ascending=False, method="first")
    eligible["unique_rank_within_benchmark"] = eligible.groupby("benchmark")["task_unpredictability_score"].rank(
        ascending=False, method="first"
    )
    eligible["composite_rank_within_benchmark"] = eligible.groupby("benchmark")["mix_selection_score"].rank(
        ascending=False, method="first"
    )
    eligible["difficult_task"] = eligible["imputed_mean"] <= 0.30
    eligible["frontier_task_with_signal"] = (eligible["imputed_mean"] < 0.05) & (eligible["observed_std"] >= 0.03)
    eligible["base_representative_task"] = (
        eligible["representative_rank_within_benchmark"] <= base_representatives_per_benchmark
    )
    eligible["unique_unpredictable_task"] = eligible["unique_unpredictable_signal"] >= 0.80
    eligible["high_composite_task"] = eligible["composite_rank_within_benchmark"] <= np.ceil(
        0.15 * eligible.groupby("benchmark")["task_column"].transform("size")
    )

    def reason(row: pd.Series) -> str:
        reasons = []
        if row["base_representative_task"]:
            reasons.append("base_representative")
        if row["difficult_task"]:
            reasons.append("difficult")
        if row["frontier_task_with_signal"]:
            reasons.append("frontier_with_variance")
        if row["unique_unpredictable_task"]:
            reasons.append("unique_unpredictable")
        if row["high_composite_task"]:
            reasons.append("high_composite")
        return ";".join(reasons)

    eligible["selection_reason"] = eligible.apply(reason, axis=1)
    selected = eligible[eligible["selection_reason"] != ""].copy()
    selected = selected.sort_values(
        ["benchmark", "base_representative_task", "mix_selection_score"],
        ascending=[True, False, False],
    ).reset_index(drop=True)
    selected["selection_rank"] = np.arange(1, len(selected) + 1)
    return selected[
        [
            "selection_rank",
            "benchmark",
            "task_id",
            "task_column",
            "selection_reason",
            "mix_selection_score",
            "difficulty_tier",
            "difficulty_signal",
            "representative_signal",
            "unique_unpredictable_signal",
            "discrimination_signal",
            "observed_count",
            "imputed_mean",
            "observed_mean",
            "observed_std",
            "strength_correlation",
            "useful_representativeness_score",
            "task_unpredictability_score",
            "representative_rank_within_benchmark",
            "unique_rank_within_benchmark",
            "composite_rank_within_benchmark",
        ]
    ]
