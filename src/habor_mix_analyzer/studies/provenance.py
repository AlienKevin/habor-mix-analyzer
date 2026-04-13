from __future__ import annotations

from ..core import *


def analysis_data_provenance() -> pd.DataFrame:
    rows = [
        {
            "analysis": "coverage filtering",
            "primary_matrix": "task-observed benchmark aggregate metadata",
            "processed_output": "data/processed/intermediate/benchmark_from_task_aggregate_column_quality.csv",
            "notes": "Uses task-observed aggregate counts and task-cell missingness to avoid overclaiming from filled task cells.",
        },
        {
            "analysis": "agent+model aggregate leaderboard",
            "primary_matrix": "benchmark scores aggregated from filled task matrix",
            "processed_output": "data/processed/intermediate/benchmark_from_task_aggregate_matrix.csv",
            "notes": "Ranks agent+model rows by mean within-benchmark percentile computed from benchmark scores.",
        },
        {
            "analysis": "per-benchmark mini-leaderboards",
            "primary_matrix": "benchmark scores aggregated from filled task matrix",
            "processed_output": "data/processed/intermediate/benchmark_from_task_aggregate_matrix.csv",
            "notes": "Displays scores on each benchmark's original metric scale after task-level imputation and aggregation.",
        },
        {
            "analysis": "model vs agent roles",
            "primary_matrix": "benchmark-relative matrix aggregated from filled tasks",
            "processed_output": "data/processed/intermediate/benchmark_from_task_aggregate_normalized_matrix.csv",
            "notes": "Uses benchmark-relative scores because fixed-effect decomposition compares variation across heterogeneous benchmark scales.",
        },
        {
            "analysis": "benchmark predictability and similarity",
            "primary_matrix": "benchmark-relative matrix aggregated from filled tasks",
            "processed_output": "data/processed/intermediate/benchmark_from_task_aggregate_normalized_matrix.csv",
            "notes": "Uses benchmark-relative score profiles so Spearman similarity and ridge prediction are not dominated by heterogeneous benchmark score scales.",
        },
        {
            "analysis": "terminus harness deltas",
            "primary_matrix": "benchmark-relative matrix aggregated from filled tasks",
            "processed_output": "data/processed/intermediate/benchmark_from_task_aggregate_normalized_matrix.csv",
            "notes": "Uses paired deltas on the same benchmark/model cells; score deltas across heterogeneous benchmark scales are not comparable without normalization.",
        },
        {
            "analysis": "task similarity and representatives",
            "primary_matrix": "filled task benchmark-relative matrix plus task quality metadata",
            "processed_output": "data/processed/intermediate/task_imputed_normalized_matrix.csv",
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
        cv = result.cv.sort_values(["mae", "rmse", "rank"], na_position="last")
        best = cv.iloc[0]
        second = cv.iloc[1] if len(cv) > 1 else best
        is_benchmark_aggregate = name == "benchmark" and pd.isna(best["rmse"])
        rows.append(
            {
                "matrix": name,
                "agent_model_rows": int(result.raw.shape[0]),
                "score_columns": int(result.raw.shape[1] - len(KEY_COLUMNS)),
                "preprocessing_method": (
                    "task_imputation_then_benchmark_aggregate" if is_benchmark_aggregate else str(best["method"])
                ),
                "missing_fraction_before_processing": result.missing_fraction,
                "selected_imputation_method": np.nan if is_benchmark_aggregate else str(best["method"]),
                "selected_imputation_rank": int(result.best_rank) if not is_benchmark_aggregate else np.nan,
                "task_imputation_method_used_for_benchmark_aggregation": (
                    str(best["task_imputation_method"]) if is_benchmark_aggregate and "task_imputation_method" in best else np.nan
                ),
                "task_imputation_rank_used_for_benchmark_aggregation": (
                    int(best["rank"]) if is_benchmark_aggregate else np.nan
                ),
                "holdout_cells": int(best["holdout_cells"]),
                "holdout_rmse_scaled_score_space": float(best["rmse"]) if not is_benchmark_aggregate else np.nan,
                "holdout_mae_scaled_score_space": float(best["mae"]) if not is_benchmark_aggregate else np.nan,
                "mae_gap_to_second_best_method": (
                    float(second["mae"] - best["mae"]) if not is_benchmark_aggregate else np.nan
                ),
                "interpretation": (
                    "Benchmark scores are not imputed directly; they are means of task scores after task-level filling."
                    if name == "benchmark"
                    else "Task-level method is selected by held-out observed-cell validation; task matrix is wide and sparse, so item-level conclusions are restricted to reliable bounded non-degenerate tasks."
                ),
            }
        )
    return pd.DataFrame(rows)
