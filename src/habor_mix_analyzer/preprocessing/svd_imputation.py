from __future__ import annotations

from ..core import *


def robust_column_stats(values: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, float | int | str]] = []
    for col in values.columns:
        series = pd.to_numeric(values[col], errors="coerce")
        raw_observed = series.dropna()
        count = int(raw_observed.shape[0])
        if count:
            raw_q25 = float(raw_observed.quantile(0.25))
            raw_q75 = float(raw_observed.quantile(0.75))
            raw_std = float(raw_observed.std(ddof=0))
            min_value = float(raw_observed.min())
            max_value = float(raw_observed.max())
            transform = "log1p" if min_value >= 0 and max_value > 1 else "identity"
            transformed = np.log1p(series) if transform == "log1p" else series
            observed = transformed.dropna()
            center = float(observed.median())
            scale = float(observed.quantile(0.75) - observed.quantile(0.25))
            if not np.isfinite(scale) or scale < 1e-9:
                scale = float(observed.std(ddof=0))
            if not np.isfinite(scale) or scale < 1e-9:
                scale = float(observed.max() - observed.min())
            if not np.isfinite(scale) or scale < 1e-9:
                scale = 1.0
        else:
            transform = "identity"
            center = 0.0
            scale = 1.0
            raw_q25 = raw_q75 = raw_std = min_value = max_value = np.nan
        rows.append(
            {
                "column": col,
                "observed_count": count,
                "missing_count": int(series.isna().sum()),
                "missing_fraction": float(series.isna().mean()),
                "mean": float(raw_observed.mean()) if count else np.nan,
                "std": raw_std,
                "median": float(raw_observed.median()) if count else np.nan,
                "q25": raw_q25,
                "q75": raw_q75,
                "min": min_value,
                "max": max_value,
                "transform": transform,
                "center": center,
                "scale": float(scale),
                "negative_count": int((series < 0).sum()),
                "gt_one_count": int((series > 1).sum()),
            }
        )
    return pd.DataFrame(rows)


def apply_column_transforms(values: pd.DataFrame, stats: pd.DataFrame) -> pd.DataFrame:
    transformed = values.astype(float).copy()
    stat_index = stats.set_index("column")
    for col in transformed.columns:
        if stat_index.loc[col, "transform"] == "log1p":
            transformed[col] = np.log1p(transformed[col])
    return transformed


def invert_column_transforms(values: pd.DataFrame, stats: pd.DataFrame) -> pd.DataFrame:
    raw = values.astype(float).copy()
    stat_index = stats.set_index("column")
    for col in raw.columns:
        if stat_index.loc[col, "transform"] == "log1p":
            raw[col] = np.expm1(raw[col])
    return raw


def normalize(values: pd.DataFrame, stats: pd.DataFrame) -> pd.DataFrame:
    centers = stats.set_index("column")["center"].reindex(values.columns)
    scales = stats.set_index("column")["scale"].reindex(values.columns)
    transformed = apply_column_transforms(values, stats)
    normalized = (transformed - centers) / scales
    return normalized


