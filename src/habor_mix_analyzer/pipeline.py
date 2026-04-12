from __future__ import annotations

import argparse
import json
import math
import shutil
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.linear_model import LinearRegression, RidgeCV
from sklearn.metrics import r2_score
from sklearn.model_selection import KFold


ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed" / "intermediate"
OUTPUT_DIR = ROOT / "output"
INTERMEDIATE_OUTPUT_DIR = OUTPUT_DIR / "intermediate"
FIGURE_DIR = INTERMEDIATE_OUTPUT_DIR / "figures"
TABLE_DIR = INTERMEDIATE_OUTPUT_DIR / "tables"
REPORT_DIR = INTERMEDIATE_OUTPUT_DIR / "reports"
STUDY_DIR = OUTPUT_DIR / "studies"
BENCHMARK_STUDY_DIR = STUDY_DIR / "benchmark_level"
TASK_STUDY_DIR = STUDY_DIR / "task_level"
PAPER_DIR = OUTPUT_DIR / "paper"
PAPER_TABLE_DIR = PAPER_DIR / "tables"
PAPER_FIGURE_DIR = PAPER_DIR / "figures"
PAPER_REPORT_DIR = PAPER_DIR / "reports"

KEY_COLUMNS = ["model", "agent"]
RANDOM_SEED = 42


@dataclass(frozen=True)
class ImputationResult:
    normalized: pd.DataFrame
    raw: pd.DataFrame
    stats: pd.DataFrame
    cv: pd.DataFrame
    best_rank: int
    missing_fraction: float


def clean_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def prepare_output_dirs() -> None:
    legacy_dirs = [
        ROOT / "data" / "processed" / "generated",
        OUTPUT_DIR / "figures",
        OUTPUT_DIR / "tables",
        OUTPUT_DIR / "reports",
    ]
    for path in legacy_dirs:
        if path.exists():
            shutil.rmtree(path)

    for path in [
        PROCESSED_DIR,
        FIGURE_DIR,
        TABLE_DIR,
        REPORT_DIR,
        BENCHMARK_STUDY_DIR,
        TASK_STUDY_DIR,
        PAPER_TABLE_DIR,
        PAPER_FIGURE_DIR,
        PAPER_REPORT_DIR,
    ]:
        clean_dir(path)


