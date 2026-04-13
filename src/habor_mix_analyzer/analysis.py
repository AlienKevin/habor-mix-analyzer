from __future__ import annotations

from .common import *
from .imputation import singular_value_report


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
    return tables

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
    raw_scores = benchmark_result.raw[cols].astype(float)
    raw_rank_percentile = raw_scores.rank(axis=0, ascending=True, pct=True)
    out["mean_raw_score_percentile_across_benchmarks"] = raw_rank_percentile.mean(axis=1)
    out["median_raw_score_percentile_across_benchmarks"] = raw_rank_percentile.median(axis=1)
    out["mean_benchmark_relative_score"] = benchmark_result.normalized[cols].mean(axis=1)
    out["median_benchmark_relative_score"] = benchmark_result.normalized[cols].median(axis=1)
    out["observed_fraction_on_included_benchmarks"] = raw_benchmark[cols].notna().mean(axis=1)
    out["rank"] = out["mean_raw_score_percentile_across_benchmarks"].rank(ascending=False, method="min").astype(int)
    return out.sort_values("rank")

def benchmark_raw_scores_long(
    raw_benchmark: pd.DataFrame,
    benchmark_result: ImputationResult,
    cols: list[str],
) -> pd.DataFrame:
    rows: list[pd.DataFrame] = []
    for benchmark in cols:
        part = benchmark_result.raw[KEY_COLUMNS].copy()
        part["agent_model"] = part["agent"] + " + " + part["model"]
        part["benchmark"] = benchmark
        part["raw_benchmark_score"] = benchmark_result.raw[benchmark]
        part["observed_raw_benchmark_score"] = raw_benchmark[benchmark]
        part["benchmark_relative_score_for_cross_benchmark_methods"] = benchmark_result.normalized[benchmark]
        part["was_svd_filled"] = raw_benchmark[benchmark].isna()
        rows.append(part)
    return pd.concat(rows, ignore_index=True)

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
            "primary_matrix": "SVD-filled raw benchmark matrix",
            "processed_output": "data/processed/intermediate/benchmark_svd_imputed_matrix.csv",
            "notes": "Ranks agent+model rows by mean within-benchmark percentile computed from raw benchmark scores.",
        },
        {
            "analysis": "per-benchmark mini-leaderboards",
            "primary_matrix": "SVD-filled raw benchmark matrix",
            "processed_output": "data/processed/intermediate/benchmark_svd_imputed_matrix.csv",
            "notes": "Displays raw scores on each benchmark's original metric scale; an observed/imputed flag is retained in the long table.",
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
            "notes": "Uses benchmark-relative score profiles so Spearman similarity and ridge prediction are not dominated by raw score scale.",
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

def benchmark_similarity_clusters(corr: pd.DataFrame, n_clusters: int = 6) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    matrix = corr.set_index("benchmark")
    matrix = matrix.loc[matrix.columns, matrix.columns].fillna(0)
    distance_array = (1 - matrix.abs()).to_numpy(copy=True)
    np.fill_diagonal(distance_array, 0)
    condensed = squareform(distance_array, checks=False)
    z = linkage(condensed, method="average")
    order = matrix.index[leaves_list(z)].tolist()
    labels = fcluster(z, t=n_clusters, criterion="maxclust")
    clusters = pd.DataFrame({"benchmark": matrix.index, "similarity_cluster": labels})
    clusters = clusters.sort_values(["similarity_cluster", "benchmark"]).reset_index(drop=True)
    ordered_corr = matrix.loc[order, order].reset_index(names="benchmark")
    return clusters, ordered_corr, order

def task_similarity_and_representatives(
    task_result: ImputationResult,
    tasks_enriched: pd.DataFrame,
    benchmark_clusters: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    reliable = tasks_enriched[
        tasks_enriched["is_bounded_score_task"]
        & tasks_enriched["is_reliable_observed_task"]
        & (tasks_enriched["observed_std"] >= 0.05)
    ].copy()
    reliable_columns = [col for col in reliable["task_column"] if col in task_result.normalized.columns]
    matrix = task_result.normalized[reliable_columns].astype(float)
    standardized = (matrix - matrix.mean(axis=0)) / matrix.std(axis=0, ddof=0).replace(0, np.nan)
    standardized = standardized.fillna(0)
    task_profiles = standardized.to_numpy().T
    corr = (task_profiles @ task_profiles.T) / task_profiles.shape[1]
    corr = np.clip(np.nan_to_num(corr), -1, 1)
    np.fill_diagonal(corr, 1)
    task_index = pd.Index(reliable_columns)
    bench_for_task = reliable.set_index("task_column").loc[task_index, "benchmark"]

    within_rows = []
    representative_rows = []
    predictability_rows = []
    positions_by_benchmark: dict[str, list[int]] = {}
    for position, benchmark in enumerate(bench_for_task.to_numpy()):
        positions_by_benchmark.setdefault(str(benchmark), []).append(position)

    for benchmark, positions in positions_by_benchmark.items():
        idx = np.array(positions, dtype=int)
        if len(idx) < 2:
            continue
        sub = np.abs(corr[np.ix_(idx, idx)])
        np.fill_diagonal(sub, np.nan)
        mean_peer = np.nanmean(sub, axis=1)
        max_peer = np.nanmax(sub, axis=1)
        within_rows.append(
            {
                "benchmark": benchmark,
                "n_reliable_tasks": len(idx),
                "median_abs_task_similarity_within_benchmark": float(np.nanmedian(sub)),
                "mean_abs_task_similarity_within_benchmark": float(np.nanmean(sub)),
            }
        )
        aggregate = task_profiles[idx].mean(axis=0)
        aggregate_corr = np.array([corr_or_nan(task_profiles[i], aggregate) for i in idx])
        for local_pos, task_idx in enumerate(idx):
            task_col = task_index[task_idx]
            task_row = reliable[reliable["task_column"] == task_col].iloc[0]
            representative_rows.append(
                {
                    "benchmark": benchmark,
                    "task_column": task_col,
                    "task_id": task_row["task_id"],
                    "representativeness_score": float(abs(aggregate_corr[local_pos])),
                    "mean_abs_similarity_to_peer_tasks": float(mean_peer[local_pos]),
                    "difficulty_tier": task_row["difficulty_tier"],
                    "observed_mean": task_row["observed_mean"],
                    "observed_std": task_row["observed_std"],
                    "strength_correlation": task_row["strength_correlation"],
                }
            )
            predictability_rows.append(
                {
                    "benchmark": benchmark,
                    "task_column": task_col,
                    "task_id": task_row["task_id"],
                    "task_predictability_proxy_max_abs_peer_spearman": float(max_peer[local_pos]),
                    "task_unpredictability_score": float(1 - max_peer[local_pos]),
                    "observed_count": int(task_row["observed_count"]),
                    "difficulty_tier": task_row["difficulty_tier"],
                    "observed_mean": task_row["observed_mean"],
                    "observed_std": task_row["observed_std"],
                }
            )

    sampled = (
        reliable.sort_values(["mix_selection_score", "observed_count"], ascending=False)
        .groupby("benchmark")
        .head(40)
        .reset_index(drop=True)
    )
    sampled_cols = [col for col in sampled["task_column"] if col in task_index]
    sampled_positions = task_index.get_indexer(sampled_cols)
    pair_rows = []
    for left_bench, left_group in sampled.groupby("benchmark"):
        left_idx = task_index.get_indexer(left_group["task_column"])
        for right_bench, right_group in sampled.groupby("benchmark"):
            if right_bench < left_bench:
                continue
            right_idx = task_index.get_indexer(right_group["task_column"])
            pair_corr = np.abs(corr[np.ix_(left_idx, right_idx)])
            if left_bench == right_bench:
                pair_corr = pair_corr[~np.eye(pair_corr.shape[0], dtype=bool)]
            pair_rows.append(
                {
                    "left_benchmark": left_bench,
                    "right_benchmark": right_bench,
                    "median_abs_task_similarity": float(np.nanmedian(pair_corr)) if pair_corr.size else np.nan,
                    "mean_abs_task_similarity": float(np.nanmean(pair_corr)) if pair_corr.size else np.nan,
                    "sampled_left_tasks": len(left_idx),
                    "sampled_right_tasks": len(right_idx),
                }
            )

    within = pd.DataFrame(within_rows).sort_values("median_abs_task_similarity_within_benchmark", ascending=False)
    representatives = pd.DataFrame(representative_rows).sort_values("representativeness_score", ascending=False)
    task_predictability = pd.DataFrame(predictability_rows).sort_values("task_unpredictability_score", ascending=False)
    cross = pd.DataFrame(pair_rows).sort_values("median_abs_task_similarity", ascending=False)
    return within, representatives, task_predictability, cross

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