def choose_holdout(mask: np.ndarray, fraction: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    row_counts = mask.sum(axis=1).astype(int)
    col_counts = mask.sum(axis=0).astype(int)
    candidates = np.argwhere(mask)
    rng.shuffle(candidates)
    target = max(1, int(round(fraction * len(candidates))))
    holdout = np.zeros_like(mask, dtype=bool)
    held = 0
    for row, col in candidates:
        if held >= target:
            break
        if row_counts[row] <= 2 or col_counts[col] <= 2:
            continue
        holdout[row, col] = True
        row_counts[row] -= 1
        col_counts[col] -= 1
        held += 1
    return holdout


def iterative_svd_impute(
    matrix: np.ndarray,
    rank: int,
    initial_fill: np.ndarray | None = None,
    max_iter: int = 3,
    tolerance: float = 1e-5,
) -> np.ndarray:
    observed = np.isfinite(matrix)
    if initial_fill is None:
        filled = np.where(observed, matrix, 0.0)
    else:
        filled = np.where(observed, matrix, initial_fill)
    missing = ~observed
    if not missing.any():
        return filled

    rank = max(1, min(rank, min(matrix.shape) - 1))
    previous_missing = filled[missing].copy()
    for _ in range(max_iter):
        reconstructed = low_rank_reconstruct(filled, rank)
        filled[missing] = reconstructed[missing]
        clip_missing_to_observed_range(filled, matrix)
        delta = np.linalg.norm(filled[missing] - previous_missing)
        denom = np.linalg.norm(previous_missing) + 1e-9
        if delta / denom < tolerance:
            break
        previous_missing = filled[missing].copy()
    filled[observed] = matrix[observed]
    return filled


def low_rank_reconstruct(matrix: np.ndarray, rank: int) -> np.ndarray:
    gram = matrix @ matrix.T
    eigenvalues, eigenvectors = np.linalg.eigh(gram)
    order = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[order]
    eigenvectors = eigenvectors[:, order]
    singular_values = np.sqrt(np.maximum(eigenvalues[:rank], 0))
    u = eigenvectors[:, :rank]
    return (u * singular_values) @ ((u.T @ matrix) / np.maximum(singular_values[:, None], 1e-12))


def clip_missing_to_observed_range(filled: np.ndarray, reference: np.ndarray) -> np.ndarray:
    missing = ~np.isfinite(reference)
    if not missing.any():
        return filled
    finite = np.isfinite(reference)
    has_observed = finite.any(axis=0)
    if not has_observed.any():
        return filled
    col_min = np.where(has_observed, np.where(finite, reference, np.inf).min(axis=0), -np.inf)
    col_max = np.where(has_observed, np.where(finite, reference, -np.inf).max(axis=0), np.inf)
    clipped = np.minimum(np.maximum(filled, col_min), col_max)
    clipped_mask = missing & has_observed[None, :]
    filled[clipped_mask] = clipped[clipped_mask]
    return filled


def column_median_impute(matrix: np.ndarray) -> np.ndarray:
    observed = np.isfinite(matrix)
    filled = np.where(observed, matrix, 0.0)
    return clip_missing_to_observed_range(filled, matrix)


def row_mean_shrunk_impute(matrix: np.ndarray, shrinkage: float = 5.0) -> np.ndarray:
    observed = np.isfinite(matrix)
    row_counts = observed.sum(axis=1).astype(float)
    row_sums = np.where(observed, matrix, 0.0).sum(axis=1)
    row_means = np.divide(row_sums, row_counts, out=np.zeros_like(row_sums), where=row_counts > 0)
    weights = row_counts / (row_counts + shrinkage)
    fill = weights[:, None] * row_means[:, None]
    filled = np.where(observed, matrix, fill)
    return clip_missing_to_observed_range(filled, matrix)


def two_way_shrunk_impute(matrix: np.ndarray, row_shrinkage: float = 5.0, col_shrinkage: float = 5.0) -> np.ndarray:
    observed = np.isfinite(matrix)
    row_counts = observed.sum(axis=1).astype(float)
    row_sums = np.where(observed, matrix, 0.0).sum(axis=1)
    row_means = np.divide(row_sums, row_counts, out=np.zeros_like(row_sums), where=row_counts > 0)
    row_weights = row_counts / (row_counts + row_shrinkage)

    col_counts = observed.sum(axis=0).astype(float)
    col_sums = np.where(observed, matrix, 0.0).sum(axis=0)
    col_means = np.divide(col_sums, col_counts, out=np.zeros_like(col_sums), where=col_counts > 0)
    col_weights = col_counts / (col_counts + col_shrinkage)

    fill = row_weights[:, None] * row_means[:, None] + col_weights[None, :] * col_means[None, :]
    filled = np.where(observed, matrix, fill)
    return clip_missing_to_observed_range(filled, matrix)


def impute_by_method(matrix: np.ndarray, method: str, rank: int | None = None) -> np.ndarray:
    if method == "column_median":
        return column_median_impute(matrix)
    if method == "row_mean_shrunk":
        return row_mean_shrunk_impute(matrix)
    if method == "two_way_shrunk":
        return two_way_shrunk_impute(matrix)
    if method == "iterative_svd":
        if rank is None:
            raise ValueError("iterative_svd requires a rank.")
        return iterative_svd_impute(matrix, rank=rank)
    if method == "two_way_initialized_svd":
        if rank is None:
            raise ValueError("two_way_initialized_svd requires a rank.")
        initial = two_way_shrunk_impute(matrix)
        return iterative_svd_impute(matrix, rank=rank, initial_fill=initial)
    raise ValueError(f"Unknown imputation method: {method}")


def cross_validate_imputers(
    normalized: pd.DataFrame,
    ranks: list[int],
    holdout_fraction: float,
    seed: int,
) -> pd.DataFrame:
    matrix = normalized.to_numpy(dtype=float)
    observed = np.isfinite(matrix)
    holdout = choose_holdout(observed, holdout_fraction, seed)
    train = matrix.copy()
    train[holdout] = np.nan
    records: list[dict[str, float | int | str]] = []
    method_grid: list[tuple[str, int]] = [
        ("column_median", 0),
        ("row_mean_shrunk", 0),
        ("two_way_shrunk", 0),
    ]
    method_grid.extend(("iterative_svd", rank) for rank in ranks)
    for method, rank in method_grid:
        imputed = impute_by_method(train, method=method, rank=rank or None)
        errors = imputed[holdout] - matrix[holdout]
        records.append(
            {
                "method": method,
                "rank": rank,
                "holdout_cells": int(holdout.sum()),
                "rmse": float(np.sqrt(np.mean(errors**2))),
                "mae": float(np.mean(np.abs(errors))),
            }
        )
    return pd.DataFrame(records).sort_values(["mae", "rmse", "method", "rank"]).reset_index(drop=True)


def denormalize(
    normalized: pd.DataFrame,
    original_values: pd.DataFrame,
    stats: pd.DataFrame,
) -> pd.DataFrame:
    centers = stats.set_index("column")["center"].reindex(normalized.columns)
    scales = stats.set_index("column")["scale"].reindex(normalized.columns)
    raw = invert_column_transforms(normalized * scales + centers, stats)
    observed = original_values.notna()
    raw = raw.mask(observed, original_values)

    stat_index = stats.set_index("column")
    for col in raw.columns:
        min_value = stat_index.loc[col, "min"]
        max_value = stat_index.loc[col, "max"]
        if np.isfinite(min_value) and np.isfinite(max_value):
            missing = ~observed[col]
            raw.loc[missing, col] = raw.loc[missing, col].clip(min_value, max_value)
    return raw


def validated_impute_dataframe(
    df: pd.DataFrame,
    ranks: list[int],
    holdout_fraction: float,
    seed: int,
) -> ImputationResult:
    values = df[score_columns(df)].astype(float)
    stats = robust_column_stats(values)
    normalized = normalize(values, stats)
    cv = cross_validate_imputers(normalized, ranks, holdout_fraction, seed)
    best_method = str(cv.iloc[0]["method"])
    best_rank = int(cv.iloc[0]["rank"])
    imputed_normalized_array = impute_by_method(
        normalized.to_numpy(dtype=float),
        method=best_method,
        rank=best_rank or None,
    )
    imputed_normalized = pd.DataFrame(imputed_normalized_array, columns=values.columns, index=values.index)
    imputed_raw = denormalize(imputed_normalized, values, stats)
    return ImputationResult(
        normalized=pd.concat([df[KEY_COLUMNS], imputed_normalized], axis=1),
        raw=pd.concat([df[KEY_COLUMNS], imputed_raw], axis=1),
        stats=stats,
        cv=cv,
        best_rank=best_rank,
        missing_fraction=float(values.isna().mean().mean()),
    )


svd_impute_dataframe = validated_impute_dataframe


def aggregate_task_result_to_benchmarks(
    raw_benchmark: pd.DataFrame,
    raw_task: pd.DataFrame,
    task_result: ImputationResult,
) -> ImputationResult:
    benchmark_cols = score_columns(raw_benchmark)
    task_cols = score_columns(raw_task)
    task_groups: dict[str, list[str]] = {}
    for col in task_cols:
        benchmark, _task_id = col.split("/", 1)
        task_groups.setdefault(benchmark, []).append(col)

    missing_groups = [benchmark for benchmark in benchmark_cols if benchmark not in task_groups]
    if missing_groups:
        raise ValueError(f"Task matrix has no task columns for benchmarks: {missing_groups}")

    aggregate_raw = raw_benchmark[KEY_COLUMNS].copy()
    aggregate_observed = raw_benchmark[KEY_COLUMNS].copy()
    raw_task_values = raw_task[task_cols].astype(float)
    task_result_values = task_result.raw[task_cols].astype(float)
    stats_rows = []
    for benchmark in benchmark_cols:
        cols = task_groups[benchmark]
        aggregate_raw[benchmark] = task_result_values[cols].mean(axis=1)
        aggregate_observed[benchmark] = raw_task_values[cols].mean(axis=1, skipna=True)
        observed_task_counts = raw_task_values[cols].notna().sum(axis=1)
        stats_rows.append(
            {
                "column": benchmark,
                "task_count": len(cols),
                "observed_task_cells": int(raw_task_values[cols].notna().sum().sum()),
                "total_task_cells": int(raw_task_values[cols].size),
                "task_cell_missing_fraction": float(raw_task_values[cols].isna().mean().mean()),
                "mean_observed_task_cells_per_agent_model": float(observed_task_counts.mean()),
                "agent_model_rows_with_any_task_observed": int((observed_task_counts > 0).sum()),
            }
        )

    stats = robust_column_stats(aggregate_observed[benchmark_cols].astype(float))
    stats = stats.merge(pd.DataFrame(stats_rows), on="column", how="left")
    normalized = normalize(aggregate_raw[benchmark_cols].astype(float), stats)
    cv = pd.DataFrame(
        [
            {
                "method": "task_imputation_then_benchmark_aggregate",
                "task_imputation_method": str(task_result.cv.iloc[0]["method"]),
                "rank": int(task_result.best_rank),
                "holdout_cells": 0,
                "rmse": np.nan,
                "mae": np.nan,
            }
        ]
    )
    return ImputationResult(
        normalized=pd.concat([raw_benchmark[KEY_COLUMNS], normalized], axis=1),
        raw=aggregate_raw,
        stats=stats,
        cv=cv,
        best_rank=0,
        missing_fraction=float(aggregate_observed[benchmark_cols].isna().mean().mean()),
    )


def write_matrix_outputs(prefix: str, result: ImputationResult) -> None:
    best = result.cv.iloc[0]
    result.raw.to_csv(PROCESSED_DIR / f"{prefix}_imputed_matrix.csv", index=False)
    result.normalized.to_csv(PROCESSED_DIR / f"{prefix}_imputed_normalized_matrix.csv", index=False)
    result.stats.to_csv(PROCESSED_DIR / f"{prefix}_column_quality.csv", index=False)
    result.cv.to_csv(PROCESSED_DIR / f"{prefix}_imputation_cv.csv", index=False)
    diagnostics = {
        "matrix": prefix,
        "method": str(best["method"]),
        "best_rank": result.best_rank,
        "missing_fraction": result.missing_fraction,
        "columns": int(result.raw.shape[1] - len(KEY_COLUMNS)),
        "agent_model_rows": int(result.raw.shape[0]),
    }
    (PROCESSED_DIR / f"{prefix}_imputation_diagnostics.json").write_text(
        json.dumps(diagnostics, indent=2) + "\n"
    )


def write_benchmark_aggregate_outputs(result: ImputationResult, task_result: ImputationResult) -> None:
    result.raw.to_csv(PROCESSED_DIR / "benchmark_from_task_aggregate_matrix.csv", index=False)
    result.normalized.to_csv(PROCESSED_DIR / "benchmark_from_task_aggregate_normalized_matrix.csv", index=False)
    result.stats.to_csv(PROCESSED_DIR / "benchmark_from_task_aggregate_column_quality.csv", index=False)
    result.cv.to_csv(PROCESSED_DIR / "benchmark_from_task_aggregate_diagnostics_cv.csv", index=False)
    diagnostics = {
        "matrix": "benchmark",
        "method": "task_imputation_then_benchmark_aggregate",
        "task_imputation_method": str(task_result.cv.iloc[0]["method"]),
        "task_imputation_rank": task_result.best_rank,
        "missing_fraction_before_task_aggregation": result.missing_fraction,
        "columns": int(result.raw.shape[1] - len(KEY_COLUMNS)),
        "agent_model_rows": int(result.raw.shape[0]),
    }
    (PROCESSED_DIR / "benchmark_from_task_aggregate_diagnostics.json").write_text(
        json.dumps(diagnostics, indent=2) + "\n"
    )


def singular_value_report(prefix: str, result: ImputationResult) -> pd.DataFrame:
    cols = score_columns(result.normalized)
    matrix = result.normalized[cols].to_numpy(dtype=float)
    singular_values = np.linalg.svd(matrix, compute_uv=False)
    variance = singular_values**2
    return pd.DataFrame(
        {
            "matrix": prefix,
            "component": np.arange(1, len(singular_values) + 1),
            "singular_value": singular_values,
            "variance_fraction": variance / variance.sum(),
            "cumulative_variance_fraction": np.cumsum(variance / variance.sum()),
        }
    )
