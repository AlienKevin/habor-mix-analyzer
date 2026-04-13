from __future__ import annotations

from ..core import *


def agent_model_scores_for_cols(
    raw_benchmark: pd.DataFrame,
    benchmark_result: ImputationResult,
    cols: list[str],
) -> pd.DataFrame:
    out = benchmark_result.normalized[KEY_COLUMNS].copy()
    out["agent_model"] = out["agent"] + " + " + out["model"]
    benchmark_scores = benchmark_result.raw[cols].astype(float)
    score_percentile = benchmark_scores.rank(axis=0, ascending=True, pct=True)
    out["mean_score_percentile_across_benchmarks"] = score_percentile.mean(axis=1)
    out["median_score_percentile_across_benchmarks"] = score_percentile.median(axis=1)
    out["mean_benchmark_relative_score"] = benchmark_result.normalized[cols].mean(axis=1)
    out["median_benchmark_relative_score"] = benchmark_result.normalized[cols].median(axis=1)
    out["observed_fraction_on_included_benchmarks"] = raw_benchmark[cols].notna().mean(axis=1)
    out["rank"] = out["mean_score_percentile_across_benchmarks"].rank(ascending=False, method="min").astype(int)
    return out.sort_values("rank")


def benchmark_scores_long(
    raw_benchmark: pd.DataFrame,
    benchmark_result: ImputationResult,
    cols: list[str],
) -> pd.DataFrame:
    rows: list[pd.DataFrame] = []
    for benchmark in cols:
        part = benchmark_result.raw[KEY_COLUMNS].copy()
        part["agent_model"] = part["agent"] + " + " + part["model"]
        part["benchmark"] = benchmark
        part["benchmark_score"] = benchmark_result.raw[benchmark]
        part["observed_benchmark_score"] = raw_benchmark[benchmark]
        part["benchmark_relative_score_for_cross_benchmark_methods"] = benchmark_result.normalized[benchmark]
        part["was_svd_filled"] = raw_benchmark[benchmark].isna()
        rows.append(part)
    return pd.concat(rows, ignore_index=True)
