from __future__ import annotations

from ..core import *


def analysis_data_provenance() -> pd.DataFrame:
    rows = [
        {
            "analysis": "coverage filtering",
            "primary_matrix": "raw benchmark matrix metadata",
            "processed_output": "data/processed/intermediate/benchmark_column_quality.csv",
            "notes": "Uses observed counts and original missingness to avoid overclaiming from SVD-filled cells.",
        },
        {
            "analysis": "agent+model aggregate leaderboard",
            "primary_matrix": "SVD-filled benchmark score matrix",
            "processed_output": "data/processed/intermediate/benchmark_svd_imputed_matrix.csv",
            "notes": "Ranks agent+model rows by mean within-benchmark percentile computed from benchmark scores.",
        },
        {
            "analysis": "per-benchmark mini-leaderboards",
            "primary_matrix": "SVD-filled benchmark score matrix",
            "processed_output": "data/processed/intermediate/benchmark_svd_imputed_matrix.csv",
            "notes": "Displays scores on each benchmark's original metric scale; an observed/imputed flag is retained in the long table.",
        },
        {
            "analysis": "model vs agent roles",
            "primary_matrix": "SVD-filled benchmark-relative matrix",
            "processed_output": "data/processed/intermediate/benchmark_svd_imputed_normalized_matrix.csv",
            "notes": "Uses benchmark-relative scores because fixed-effect decomposition compares variation across heterogeneous benchmark scales.",
        },
        {
            "analysis": "benchmark predictability and similarity",
            "primary_matrix": "SVD-filled benchmark-relative matrix",
            "processed_output": "data/processed/intermediate/benchmark_svd_imputed_normalized_matrix.csv",
            "notes": "Uses benchmark-relative score profiles so Spearman similarity and ridge prediction are not dominated by heterogeneous benchmark score scales.",
        },
        {
            "analysis": "terminus harness deltas",
            "primary_matrix": "SVD-filled benchmark-relative matrix",
            "processed_output": "data/processed/intermediate/benchmark_svd_imputed_normalized_matrix.csv",
            "notes": "Uses paired deltas on the same benchmark/model cells; raw deltas across benchmarks are not comparable.",
        },
        {
            "analysis": "task similarity and representatives",
            "primary_matrix": "SVD-filled task benchmark-relative matrix plus task quality metadata",
            "processed_output": "data/processed/intermediate/task_svd_imputed_normalized_matrix.csv",
            "notes": "Uses reliable bounded non-degenerate task columns; observed task statistics are kept for filtering and interpretation.",
        },
        {
            "analysis": "HaborMix candidate selection",
            "primary_matrix": "processed task item statistics",
            "processed_output": "data/processed/intermediate/task_item_stats.csv",
            "notes": "Uses observed difficulty/variance plus processed strength-correlation features.",
        },
    ]
    return pd.DataFrame(rows)


def imputation_diagnostics_summary(
    benchmark_result: ImputationResult,
    task_result: ImputationResult,
) -> pd.DataFrame:
    rows = []
    for name, result in [("benchmark", benchmark_result), ("task", task_result)]:
        best = result.cv.sort_values(["rmse", "rank"]).iloc[0]
        second = result.cv.sort_values(["rmse", "rank"]).iloc[1] if len(result.cv) > 1 else best
        rows.append(
            {
                "matrix": name,
                "agent_model_rows": int(result.raw.shape[0]),
                "score_columns": int(result.raw.shape[1] - len(KEY_COLUMNS)),
                "missing_fraction_before_svd": result.missing_fraction,
                "selected_svd_rank": int(result.best_rank),
                "holdout_cells": int(best["holdout_cells"]),
                "holdout_rmse_scaled_score_space": float(best["rmse"]),
                "holdout_mae_scaled_score_space": float(best["mae"]),
                "rmse_gap_to_second_best_rank": float(second["rmse"] - best["rmse"]),
                "interpretation": (
                    "Used for benchmark-level score analyses after filtering sparse benchmark columns."
                    if name == "benchmark"
                    else "Used with task-level reliability filters; task matrix is much wider and sparser, so item-level conclusions are restricted to reliable bounded non-degenerate tasks."
                ),
            }
        )
    return pd.DataFrame(rows)
