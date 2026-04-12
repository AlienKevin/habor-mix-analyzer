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
PROCESSED_DIR = ROOT / "data" / "processed" / "generated"
OUTPUT_DIR = ROOT / "output"
FIGURE_DIR = OUTPUT_DIR / "figures"
TABLE_DIR = OUTPUT_DIR / "tables"
REPORT_DIR = OUTPUT_DIR / "reports"

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
    for path in [PROCESSED_DIR, FIGURE_DIR, TABLE_DIR, REPORT_DIR]:
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
    save_figures(benchmark_result, task_result, tables)
    write_report(benchmark_result, task_result, tables)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the HaborMix score-matrix analysis pipeline.")
    parser.parse_args()
    run_pipeline()


if __name__ == "__main__":
    main()
