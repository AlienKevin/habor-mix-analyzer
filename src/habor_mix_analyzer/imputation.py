from __future__ import annotations

from .common import *


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
    max_iter: int = 80,
    tolerance: float = 1e-5,
) -> np.ndarray:
    observed = np.isfinite(matrix)
    filled = np.where(observed, matrix, 0.0)
    missing = ~observed
    if not missing.any():
        return filled

    rank = max(1, min(rank, min(matrix.shape) - 1))
    previous_missing = filled[missing].copy()
    for _ in range(max_iter):
        u, singular_values, vt = np.linalg.svd(filled, full_matrices=False)
        reconstructed = (u[:, :rank] * singular_values[:rank]) @ vt[:rank, :]
        filled[missing] = reconstructed[missing]
        delta = np.linalg.norm(filled[missing] - previous_missing)
        denom = np.linalg.norm(previous_missing) + 1e-9
        if delta / denom < tolerance:
            break
        previous_missing = filled[missing].copy()
    filled[observed] = matrix[observed]
    return filled

def cross_validate_rank(
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
    records: list[dict[str, float | int]] = []
    for rank in ranks:
        imputed = iterative_svd_impute(train, rank=rank)
        errors = imputed[holdout] - matrix[holdout]
        records.append(
            {
                "rank": rank,
                "holdout_cells": int(holdout.sum()),
                "rmse": float(np.sqrt(np.mean(errors**2))),
                "mae": float(np.mean(np.abs(errors))),
            }
        )
    return pd.DataFrame(records).sort_values(["rmse", "rank"]).reset_index(drop=True)

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

def svd_impute_dataframe(
    df: pd.DataFrame,
    ranks: list[int],
    holdout_fraction: float,
    seed: int,
) -> ImputationResult:
    values = df[score_columns(df)].astype(float)
    stats = robust_column_stats(values)
    normalized = normalize(values, stats)
    cv = cross_validate_rank(normalized, ranks, holdout_fraction, seed)
    best_rank = int(cv.iloc[0]["rank"])
    imputed_normalized_array = iterative_svd_impute(normalized.to_numpy(dtype=float), rank=best_rank)
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

def write_matrix_outputs(prefix: str, result: ImputationResult) -> None:
    result.raw.to_csv(PROCESSED_DIR / f"{prefix}_svd_imputed_matrix.csv", index=False)
    result.normalized.to_csv(PROCESSED_DIR / f"{prefix}_svd_imputed_normalized_matrix.csv", index=False)
    result.stats.to_csv(PROCESSED_DIR / f"{prefix}_column_quality.csv", index=False)
    result.cv.to_csv(PROCESSED_DIR / f"{prefix}_svd_rank_cv.csv", index=False)
    diagnostics = {
        "matrix": prefix,
        "best_rank": result.best_rank,
        "missing_fraction": result.missing_fraction,
        "columns": int(result.raw.shape[1] - len(KEY_COLUMNS)),
        "systems": int(result.raw.shape[0]),
    }
    (PROCESSED_DIR / f"{prefix}_imputation_diagnostics.json").write_text(
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
