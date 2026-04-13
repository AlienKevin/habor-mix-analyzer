from __future__ import annotations

from ..core import *
from ..preprocessing.svd_imputation import singular_value_report


def benchmark_long(raw: pd.DataFrame, aggregated: pd.DataFrame, normalized: pd.DataFrame) -> pd.DataFrame:
    rows: list[pd.DataFrame] = []
    for benchmark in score_columns(raw):
        part = raw[KEY_COLUMNS].copy()
        part["benchmark"] = benchmark
        part["original_benchmark_table_score"] = raw[benchmark]
        part["benchmark_score"] = aggregated[benchmark]
        part["normalized_score"] = normalized[benchmark]
        part["original_benchmark_table_missing"] = raw[benchmark].isna()
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
    agent_model_strength = benchmark_imputed.normalized[score_columns(benchmark_imputed.normalized)].mean(axis=1).to_numpy()

    records: list[dict[str, float | int | str]] = []
    meta = task_metadata(task_cols).set_index("task_column")
    for col in task_cols:
        observed = raw_values[col].dropna()
        count = int(observed.shape[0])
        raw_mean = float(observed.mean()) if count else np.nan
        raw_min = float(observed.min()) if count else np.nan
        raw_max = float(observed.max()) if count else np.nan
        imputed_mean = float(imputed_raw_values[col].mean())
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
                "imputed_mean": imputed_mean,
                "imputed_normalized_mean": float(imputed_norm_values[col].mean()),
                "imputed_normalized_std": float(imputed_norm_values[col].std(ddof=0)),
                "strength_correlation": corr_or_nan(imputed_norm_values[col].to_numpy(), agent_model_strength),
                "difficulty_tier": bounded_tier(imputed_mean, raw_min, raw_max),
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
            mean_task_score=("imputed_mean", "mean"),
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


def agent_model_strength_scores(benchmark_result: ImputationResult, raw_benchmark: pd.DataFrame) -> pd.DataFrame:
    cols = score_columns(benchmark_result.normalized)
    out = benchmark_result.normalized[KEY_COLUMNS].copy()
    out["normalized_mean"] = benchmark_result.normalized[cols].mean(axis=1)
    out["normalized_median"] = benchmark_result.normalized[cols].median(axis=1)
    out["original_benchmark_table_coverage"] = raw_benchmark[cols].notna().mean(axis=1)
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
    agent_model_latent = benchmark_result.normalized[KEY_COLUMNS].copy()
    for i in range(n_components):
        agent_model_latent[f"PC{i + 1}"] = scores[:, i]
    explained = pd.DataFrame(
        {
            "component": [f"PC{i + 1}" for i in range(n_components)],
            "explained_variance_ratio": pca.explained_variance_ratio_,
        }
    )
    return loadings, agent_model_latent, explained


def write_tables(
    raw_benchmark: pd.DataFrame,
    raw_task: pd.DataFrame,
    benchmark_result: ImputationResult,
    task_result: ImputationResult,
) -> dict[str, pd.DataFrame]:
    long_df = benchmark_long(raw_benchmark, benchmark_result.raw, benchmark_result.normalized)
    item_stats, task_summary, task_benchmark_matrix = task_stats(raw_task, task_result, benchmark_result)
    agent_model_strength = agent_model_strength_scores(benchmark_result, raw_benchmark)
    agent_diff = agent_differential(benchmark_result)
    variance_df = variance_decomposition(long_df)
    corr, corr_pairs = benchmark_correlations(benchmark_result)
    predictability = benchmark_predictability(benchmark_result)
    loadings, latent_agent_model_scores, latent_explained = latent_loadings(benchmark_result)
    svd_report = pd.concat(
        [singular_value_report("benchmark", benchmark_result), singular_value_report("task", task_result)],
        ignore_index=True,
    )

    tables = {
        "benchmark_observed_imputed_long": long_df,
        "task_item_stats": item_stats,
        "task_benchmark_summary": task_summary,
        "task_benchmark_matrix_from_tasks": task_benchmark_matrix,
        "agent_model_strength_scores": agent_model_strength,
        "agent_differential_by_benchmark": agent_diff,
        "variance_decomposition": variance_df,
        "benchmark_correlations": corr.reset_index(names="benchmark"),
        "benchmark_redundancy_pairs": corr_pairs,
        "benchmark_predictability": predictability,
        "benchmark_latent_loadings": loadings,
        "benchmark_latent_agent_model_scores": latent_agent_model_scores,
        "benchmark_latent_explained_variance": latent_explained,
        "svd_scree": svd_report,
    }
    for name, table in tables.items():
        table.to_csv(PROCESSED_DIR / f"{name}.csv", index=False)
    return tables
