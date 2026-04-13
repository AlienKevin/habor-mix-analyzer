from __future__ import annotations

from ..core import *


def summarize_agent_lift(agent_diff: pd.DataFrame, cols: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    filtered = agent_diff[agent_diff["benchmark"].isin(cols)].copy()
    summary = (
        filtered.groupby("agent")
        .agg(
            mean_delta_vs_terminus=("delta_normalized", "mean"),
            median_delta_vs_terminus=("delta_normalized", "median"),
            win_rate_vs_terminus=("delta_normalized", lambda s: float((s > 0).mean())),
            compared_model_benchmark_pairs=("delta_normalized", "size"),
            compared_models=("model", "nunique"),
        )
        .reset_index()
        .sort_values("mean_delta_vs_terminus", ascending=False)
    )
    by_benchmark = (
        filtered.groupby(["agent", "benchmark"])
        .agg(
            mean_delta_vs_terminus=("delta_normalized", "mean"),
            compared_models=("model", "nunique"),
        )
        .reset_index()
        .sort_values("mean_delta_vs_terminus", ascending=False)
    )
    return summary, by_benchmark


def terminus_delta_by_model(agent_diff: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    filtered = agent_diff[agent_diff["benchmark"].isin(cols)].copy()
    return (
        filtered.groupby(["model", "agent"])
        .agg(
            mean_delta_vs_terminus=("delta_normalized", "mean"),
            median_delta_vs_terminus=("delta_normalized", "median"),
            win_rate_vs_terminus=("delta_normalized", lambda s: float((s > 0).mean())),
            compared_benchmarks=("benchmark", "nunique"),
        )
        .reset_index()
        .sort_values("mean_delta_vs_terminus", ascending=False)
    )
