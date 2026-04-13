from __future__ import annotations

from ..core import *

from .intermediate_tables import design_matrix, fit_r2, variance_decomposition


def adjusted_group_effects(long_df: pd.DataFrame, group_col: str, controls: list[str]) -> pd.DataFrame:
    df = long_df.dropna(subset=["normalized_score"]).copy()
    y = df["normalized_score"].astype(float)
    x = design_matrix(df, controls)
    if x.empty:
        df["adjusted_score"] = y
    else:
        model = LinearRegression()
        model.fit(x, y)
        df["adjusted_score"] = y - model.predict(x) + float(y.mean())
    return (
        df.groupby(group_col)
        .agg(
            adjusted_mean=("adjusted_score", "mean"),
            adjusted_std=("adjusted_score", "std"),
            raw_normalized_mean=("normalized_score", "mean"),
            observations=("normalized_score", "size"),
        )
        .reset_index()
        .sort_values("adjusted_mean", ascending=False)
    )


def filtered_variance_decomposition(benchmark_long_df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    return variance_decomposition(benchmark_long_df[benchmark_long_df["benchmark"].isin(cols)].copy())


def benchmark_model_agent_role_by_benchmark(long_df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    rows = []
    for benchmark in cols:
        df = long_df[long_df["benchmark"] == benchmark].copy()
        y = df["normalized_score"].astype(float)
        model_r2 = fit_r2(df, y, ["model"])
        agent_r2 = fit_r2(df, y, ["agent"])
        full_r2 = fit_r2(df, y, ["model", "agent"])
        rows.append(
            {
                "benchmark": benchmark,
                "model_only_r2": model_r2,
                "agent_only_r2": agent_r2,
                "model_partial_r2_over_agent": full_r2 - agent_r2,
                "agent_partial_r2_over_model": full_r2 - model_r2,
                "full_model_plus_agent_r2": full_r2,
                "dominant_dimension": "model"
                if full_r2 - agent_r2 > full_r2 - model_r2
                else "agent",
            }
        )
    return pd.DataFrame(rows).sort_values("model_partial_r2_over_agent", ascending=False)