def read_matrix(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = [col for col in KEY_COLUMNS if col not in df.columns]
    if missing:
        raise ValueError(f"{path} is missing key columns: {missing}")
    return df


def score_columns(df: pd.DataFrame) -> list[str]:
    return [col for col in df.columns if col not in KEY_COLUMNS]


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


def benchmark_long(raw: pd.DataFrame, imputed: pd.DataFrame, normalized: pd.DataFrame) -> pd.DataFrame:
    rows: list[pd.DataFrame] = []
    for benchmark in score_columns(raw):
        part = raw[KEY_COLUMNS].copy()
        part["benchmark"] = benchmark
        part["observed_score"] = raw[benchmark]
        part["score"] = imputed[benchmark]
        part["normalized_score"] = normalized[benchmark]
        part["was_imputed"] = raw[benchmark].isna()
        rows.append(part)
    return pd.concat(rows, ignore_index=True)


def task_metadata(columns: list[str]) -> pd.DataFrame:
    records = []
    for col in columns:
        benchmark, task_id = col.split("/", 1)
        records.append({"task_column": col, "benchmark": benchmark, "task_id": task_id})
    return pd.DataFrame(records)


def bounded_tier(mean_score: float, min_score: float, max_score: float) -> str:
    if not np.isfinite(mean_score):
        return "unknown"
    if min_score < 0 or max_score > 1:
        return "unbounded_or_penalty"
    if mean_score < 0.05:
        return "frontier"
    if mean_score < 0.30:
        return "hard"
    if mean_score <= 0.70:
        return "medium"
    if mean_score <= 0.95:
        return "easy"
    return "saturated"


def corr_or_nan(x: np.ndarray, y: np.ndarray) -> float:
    if np.nanstd(x) < 1e-12 or np.nanstd(y) < 1e-12:
        return np.nan
    return float(np.corrcoef(x, y)[0, 1])


def task_stats(
    raw_task: pd.DataFrame,
    task_imputed: ImputationResult,
    benchmark_imputed: ImputationResult,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    task_cols = score_columns(raw_task)
    raw_values = raw_task[task_cols].astype(float)
    imputed_raw_values = task_imputed.raw[task_cols].astype(float)
    imputed_norm_values = task_imputed.normalized[task_cols].astype(float)
    system_strength = benchmark_imputed.normalized[score_columns(benchmark_imputed.normalized)].mean(axis=1).to_numpy()

    records: list[dict[str, float | int | str]] = []
    meta = task_metadata(task_cols).set_index("task_column")
    for col in task_cols:
        observed = raw_values[col].dropna()
        count = int(observed.shape[0])
        raw_mean = float(observed.mean()) if count else np.nan
        raw_min = float(observed.min()) if count else np.nan
        raw_max = float(observed.max()) if count else np.nan
        records.append(
            {
                "task_column": col,
                "benchmark": meta.loc[col, "benchmark"],
                "task_id": meta.loc[col, "task_id"],
                "observed_count": count,
                "missing_count": int(raw_values[col].isna().sum()),
                "missing_fraction": float(raw_values[col].isna().mean()),
                "observed_mean": raw_mean,
                "observed_std": float(observed.std(ddof=0)) if count else np.nan,
                "observed_min": raw_min,
                "observed_max": raw_max,
                "imputed_mean": float(imputed_raw_values[col].mean()),
                "imputed_normalized_mean": float(imputed_norm_values[col].mean()),
                "imputed_normalized_std": float(imputed_norm_values[col].std(ddof=0)),
                "strength_correlation": corr_or_nan(imputed_norm_values[col].to_numpy(), system_strength),
                "difficulty_tier": bounded_tier(raw_mean, raw_min, raw_max),
                "negative_count": int((raw_values[col] < 0).sum()),
                "gt_one_count": int((raw_values[col] > 1).sum()),
            }
        )
    item_stats = pd.DataFrame(records)
    tier_order = ["frontier", "hard", "medium", "easy", "saturated", "unbounded_or_penalty", "unknown"]
    summary = (
        item_stats.groupby("benchmark")
        .agg(
            n_tasks=("task_column", "size"),
            mean_observed_count=("observed_count", "mean"),
            mean_missing_fraction=("missing_fraction", "mean"),
            mean_observed_score=("observed_mean", "mean"),
            mean_imputed_score=("imputed_mean", "mean"),
            mean_strength_correlation=("strength_correlation", "mean"),
        )
        .reset_index()
    )
    tiers = (
        item_stats.pivot_table(index="benchmark", columns="difficulty_tier", values="task_column", aggfunc="count", fill_value=0)
        .reindex(columns=tier_order, fill_value=0)
        .reset_index()
    )
    summary = summary.merge(tiers, on="benchmark", how="left")

    task_benchmark_matrix = pd.concat([raw_task[KEY_COLUMNS], imputed_raw_values], axis=1)
    bench_records: list[pd.DataFrame] = []
    for benchmark, columns in meta.groupby("benchmark").groups.items():
        part = raw_task[KEY_COLUMNS].copy()
        part[benchmark] = imputed_raw_values[list(columns)].mean(axis=1)
        bench_records.append(part[[benchmark]])
    from_tasks = pd.concat([raw_task[KEY_COLUMNS], *bench_records], axis=1)
    return item_stats, summary, from_tasks


def system_scores(benchmark_result: ImputationResult, raw_benchmark: pd.DataFrame) -> pd.DataFrame:
    cols = score_columns(benchmark_result.normalized)
    out = benchmark_result.normalized[KEY_COLUMNS].copy()
    out["normalized_mean"] = benchmark_result.normalized[cols].mean(axis=1)
    out["normalized_median"] = benchmark_result.normalized[cols].median(axis=1)
    out["observed_fraction"] = raw_benchmark[cols].notna().mean(axis=1)
    out["rank"] = out["normalized_mean"].rank(ascending=False, method="min").astype(int)
    return out.sort_values("rank")


def agent_differential(benchmark_result: ImputationResult) -> pd.DataFrame:
    cols = score_columns(benchmark_result.normalized)
    rows = []
    normalized = benchmark_result.normalized
    for model, group in normalized.groupby("model"):
        if "terminus-2" not in set(group["agent"]):
            continue
        baseline = group[group["agent"] == "terminus-2"].iloc[0]
        for _, candidate in group[group["agent"] != "terminus-2"].iterrows():
            for benchmark in cols:
                rows.append(
                    {
                        "model": model,
                        "agent": candidate["agent"],
                        "baseline_agent": "terminus-2",
                        "benchmark": benchmark,
                        "delta_normalized": float(candidate[benchmark] - baseline[benchmark]),
                    }
                )
    return pd.DataFrame(rows)


def design_matrix(df: pd.DataFrame, terms: list[str]) -> pd.DataFrame:
    blocks = []
    for term in terms:
        if ":" in term:
            cols = term.split(":")
            values = df[cols].astype(str).agg("::".join, axis=1)
            blocks.append(pd.get_dummies(values, prefix=term, drop_first=True, dtype=float))
        else:
            blocks.append(pd.get_dummies(df[term].astype(str), prefix=term, drop_first=True, dtype=float))
    if not blocks:
        return pd.DataFrame(index=df.index)
    return pd.concat(blocks, axis=1)


def fit_r2(df: pd.DataFrame, y: pd.Series, terms: list[str]) -> float:
    x = design_matrix(df, terms)
    if x.empty:
        return 0.0
    model = LinearRegression()
    model.fit(x, y)
    return float(model.score(x, y))


def variance_decomposition(benchmark_long_df: pd.DataFrame) -> pd.DataFrame:
    df = benchmark_long_df.rename(columns={"normalized_score": "score"}).copy()
    y = df["score"].astype(float)
    main_terms = ["model", "agent", "benchmark"]
    full_main = fit_r2(df, y, main_terms)
    records = []
    for term in main_terms:
        records.append(
            {
                "component": term,
                "r2": fit_r2(df, y, [term]),
                "partial_r2_over_other_main_effects": full_main - fit_r2(df, y, [t for t in main_terms if t != term]),
                "type": "main_effect",
            }
        )
    for term in ["model:agent", "model:benchmark", "agent:benchmark"]:
        records.append(
            {
                "component": term,
                "r2": fit_r2(df, y, main_terms + [term]),
                "partial_r2_over_other_main_effects": fit_r2(df, y, main_terms + [term]) - full_main,
                "type": "interaction_increment",
            }
        )
    records.append(
        {
            "component": "all_main_effects",
            "r2": full_main,
            "partial_r2_over_other_main_effects": full_main,
            "type": "combined",
        }
    )
    return pd.DataFrame(records).sort_values("partial_r2_over_other_main_effects", ascending=False)


def benchmark_correlations(benchmark_result: ImputationResult) -> tuple[pd.DataFrame, pd.DataFrame]:
    cols = score_columns(benchmark_result.normalized)
    corr = benchmark_result.normalized[cols].corr(method="spearman")
    pairs = []
    for i, left in enumerate(cols):
        for right in cols[i + 1 :]:
            pairs.append({"left": left, "right": right, "spearman": float(corr.loc[left, right])})
    pair_df = pd.DataFrame(pairs)
    pair_df["abs_spearman"] = pair_df["spearman"].abs()
    return corr, pair_df.sort_values("abs_spearman", ascending=False)


def benchmark_predictability(benchmark_result: ImputationResult) -> pd.DataFrame:
    cols = score_columns(benchmark_result.normalized)
    matrix = benchmark_result.normalized[cols].astype(float)
    rows = []
    cv = KFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    alphas = np.logspace(-3, 3, 13)
    for target in cols:
        x = matrix.drop(columns=[target]).to_numpy()
        y = matrix[target].to_numpy()
        predictions = np.full_like(y, np.nan, dtype=float)
        for train_idx, test_idx in cv.split(x):
            model = RidgeCV(alphas=alphas)
            model.fit(x[train_idx], y[train_idx])
            predictions[test_idx] = model.predict(x[test_idx])
        rows.append(
            {
                "benchmark": target,
                "cv_r2": float(r2_score(y, predictions)),
                "cv_rmse": float(np.sqrt(np.mean((y - predictions) ** 2))),
            }
        )
    return pd.DataFrame(rows).sort_values("cv_r2")


def latent_loadings(
    benchmark_result: ImputationResult, n_components: int = 5
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    cols = score_columns(benchmark_result.normalized)
    x = benchmark_result.normalized[cols].astype(float).to_numpy()
    n_components = min(n_components, x.shape[0] - 1, x.shape[1])
    pca = PCA(n_components=n_components, random_state=RANDOM_SEED)
    scores = pca.fit_transform(x)
    loadings = pd.DataFrame(
        pca.components_.T,
        index=cols,
        columns=[f"PC{i + 1}" for i in range(n_components)],
    ).reset_index(names="benchmark")
    system_latent = benchmark_result.normalized[KEY_COLUMNS].copy()
    for i in range(n_components):
        system_latent[f"PC{i + 1}"] = scores[:, i]
    explained = pd.DataFrame(
        {
            "component": [f"PC{i + 1}" for i in range(n_components)],
            "explained_variance_ratio": pca.explained_variance_ratio_,
        }
    )
    return loadings, system_latent, explained


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


def write_tables(
    raw_benchmark: pd.DataFrame,
    raw_task: pd.DataFrame,
    benchmark_result: ImputationResult,
    task_result: ImputationResult,
) -> dict[str, pd.DataFrame]:
    long_df = benchmark_long(raw_benchmark, benchmark_result.raw, benchmark_result.normalized)
    item_stats, task_summary, task_benchmark_matrix = task_stats(raw_task, task_result, benchmark_result)
    system_df = system_scores(benchmark_result, raw_benchmark)
    agent_diff = agent_differential(benchmark_result)
    variance_df = variance_decomposition(long_df)
    corr, corr_pairs = benchmark_correlations(benchmark_result)
    predictability = benchmark_predictability(benchmark_result)
    loadings, latent_systems, latent_explained = latent_loadings(benchmark_result)
    svd_report = pd.concat(
        [singular_value_report("benchmark", benchmark_result), singular_value_report("task", task_result)],
        ignore_index=True,
    )

    tables = {
        "benchmark_observed_imputed_long": long_df,
        "task_item_stats": item_stats,
        "task_benchmark_summary": task_summary,
        "task_benchmark_matrix_from_tasks": task_benchmark_matrix,
        "system_scores": system_df,
        "agent_differential_by_benchmark": agent_diff,
        "variance_decomposition": variance_df,
        "benchmark_correlations": corr.reset_index(names="benchmark"),
        "benchmark_redundancy_pairs": corr_pairs,
        "benchmark_predictability": predictability,
        "benchmark_latent_loadings": loadings,
        "benchmark_latent_systems": latent_systems,
        "benchmark_latent_explained_variance": latent_explained,
        "svd_scree": svd_report,
    }
    for name, table in tables.items():
        table.to_csv(PROCESSED_DIR / f"{name}.csv", index=False)
        table.to_csv(TABLE_DIR / f"{name}.csv", index=False)
    return tables


def write_csv(table: pd.DataFrame, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(path, index=False)
    return path


def benchmark_filter_table(stats: pd.DataFrame, min_observed: int = 15, max_missing: float = 0.45) -> pd.DataFrame:
    table = stats.rename(columns={"column": "benchmark"}).copy()
    table["include_in_paper_analysis"] = (table["observed_count"] >= min_observed) & (
        table["missing_fraction"] <= max_missing
    )

    def reason(row: pd.Series) -> str:
        if row["include_in_paper_analysis"]:
            return "included"
        if row["observed_count"] < min_observed:
            return f"excluded: fewer than {min_observed} observed agent+model rows"
        return f"excluded: missing fraction above {max_missing:.0%}"

    table["filter_reason"] = table.apply(reason, axis=1)
    ordered = [
        "benchmark",
        "include_in_paper_analysis",
        "filter_reason",
        "observed_count",
        "missing_count",
        "missing_fraction",
        "mean",
        "std",
        "median",
        "min",
        "max",
        "transform",
        "negative_count",
        "gt_one_count",
    ]
    return table[ordered].sort_values(["include_in_paper_analysis", "observed_count"], ascending=[False, False])


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


def pairwise_correlations(matrix: pd.DataFrame, cols: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    corr = matrix[cols].corr(method="spearman")
    rows = []
    for i, left in enumerate(cols):
        for right in cols[i + 1 :]:
            rows.append({"left": left, "right": right, "spearman": float(corr.loc[left, right])})
    pairs = pd.DataFrame(rows)
    pairs["abs_spearman"] = pairs["spearman"].abs()
    return corr.reset_index(names="benchmark"), pairs.sort_values("abs_spearman", ascending=False)


def predictability_for_cols(normalized: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    matrix = normalized[cols].astype(float)
    rows = []
    n_splits = min(5, matrix.shape[0])
    cv = KFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)
    alphas = np.logspace(-3, 3, 13)
    for target in cols:
        predictors = [col for col in cols if col != target]
        if not predictors:
            continue
        x = matrix[predictors].to_numpy()
        y = matrix[target].to_numpy()
        predictions = np.full_like(y, np.nan, dtype=float)
        for train_idx, test_idx in cv.split(x):
            model = RidgeCV(alphas=alphas)
            model.fit(x[train_idx], y[train_idx])
            predictions[test_idx] = model.predict(x[test_idx])
        rows.append(
            {
                "benchmark": target,
                "cv_r2_from_other_included_benchmarks": float(r2_score(y, predictions)),
                "cv_rmse": float(np.sqrt(np.mean((y - predictions) ** 2))),
            }
        )
    return pd.DataFrame(rows).sort_values("cv_r2_from_other_included_benchmarks")


def pca_for_cols(normalized: pd.DataFrame, cols: list[str], n_components: int = 4) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    x = normalized[cols].astype(float).to_numpy()
    n_components = min(n_components, x.shape[0] - 1, x.shape[1])
    pca = PCA(n_components=n_components, random_state=RANDOM_SEED)
    scores = pca.fit_transform(x)
    loadings = pd.DataFrame(
        pca.components_.T,
        index=cols,
        columns=[f"PC{i + 1}" for i in range(n_components)],
    ).reset_index(names="benchmark")
    agent_model_scores = normalized[KEY_COLUMNS].copy()
    for i in range(n_components):
        agent_model_scores[f"PC{i + 1}"] = scores[:, i]
    explained = pd.DataFrame(
        {
            "component": [f"PC{i + 1}" for i in range(n_components)],
            "explained_variance_ratio": pca.explained_variance_ratio_,
        }
    )
    return loadings, agent_model_scores, explained


def agent_model_scores_for_cols(
    raw_benchmark: pd.DataFrame,
    benchmark_result: ImputationResult,
    cols: list[str],
) -> pd.DataFrame:
    out = benchmark_result.normalized[KEY_COLUMNS].copy()
    out["agent_model"] = out["agent"] + " + " + out["model"]
    out["mean_normalized_score"] = benchmark_result.normalized[cols].mean(axis=1)
    out["median_normalized_score"] = benchmark_result.normalized[cols].median(axis=1)
    out["observed_fraction_on_included_benchmarks"] = raw_benchmark[cols].notna().mean(axis=1)
    out["rank"] = out["mean_normalized_score"].rank(ascending=False, method="min").astype(int)
    return out.sort_values("rank")


def filtered_variance_decomposition(benchmark_long_df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    return variance_decomposition(benchmark_long_df[benchmark_long_df["benchmark"].isin(cols)].copy())


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


def task_aggregate_alignment(
    benchmark_result: ImputationResult,
    task_result: ImputationResult,
    item_stats: pd.DataFrame,
    included_benchmarks: list[str],
) -> pd.DataFrame:
    task_cols = score_columns(task_result.normalized)
    meta = task_metadata(task_cols)
    rows = []
    for benchmark, group in meta.groupby("benchmark"):
        columns = group["task_column"].tolist()
        task_aggregate = task_result.normalized[columns].mean(axis=1).to_numpy(dtype=float)
        benchmark_values = benchmark_result.normalized[benchmark].to_numpy(dtype=float)
        reliable_tasks = int(
            (
                (item_stats["benchmark"] == benchmark)
                & (item_stats["observed_count"] >= 12)
                & (item_stats["negative_count"] == 0)
                & (item_stats["gt_one_count"] == 0)
            ).sum()
        )
        rows.append(
            {
                "benchmark": benchmark,
                "included_in_benchmark_level_paper_filter": benchmark in included_benchmarks,
                "n_tasks": len(columns),
                "n_reliable_bounded_tasks": reliable_tasks,
                "pearson_agent_model_correlation": corr_or_nan(task_aggregate, benchmark_values),
                "spearman_agent_model_correlation": (
                    np.nan
                    if np.nanstd(task_aggregate) < 1e-12 or np.nanstd(benchmark_values) < 1e-12
                    else float(pd.Series(task_aggregate).corr(pd.Series(benchmark_values), method="spearman"))
                ),
            }
        )
    return pd.DataFrame(rows).sort_values("spearman_agent_model_correlation", ascending=False)


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
            median_observed_mean=("observed_mean", "median"),
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


def save_paper_agent_model_score_plot(scores: pd.DataFrame) -> None:
    plot_df = scores.sort_values("mean_normalized_score").tail(18)
    labels = plot_df["agent_model"]
    fig, ax = plt.subplots(figsize=(11, 8))
    ax.barh(labels, plot_df["mean_normalized_score"], color="#9ecae1", edgecolor="white")
    ax.set_title("Top Agent+Model Pairs on Included Benchmarks")
    ax.set_xlabel("Mean normalized score")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    fig.savefig(PAPER_FIGURE_DIR / "benchmark_agent_model_top_scores.png", dpi=200)
    plt.close(fig)


def save_paper_effect_plot(effects: pd.DataFrame, group_col: str, filename: str, title: str) -> None:
    plot_df = effects.sort_values("adjusted_mean")
    fig, ax = plt.subplots(figsize=(10, max(4.8, 0.36 * len(plot_df))))
    ax.barh(plot_df[group_col], plot_df["adjusted_mean"], color="#a1d99b", edgecolor="white")
    ax.axvline(0, color="#666666", linewidth=1)
    ax.set_title(title)
    ax.set_xlabel("Adjusted normalized score")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    fig.savefig(PAPER_FIGURE_DIR / filename, dpi=200)
    plt.close(fig)


def save_agent_lift_heatmap(agent_by_benchmark: pd.DataFrame) -> None:
    if agent_by_benchmark.empty:
        return
    pivot = agent_by_benchmark.pivot(index="agent", columns="benchmark", values="mean_delta_vs_terminus").fillna(0)
    strongest = pivot.abs().mean(axis=0).sort_values(ascending=False).head(24).index
    pivot = pivot[strongest]
    fig, ax = plt.subplots(figsize=(14, max(3.8, 1.0 + 0.55 * pivot.shape[0])))
    image = ax.imshow(pivot.to_numpy(dtype=float), cmap="BrBG", vmin=-2.5, vmax=2.5)
    ax.set_title("Agent Lift vs terminus-2 by Benchmark")
    ax.set_xticks(np.arange(pivot.shape[1]))
    ax.set_xticklabels(pivot.columns, rotation=65, ha="right")
    ax.set_yticks(np.arange(pivot.shape[0]))
    ax.set_yticklabels(pivot.index)
    cbar = fig.colorbar(image, ax=ax, fraction=0.035, pad=0.02)
    cbar.set_label("Mean normalized delta")
    fig.tight_layout()
    fig.savefig(PAPER_FIGURE_DIR / "benchmark_agent_lift_heatmap.png", dpi=200)
    plt.close(fig)


def save_benchmark_uniqueness_plot(uniqueness: pd.DataFrame, filter_table: pd.DataFrame) -> None:
    plot_df = uniqueness.merge(filter_table[["benchmark", "observed_count"]], on="benchmark", how="left")
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.scatter(
        plot_df["observed_count"],
        plot_df["cv_r2_from_other_included_benchmarks"],
        s=90,
        color="#fdae6b",
        edgecolor="white",
        alpha=0.85,
    )
    for _, row in plot_df.head(8).iterrows():
        ax.annotate(row["benchmark"], (row["observed_count"], row["cv_r2_from_other_included_benchmarks"]), fontsize=10)
    ax.axhline(0, color="#777777", linewidth=1)
    ax.set_title("Benchmark Uniqueness After Coverage Filtering")
    ax.set_xlabel("Observed agent+model rows")
    ax.set_ylabel("CV R2 predicted by other included benchmarks")
    ax.grid(color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    fig.savefig(PAPER_FIGURE_DIR / "benchmark_uniqueness_vs_coverage.png", dpi=200)
    plt.close(fig)


def save_task_composition_plot(task_summary: pd.DataFrame) -> None:
    tier_cols = [col for col in ["hard", "medium", "easy", "frontier", "saturated"] if col in task_summary.columns]
    plot_df = task_summary.sort_values("candidate_pool_tasks", ascending=False).head(25).set_index("benchmark")
    colors = ["#74c476", "#9ecae1", "#fdd0a2", "#c7e9c0", "#fdae6b"]
    fig, ax = plt.subplots(figsize=(13, 7))
    bottom = np.zeros(plot_df.shape[0])
    for col, color in zip(tier_cols, colors):
        values = plot_df[col].to_numpy(dtype=float)
        ax.bar(plot_df.index, values, bottom=bottom, label=col, color=color, edgecolor="white")
        bottom += values
    ax.set_title("Reliable Bounded Task Difficulty Composition")
    ax.set_ylabel("Reliable task count")
    ax.set_xlabel("")
    ax.tick_params(axis="x", rotation=65)
    ax.legend(ncols=min(5, len(tier_cols)), frameon=False)
    fig.tight_layout()
    fig.savefig(PAPER_FIGURE_DIR / "task_reliable_difficulty_composition.png", dpi=200)
    plt.close(fig)


def save_task_alignment_plot(alignment: pd.DataFrame) -> None:
    plot_df = alignment[
        alignment["included_in_benchmark_level_paper_filter"] & (alignment["n_reliable_bounded_tasks"] >= 3)
    ].sort_values("spearman_agent_model_correlation")
    fig, ax = plt.subplots(figsize=(11, max(5.5, 0.32 * len(plot_df))))
    ax.barh(plot_df["benchmark"], plot_df["spearman_agent_model_correlation"], color="#9ecae1", edgecolor="white")
    ax.axvline(0, color="#666666", linewidth=1)
    ax.set_title("Task Aggregate vs Benchmark Score Alignment")
    ax.set_xlabel("Spearman correlation across agent+model rows")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    fig.savefig(PAPER_FIGURE_DIR / "task_to_benchmark_alignment.png", dpi=200)
    plt.close(fig)


def run_refined_studies(
    raw_benchmark: pd.DataFrame,
    raw_task: pd.DataFrame,
    benchmark_result: ImputationResult,
    task_result: ImputationResult,
    tables: dict[str, pd.DataFrame],
) -> dict[str, pd.DataFrame]:
    set_plot_style()
    filter_table = benchmark_filter_table(benchmark_result.stats)
    included_benchmarks = filter_table[filter_table["include_in_paper_analysis"]]["benchmark"].tolist()
    long_df = tables["benchmark_observed_imputed_long"]

    agent_model_scores = agent_model_scores_for_cols(raw_benchmark, benchmark_result, included_benchmarks)
    model_effects = adjusted_group_effects(
        long_df[long_df["benchmark"].isin(included_benchmarks)].copy(), "model", ["agent", "benchmark"]
    )
    agent_effects = adjusted_group_effects(
        long_df[long_df["benchmark"].isin(included_benchmarks)].copy(), "agent", ["model", "benchmark"]
    )
    variance_filtered = filtered_variance_decomposition(long_df, included_benchmarks)
    corr_filtered, corr_pairs_filtered = pairwise_correlations(benchmark_result.normalized, included_benchmarks)
    uniqueness = predictability_for_cols(benchmark_result.normalized, included_benchmarks)
    pca_loadings, pca_agent_model_scores, pca_explained = pca_for_cols(benchmark_result.normalized, included_benchmarks)
    agent_lift_summary, agent_lift_by_benchmark = summarize_agent_lift(
        tables["agent_differential_by_benchmark"], included_benchmarks
    )

    tasks_enriched, task_summary, selected_tasks, frontier_tasks = task_reliability_tables(tables["task_item_stats"])
    alignment = task_aggregate_alignment(benchmark_result, task_result, tasks_enriched, included_benchmarks)

    study_tables = {
        "benchmark_filtering": filter_table,
        "benchmark_agent_model_scores": agent_model_scores,
        "benchmark_model_adjusted_effects": model_effects,
        "benchmark_agent_adjusted_effects": agent_effects,
        "benchmark_variance_decomposition_filtered": variance_filtered,
        "benchmark_correlation_filtered": corr_filtered,
        "benchmark_redundancy_pairs_filtered": corr_pairs_filtered,
        "benchmark_uniqueness_filtered": uniqueness,
        "benchmark_latent_loadings_filtered": pca_loadings,
        "benchmark_latent_agent_model_scores_filtered": pca_agent_model_scores,
        "benchmark_latent_explained_variance_filtered": pca_explained,
        "benchmark_agent_lift_vs_terminus": agent_lift_summary,
        "benchmark_agent_lift_by_benchmark": agent_lift_by_benchmark,
        "task_enriched_item_stats": tasks_enriched,
        "task_benchmark_reliable_summary": task_summary,
        "task_to_benchmark_alignment": alignment,
        "harbormix_candidate_tasks": selected_tasks,
        "task_frontier_or_saturated_watchlist": frontier_tasks,
    }

    for name, table in study_tables.items():
        directory = BENCHMARK_STUDY_DIR if name.startswith("benchmark") else TASK_STUDY_DIR
        write_csv(table, directory / f"{name}.csv")

    paper_tables = [
        "benchmark_filtering",
        "benchmark_agent_model_scores",
        "benchmark_model_adjusted_effects",
        "benchmark_agent_adjusted_effects",
        "benchmark_variance_decomposition_filtered",
        "benchmark_redundancy_pairs_filtered",
        "benchmark_uniqueness_filtered",
        "benchmark_agent_lift_vs_terminus",
        "task_benchmark_reliable_summary",
        "task_to_benchmark_alignment",
        "harbormix_candidate_tasks",
    ]
    for name in paper_tables:
        write_csv(study_tables[name], PAPER_TABLE_DIR / f"{name}.csv")

    save_paper_agent_model_score_plot(agent_model_scores)
    save_paper_effect_plot(model_effects, "model", "benchmark_model_adjusted_effects.png", "Model Effects Adjusted for Agent and Benchmark")
    save_paper_effect_plot(agent_effects, "agent", "benchmark_agent_adjusted_effects.png", "Agent Effects Adjusted for Model and Benchmark")
    save_agent_lift_heatmap(agent_lift_by_benchmark)
    save_benchmark_uniqueness_plot(uniqueness, filter_table)
    save_task_composition_plot(task_summary)
    save_task_alignment_plot(alignment)
    write_paper_reports(study_tables, benchmark_result, task_result, included_benchmarks)
    return study_tables


def md_path(path: Path) -> str:
    return str(path.relative_to(ROOT))


def write_paper_reports(
    study_tables: dict[str, pd.DataFrame],
    benchmark_result: ImputationResult,
    task_result: ImputationResult,
    included_benchmarks: list[str],
) -> None:
    filter_table = study_tables["benchmark_filtering"]
    agent_model_scores = study_tables["benchmark_agent_model_scores"]
    model_effects = study_tables["benchmark_model_adjusted_effects"]
    agent_effects = study_tables["benchmark_agent_adjusted_effects"]
    variance_filtered = study_tables["benchmark_variance_decomposition_filtered"]
    redundancy = study_tables["benchmark_redundancy_pairs_filtered"]
    uniqueness = study_tables["benchmark_uniqueness_filtered"]
    agent_lift = study_tables["benchmark_agent_lift_vs_terminus"]
    task_summary = study_tables["task_benchmark_reliable_summary"]
    alignment = study_tables["task_to_benchmark_alignment"]
    selected_tasks = study_tables["harbormix_candidate_tasks"]

    excluded = filter_table[~filter_table["include_in_paper_analysis"]]
    redundant_high = redundancy[redundancy["spearman"] >= 0.75].sort_values("spearman", ascending=False)
    unique_low = uniqueness.sort_values("cv_r2_from_other_included_benchmarks")
    alignment_good = alignment[
        alignment["included_in_benchmark_level_paper_filter"] & (alignment["n_reliable_bounded_tasks"] >= 3)
    ].sort_values("spearman_agent_model_correlation", ascending=False)
    task_pool = task_summary.sort_values("candidate_pool_tasks", ascending=False)

    report_lines = [
        "# Paper-Facing Cross-Benchmark Analysis",
        "",
        "This is the curated, paper-facing result index. The bulky matrices and diagnostics are intentionally moved to intermediate directories; the files listed here are the ones to inspect first.",
        "",
        "## Directory Contract",
        "",
        f"- Important paper-facing tables: `{md_path(PAPER_TABLE_DIR)}/`",
        f"- Important paper-facing figures: `{md_path(PAPER_FIGURE_DIR)}/`",
        f"- Important paper-facing reports: `{md_path(PAPER_REPORT_DIR)}/`",
        f"- Study-specific expanded outputs: `{md_path(STUDY_DIR)}/`",
        f"- Intermediate imputed matrices and diagnostics: `{md_path(PROCESSED_DIR)}/` and `{md_path(INTERMEDIATE_OUTPUT_DIR)}/`",
        "",
        "## Study 1: Benchmark-Level Coverage and Filtering",
        "",
        "**Method:** I first filter benchmark-level columns by observed coverage. A benchmark is included in paper-facing benchmark-level analyses when it has at least 15 observed agent+model rows and at most 45% missingness. This avoids building the paper story on columns where matrix completion is doing most of the work.",
        "",
        "**Code files:**",
        f"- `{md_path(ROOT / 'src' / 'habor_mix_analyzer' / 'pipeline.py')}`",
        "",
        "**Result paths:**",
        f"- `{md_path(PAPER_TABLE_DIR / 'benchmark_filtering.csv')}`",
        "",
        "**Result overview and analysis:**",
        f"- Included {len(included_benchmarks)} of {len(filter_table)} benchmarks in the paper-facing benchmark-level analyses.",
        f"- Excluded sparse benchmarks: {', '.join(excluded['benchmark'].head(12).tolist())}.",
        f"- Benchmark matrix imputation used rank {benchmark_result.best_rank}; raw missing fraction was {benchmark_result.missing_fraction:.3f}.",
        "",
        "**Insight and findings:**",
        "- Treat `ds-1000`, `financeagent`, `hle`, `skillsbench`, `quixbugs`, and similarly sparse columns as provisional until more runs land. They can be shown in appendix diagnostics, but they should not anchor the core benchmark-level story yet.",
        "",
        "## Study 2: Separate Model and Agent Effects",
        "",
        "**Method:** I treat `model` and `agent` as separate fixed-effect dimensions. For model effects, I residualize out agent and benchmark effects; for agent effects, I residualize out model and benchmark effects. I also keep an `agent+model` ranking as a descriptive table, but it is not the primary causal interpretation.",
        "",
        "**Code files:**",
        f"- `{md_path(ROOT / 'src' / 'habor_mix_analyzer' / 'pipeline.py')}`",
        "",
        "**Result paths:**",
        f"- `{md_path(PAPER_TABLE_DIR / 'benchmark_agent_model_scores.csv')}`",
        f"- `{md_path(PAPER_TABLE_DIR / 'benchmark_model_adjusted_effects.csv')}`",
        f"- `{md_path(PAPER_TABLE_DIR / 'benchmark_agent_adjusted_effects.csv')}`",
        f"- `{md_path(PAPER_FIGURE_DIR / 'benchmark_agent_model_top_scores.png')}`",
        f"- `{md_path(PAPER_FIGURE_DIR / 'benchmark_model_adjusted_effects.png')}`",
        f"- `{md_path(PAPER_FIGURE_DIR / 'benchmark_agent_adjusted_effects.png')}`",
        "",
        "**Result overview and analysis:**",
        *top_records(agent_model_scores, ["rank", "agent_model", "mean_normalized_score", "observed_fraction_on_included_benchmarks"], 8),
        "",
        "**Insight and findings:**",
        f"- Top adjusted models: {', '.join(model_effects['model'].head(5).tolist())}.",
        f"- Top adjusted agents: {', '.join(agent_effects['agent'].head(4).tolist())}.",
        "- The agent main effect remains much smaller than model-by-benchmark interaction. This supports a paper story where agents are not global multipliers; they are benchmark- and model-dependent adapters.",
        "",
        "## Study 3: Variance, Redundancy, and Benchmark Uniqueness",
        "",
        "**Method:** I use fixed-effect variance attribution to estimate how much normalized-score structure is explained by model, agent, benchmark, and interactions. I then compute Spearman benchmark correlations and ridge leave-fold-out predictability to identify redundant and unique benchmarks.",
        "",
        "**Code files:**",
        f"- `{md_path(ROOT / 'src' / 'habor_mix_analyzer' / 'pipeline.py')}`",
        "",
        "**Result paths:**",
        f"- `{md_path(PAPER_TABLE_DIR / 'benchmark_variance_decomposition_filtered.csv')}`",
        f"- `{md_path(PAPER_TABLE_DIR / 'benchmark_redundancy_pairs_filtered.csv')}`",
        f"- `{md_path(PAPER_TABLE_DIR / 'benchmark_uniqueness_filtered.csv')}`",
        f"- `{md_path(PAPER_FIGURE_DIR / 'benchmark_uniqueness_vs_coverage.png')}`",
        "",
        "**Result overview and analysis:**",
        *top_records(variance_filtered, ["component", "partial_r2_over_other_main_effects", "r2", "type"], 7),
        "",
        "High-correlation benchmark pairs:",
        *top_records(redundant_high, ["left", "right", "spearman"], 8),
        "",
        "Least predictable included benchmarks:",
        *top_records(unique_low, ["benchmark", "cv_r2_from_other_included_benchmarks", "cv_rmse"], 8),
        "",
        "**Insight and findings:**",
        "- The dominant signal is interactional: model performance changes substantially across benchmarks. This argues for cross-benchmark analysis rather than a single aggregate leaderboard.",
        "- Highly correlated benchmarks are candidates for compression in a benchmark mix, while low-predictability benchmarks should be preserved if the goal is broad behavioral coverage.",
        "",
        "## Study 4: Paired Agent Lift Against terminus-2",
        "",
        "**Method:** For every model that has both `terminus-2` and another agent row, I compute paired benchmark deltas in normalized space. This isolates the agent change while holding the model fixed.",
        "",
        "**Code files:**",
        f"- `{md_path(ROOT / 'src' / 'habor_mix_analyzer' / 'pipeline.py')}`",
        "",
        "**Result paths:**",
        f"- `{md_path(PAPER_TABLE_DIR / 'benchmark_agent_lift_vs_terminus.csv')}`",
        f"- `{md_path(BENCHMARK_STUDY_DIR / 'benchmark_agent_lift_by_benchmark.csv')}`",
        f"- `{md_path(PAPER_FIGURE_DIR / 'benchmark_agent_lift_heatmap.png')}`",
        "",
        "**Result overview and analysis:**",
        *top_records(agent_lift, ["agent", "mean_delta_vs_terminus", "win_rate_vs_terminus", "compared_models"], 6),
        "",
        "**Insight and findings:**",
        "- This is the cleanest agent-vs-agent evidence currently available because it compares agents within the same model. Use this for claims about agent scaffolding rather than raw `agent+model` rankings.",
        "",
        "## Study 5: Task-Level Difficulty, Discrimination, and Mix Candidates",
        "",
        "**Method:** Task-level analysis uses a different lens: items are filtered by observed coverage, bounded score behavior, observed variance, and positive correlation with overall agent+model strength. The candidate mix favors hard/medium/easy tasks that discriminate among current agents, while frontier and saturated tasks are placed in a watchlist instead of the main mix.",
        "",
        "**Code files:**",
        f"- `{md_path(ROOT / 'src' / 'habor_mix_analyzer' / 'pipeline.py')}`",
        "",
        "**Result paths:**",
        f"- `{md_path(PAPER_TABLE_DIR / 'task_benchmark_reliable_summary.csv')}`",
        f"- `{md_path(PAPER_TABLE_DIR / 'harbormix_candidate_tasks.csv')}`",
        f"- `{md_path(TASK_STUDY_DIR / 'task_frontier_or_saturated_watchlist.csv')}`",
        f"- `{md_path(PAPER_FIGURE_DIR / 'task_reliable_difficulty_composition.png')}`",
        "",
        "**Result overview and analysis:**",
        *top_records(task_pool, ["benchmark", "n_tasks", "candidate_pool_tasks", "mean_strength_correlation"], 10),
        f"- Selected {len(selected_tasks)} diversified HaborMix candidate tasks with a cap of 6 per benchmark.",
        "",
        "**Insight and findings:**",
        "- The task-level table is more useful for mix construction than benchmark-level averages because it exposes saturated, frontier, and discriminative tasks separately.",
        "- Benchmarks with many tasks but few reliable discriminative items should not dominate a compact mix simply because they are large.",
        "",
        "## Study 6: Task Aggregate vs Benchmark-Level Score Alignment",
        "",
        "**Method:** For each benchmark, I average normalized task scores and correlate that aggregate with the benchmark-level normalized score across agent+model rows. This checks whether the task matrix and benchmark matrix tell the same story.",
        "",
        "**Code files:**",
        f"- `{md_path(ROOT / 'src' / 'habor_mix_analyzer' / 'pipeline.py')}`",
        "",
        "**Result paths:**",
        f"- `{md_path(PAPER_TABLE_DIR / 'task_to_benchmark_alignment.csv')}`",
        f"- `{md_path(PAPER_FIGURE_DIR / 'task_to_benchmark_alignment.png')}`",
        "",
        "**Result overview and analysis:**",
        *top_records(alignment_good, ["benchmark", "n_reliable_bounded_tasks", "spearman_agent_model_correlation"], 10),
        "",
        "**Insight and findings:**",
        "- Strong alignment means the task matrix can explain the benchmark-level score; weak alignment flags benchmarks where the aggregation rule or metric scale needs closer inspection before paper claims.",
        "",
        "## Cross-Study Story",
        "",
        "The first pass suggests three paper-relevant claims. First, coverage filtering is mandatory: several raw benchmark columns are too sparse to support benchmark-level conclusions. Second, after filtering, the most interesting structure is not a single leaderboard but model-benchmark and agent-benchmark interaction. Agent scaffolds should be discussed through paired within-model deltas, not just raw agent+model ranks. Third, task-level analysis is the right layer for HaborMix construction: reliable, bounded, discriminative tasks form a compact candidate pool, while frontier/saturated tasks are better treated as separate stress-test or monitoring sets.",
        "",
        "## Not Completed Yet",
        "",
        "- Trial reliability, pass@k, efficiency curves, token/tool cost analysis, and trajectory failure taxonomy still require per-trial run records.",
        "- Full IRT/DIF still requires repeated binary/calibrated task outcomes or enough dense task observations to fit stable item-response models.",
        "- Provider scaling analysis still requires external model metadata such as provider family, parameter scale, release date, and inference budget.",
        "",
    ]
    (PAPER_REPORT_DIR / "analysis_story.md").write_text("\n".join(report_lines))

    findings_lines = [
        "# Key Findings for Paper Drafting",
        "",
        f"1. Use {len(included_benchmarks)} coverage-filtered benchmarks for benchmark-level claims; keep sparse benchmarks in appendix/provisional analysis.",
        "2. Separate model and agent dimensions. The useful agent evidence is paired lift over `terminus-2` for the same model, not an unqualified agent+model leaderboard.",
        "3. Model-by-benchmark interaction is the strongest benchmark-level signal, so benchmark diversity matters.",
        "4. Redundant benchmarks can be considered for compression; least-predictable benchmarks should be preserved for behavioral breadth.",
        f"5. The current task-level filter yields {len(selected_tasks)} diversified candidate tasks for HaborMix-style selection.",
        "6. Task-to-benchmark alignment should be used as a sanity check before interpreting benchmark-level scores from task-level tables.",
        "",
        "Primary reference file: `output/paper/reports/analysis_story.md`.",
    ]
    (PAPER_REPORT_DIR / "key_findings.md").write_text("\n".join(findings_lines))


def set_plot_style() -> None:
    plt.rcParams.update(
        {
            "font.size": 14,
            "axes.titlesize": 18,
            "axes.labelsize": 15,
            "xtick.labelsize": 11,
            "ytick.labelsize": 11,
            "legend.fontsize": 12,
            "figure.titlesize": 20,
            "axes.facecolor": "#fbfbfb",
            "figure.facecolor": "white",
            "savefig.facecolor": "white",
        }
    )


def save_missingness_plot(stats: pd.DataFrame) -> None:
    plot_df = stats.sort_values("missing_fraction", ascending=True)
    fig, ax = plt.subplots(figsize=(10, 12))
    ax.barh(plot_df["column"], plot_df["missing_fraction"], color="#9ecae1", edgecolor="#f7fbff")
    ax.set_title("Benchmark Missingness")
    ax.set_xlabel("Missing fraction")
    ax.set_ylabel("")
    ax.set_xlim(0, 1)
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "benchmark_missingness.png", dpi=180)
    plt.close(fig)


def save_system_plot(system_df: pd.DataFrame) -> None:
    plot_df = system_df.sort_values("normalized_mean")
    labels = plot_df["model"] + " / " + plot_df["agent"]
    fig, ax = plt.subplots(figsize=(12, 9))
    ax.barh(labels, plot_df["normalized_mean"], color="#a1d99b", edgecolor="#f7fcf5")
    ax.set_title("System Ranking by Imputed Normalized Benchmark Mean")
    ax.set_xlabel("Mean normalized score")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "system_rankings.png", dpi=180)
    plt.close(fig)


def save_variance_plot(variance_df: pd.DataFrame) -> None:
    plot_df = variance_df[variance_df["component"] != "all_main_effects"].copy()
    plot_df = plot_df.sort_values("partial_r2_over_other_main_effects")
    fig, ax = plt.subplots(figsize=(10, 5.8))
    ax.barh(
        plot_df["component"],
        plot_df["partial_r2_over_other_main_effects"],
        color="#bcbddc",
        edgecolor="#f7f7ff",
    )
    ax.set_title("Variance Attribution")
    ax.set_xlabel("Partial R2 over other main effects")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "variance_attribution.png", dpi=180)
    plt.close(fig)


def save_correlation_plot(corr: pd.DataFrame) -> None:
    matrix = corr.set_index("benchmark")
    fig, ax = plt.subplots(figsize=(15, 13))
    image = ax.imshow(matrix.to_numpy(dtype=float), cmap="RdBu_r", vmin=-1, vmax=1)
    ax.set_title("Benchmark Spearman Correlation")
    ax.set_xticks(np.arange(matrix.shape[1]))
    ax.set_xticklabels(matrix.columns, rotation=90)
    ax.set_yticks(np.arange(matrix.shape[0]))
    ax.set_yticklabels(matrix.index)
    cbar = fig.colorbar(image, ax=ax, fraction=0.035, pad=0.02)
    cbar.set_label("Spearman rho")
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "benchmark_correlation_heatmap.png", dpi=180)
    plt.close(fig)


def save_tier_plot(task_summary: pd.DataFrame) -> None:
    tier_cols = ["frontier", "hard", "medium", "easy", "saturated", "unbounded_or_penalty"]
    plot_df = task_summary.sort_values("n_tasks", ascending=False).head(30).set_index("benchmark")
    colors = ["#c7e9c0", "#a1d99b", "#9ecae1", "#fdd0a2", "#fdae6b", "#dadaeb"]
    fig, ax = plt.subplots(figsize=(13, 8))
    bottom = np.zeros(plot_df.shape[0])
    for col, color in zip(tier_cols, colors):
        values = plot_df[col].to_numpy(dtype=float)
        ax.bar(plot_df.index, values, bottom=bottom, label=col, color=color, edgecolor="white")
        bottom += values
    ax.set_title("Task Difficulty Tiers by Benchmark")
    ax.set_ylabel("Task count")
    ax.set_xlabel("")
    ax.tick_params(axis="x", rotation=75)
    ax.legend(ncols=3, frameon=False)
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "task_difficulty_tiers_top30.png", dpi=180)
    plt.close(fig)


def save_svd_cv_plot(benchmark_result: ImputationResult, task_result: ImputationResult) -> None:
    fig, ax = plt.subplots(figsize=(9, 5.5))
    ax.plot(benchmark_result.cv["rank"], benchmark_result.cv["rmse"], marker="o", color="#74a9cf", label="benchmark")
    ax.plot(task_result.cv["rank"], task_result.cv["rmse"], marker="o", color="#c994c7", label="task")
    ax.set_title("SVD Imputation Rank Cross-Validation")
    ax.set_xlabel("Rank")
    ax.set_ylabel("Holdout RMSE in normalized space")
    ax.grid(color="#dddddd", linewidth=0.8)
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "svd_rank_cv.png", dpi=180)
    plt.close(fig)


def save_figures(
    benchmark_result: ImputationResult,
    task_result: ImputationResult,
    tables: dict[str, pd.DataFrame],
) -> None:
    set_plot_style()
    save_missingness_plot(benchmark_result.stats)
    save_system_plot(tables["system_scores"])
    save_variance_plot(tables["variance_decomposition"])
    save_correlation_plot(tables["benchmark_correlations"])
    save_tier_plot(tables["task_benchmark_summary"])
    save_svd_cv_plot(benchmark_result, task_result)


def top_records(df: pd.DataFrame, columns: list[str], n: int = 8) -> list[str]:
    lines = []
    for record in df.head(n)[columns].to_dict("records"):
        parts = []
        for col in columns:
            value = record[col]
            if isinstance(value, float):
                parts.append(f"{col}={value:.3f}")
            else:
                parts.append(f"{col}={value}")
        lines.append("- " + ", ".join(parts))
    return lines


def write_report(
    benchmark_result: ImputationResult,
    task_result: ImputationResult,
    tables: dict[str, pd.DataFrame],
) -> None:
    system_df = tables["system_scores"]
    variance_df = tables["variance_decomposition"]
    corr_pairs = tables["benchmark_redundancy_pairs"]
    predictability = tables["benchmark_predictability"]
    task_summary = tables["task_benchmark_summary"]
    agent_diff = tables["agent_differential_by_benchmark"]
    agent_summary = (
        agent_diff.groupby(["agent", "benchmark"])["delta_normalized"].mean().reset_index().sort_values("delta_normalized", ascending=False)
        if not agent_diff.empty
        else pd.DataFrame(columns=["agent", "benchmark", "delta_normalized"])
    )

    high_redundancy = corr_pairs[corr_pairs["spearman"] > 0.85].sort_values("spearman", ascending=False)
    negative_pairs = corr_pairs.sort_values("spearman", ascending=True)
    unique_benchmarks = predictability.sort_values("cv_r2")
    missing_benchmarks = benchmark_result.stats.sort_values("missing_fraction", ascending=False)
    frontier_counts = task_summary.sort_values("frontier", ascending=False)

    lines = [
        "# Cross-Benchmark Analysis Summary",
        "",
        "## Scope",
        "",
        "This run uses the two currently available raw score matrices: `benchmark_level_matrix.csv` and `task_level_matrix.csv`. The pipeline treats rows as `(model, agent)` systems, benchmark columns as benchmark-level scores, and task columns as `benchmark/task_id` scores.",
        "",
        "The current data does not include repeated trials, trajectories, token counts, wall time, or run-level error labels, so the pipeline implements the matrix analyses now and records the trial/trajectory phases as pending.",
        "",
        "## Imputation",
        "",
        f"- Benchmark matrix: {benchmark_result.raw.shape[0]} systems x {benchmark_result.raw.shape[1] - 2} benchmarks, raw missing fraction {benchmark_result.missing_fraction:.3f}, selected SVD rank {benchmark_result.best_rank}.",
        f"- Task matrix: {task_result.raw.shape[0]} systems x {task_result.raw.shape[1] - 2} tasks, raw missing fraction {task_result.missing_fraction:.3f}, selected SVD rank {task_result.best_rank}.",
        "- Imputation is performed after `log1p` transforms for nonnegative unbounded columns and robust per-column centering/scaling; observed values are written back exactly; imputed raw values are inverse-transformed and clipped to each column's observed min/max.",
        "",
        "## Top Systems",
        "",
        *top_records(system_df, ["rank", "model", "agent", "normalized_mean", "observed_fraction"], 10),
        "",
        "## Variance Attribution",
        "",
        *top_records(variance_df, ["component", "partial_r2_over_other_main_effects", "r2", "type"], 8),
        "",
        "## Redundant Benchmark Pairs",
        "",
        *top_records(high_redundancy, ["left", "right", "spearman"], 12),
        "",
        "## Most Anti-Correlated or Divergent Pairs",
        "",
        *top_records(negative_pairs, ["left", "right", "spearman"], 8),
        "",
        "## Least Predictable Benchmarks",
        "",
        *top_records(unique_benchmarks, ["benchmark", "cv_r2", "cv_rmse"], 12),
        "",
        "## Most Incomplete Benchmarks",
        "",
        *top_records(missing_benchmarks, ["column", "missing_fraction", "observed_count"], 12),
        "",
        "## Task-Level Frontier Candidates",
        "",
        *top_records(frontier_counts, ["benchmark", "n_tasks", "frontier", "hard", "mean_missing_fraction"], 12),
        "",
        "## Strongest Agent Differentials vs terminus-2",
        "",
        *top_records(agent_summary, ["agent", "benchmark", "delta_normalized"], 12),
        "",
        "## Pending Analyses",
        "",
        "- Trial consistency, pass@k, reliability profiles, and efficiency metrics need per-trial run data.",
        "- LLM trajectory failure taxonomy, bottleneck CDFs, and step-level error distributions need trajectories and run metadata.",
        "- Full IRT/DIF is deferred until repeated binary response data is available. The current task table includes item difficulty tiers and strength-correlation proxies as a preparatory layer.",
        "- Scaling/provider analysis needs provider metadata such as parameter count, release date, and model family labels.",
        "",
    ]
    (REPORT_DIR / "analysis_summary.md").write_text("\n".join(lines))


def run_pipeline() -> None:
    prepare_output_dirs()
    raw_benchmark = read_matrix(RAW_DIR / "benchmark_level_matrix.csv")
    raw_task = read_matrix(RAW_DIR / "task_level_matrix.csv")
    if not raw_benchmark[KEY_COLUMNS].equals(raw_task[KEY_COLUMNS]):
        raise ValueError("Benchmark and task matrices do not have identical system rows.")

    benchmark_result = svd_impute_dataframe(
        raw_benchmark,
        ranks=[1, 2, 3, 4, 5, 6, 8, 10],
        holdout_fraction=0.12,
        seed=RANDOM_SEED,
    )
    task_result = svd_impute_dataframe(
        raw_task,
        ranks=[2, 4, 6, 8, 10, 12, 16, 20],
        holdout_fraction=0.05,
        seed=RANDOM_SEED,
    )

    write_matrix_outputs("benchmark", benchmark_result)
    write_matrix_outputs("task", task_result)
    tables = write_tables(raw_benchmark, raw_task, benchmark_result, task_result)
    run_refined_studies(raw_benchmark, raw_task, benchmark_result, task_result, tables)
    save_figures(benchmark_result, task_result, tables)
    write_report(benchmark_result, task_result, tables)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the HaborMix score-matrix analysis pipeline.")
    parser.parse_args()
    run_pipeline()


if __name__ == "__main__":
    main()
