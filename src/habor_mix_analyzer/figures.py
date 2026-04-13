from __future__ import annotations

from .common import *


def save_paper_agent_model_score_plot(scores: pd.DataFrame) -> None:
    plot_df = scores.sort_values("mean_raw_score_percentile_across_benchmarks").tail(18)
    labels = [wrap_text(value, width=32) for value in plot_df["agent_model"]]
    fig, ax = plt.subplots(figsize=(12, 8.5))
    ax.barh(labels, plot_df["mean_raw_score_percentile_across_benchmarks"], color="#9ecae1", edgecolor="white")
    ax.set_title("Top Agent+Model Pairs by Raw Benchmark Score Percentile")
    ax.set_xlabel("Mean within-benchmark percentile from raw scores\n(1.0 = best raw score on each benchmark)")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    save_paper_figure(fig, "benchmark_agent_model_top_scores.png")
    plt.close(fig)

def save_paper_effect_plot(effects: pd.DataFrame, group_col: str, filename: str, title: str) -> None:
    plot_df = effects.sort_values("adjusted_mean")
    labels = [wrap_text(value, width=28) for value in plot_df[group_col]]
    fig, ax = plt.subplots(figsize=(11.5, max(5.2, 0.42 * len(plot_df))))
    ax.barh(labels, plot_df["adjusted_mean"], color="#a1d99b", edgecolor="white")
    ax.axvline(0, color="#666666", linewidth=1)
    ax.set_title(title)
    ax.set_xlabel("Adjusted benchmark-relative score\n(0 = benchmark median; +1 = one robust scale above median)")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    save_paper_figure(fig, filename)
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
    ax.set_xticklabels([wrap_text(col, 14) for col in pivot.columns], rotation=45, ha="right", fontsize=9)
    ax.set_yticks(np.arange(pivot.shape[0]))
    ax.set_yticklabels([wrap_text(value, 20) for value in pivot.index])
    cbar = fig.colorbar(image, ax=ax, fraction=0.035, pad=0.02)
    cbar.set_label(DELTA_SCORE_LABEL)
    fig.tight_layout()
    save_paper_figure(fig, "benchmark_agent_lift_heatmap.png")
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
    label_df = plot_df.sort_values("cv_r2_from_other_included_benchmarks").head(6)
    for i, row in enumerate(label_df.itertuples()):
        x_offset = -62 if row.observed_count >= 25 else 6
        y_offset = [8, -10, 16, -18][i % 4]
        ax.annotate(
            wrap_text(row.benchmark, 14),
            (row.observed_count, row.cv_r2_from_other_included_benchmarks),
            xytext=(x_offset, y_offset),
            textcoords="offset points",
            fontsize=9,
        )
    ax.axhline(0, color="#777777", linewidth=1)
    ax.set_title("Benchmark Uniqueness After Coverage Filtering")
    ax.set_xlabel("Observed agent+model rows")
    ax.set_ylabel("Cross-validated R2 from other included benchmarks")
    ax.grid(color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    save_paper_figure(fig, "benchmark_uniqueness_vs_coverage.png")
    plt.close(fig)

def save_task_composition_plot(task_summary: pd.DataFrame) -> None:
    tier_cols = [col for col in ["hard", "medium", "easy", "frontier", "saturated"] if col in task_summary.columns]
    plot_df = task_summary.sort_values("candidate_pool_tasks", ascending=False).head(25).set_index("benchmark")
    colors = ["#74c476", "#9ecae1", "#fdd0a2", "#c7e9c0", "#fdae6b"]
    fig, ax = plt.subplots(figsize=(14, 8))
    bottom = np.zeros(plot_df.shape[0])
    for col, color in zip(tier_cols, colors):
        values = plot_df[col].to_numpy(dtype=float)
        ax.bar([wrap_text(value, 14) for value in plot_df.index], values, bottom=bottom, label=col, color=color, edgecolor="white")
        bottom += values
    ax.set_title("Reliable Bounded Task Difficulty Composition")
    ax.set_ylabel("Reliable task count")
    ax.set_xlabel("")
    ax.tick_params(axis="x", rotation=35, labelsize=9)
    ax.legend(ncols=min(5, len(tier_cols)), frameon=False)
    fig.tight_layout()
    save_paper_figure(fig, "task_reliable_difficulty_composition.png")
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
    save_paper_figure(fig, "task_to_benchmark_alignment.png")
    plt.close(fig)

def save_benchmark_role_plot(role: pd.DataFrame) -> None:
    plot_df = role.copy()
    fig, ax = plt.subplots(figsize=(10, 8))
    colors = np.where(plot_df["dominant_dimension"] == "model", "#9ecae1", "#fdae6b")
    ax.scatter(
        plot_df["model_partial_r2_over_agent"],
        plot_df["agent_partial_r2_over_model"],
        s=95,
        color=colors,
        edgecolor="white",
        alpha=0.9,
    )
    lim = max(plot_df[["model_partial_r2_over_agent", "agent_partial_r2_over_model"]].max().max(), 0.05)
    ax.plot([0, lim], [0, lim], color="#666666", linewidth=1)
    label_df = pd.concat(
        [
            plot_df.sort_values("model_partial_r2_over_agent", ascending=False).head(4),
            plot_df.sort_values("agent_partial_r2_over_model", ascending=False).head(1),
        ],
        ignore_index=True,
    ).drop_duplicates("benchmark")
    for i, row in enumerate(label_df.itertuples()):
        x_offset = -78 if row.model_partial_r2_over_agent > 0.75 else 6
        y_offset = [8, -12, 18, -20][i % 4]
        ax.annotate(
            wrap_text(row.benchmark, 14),
            (row.model_partial_r2_over_agent, row.agent_partial_r2_over_model),
            xytext=(x_offset, y_offset),
            textcoords="offset points",
            fontsize=9,
        )
    ax.set_title("Per-Benchmark Model vs Agent Explanatory Power")
    ax.set_xlabel("Partial R2 added by model after controlling for agent")
    ax.set_ylabel("Partial R2 added by agent after controlling for model")
    ax.grid(color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    save_paper_figure(fig, "benchmark_model_vs_agent_role.png")
    plt.close(fig)

def save_variance_paper_plot(variance_df: pd.DataFrame) -> None:
    plot_df = variance_df[variance_df["component"] != "all_main_effects"].sort_values(
        "partial_r2_over_other_main_effects"
    )
    fig, ax = plt.subplots(figsize=(10, 5.8))
    ax.barh(plot_df["component"], plot_df["partial_r2_over_other_main_effects"], color="#bcbddc", edgecolor="white")
    ax.set_title("Benchmark-Level Score Variance Attribution")
    ax.set_xlabel("Partial R2: extra variance explained after other main effects")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    save_paper_figure(fig, "benchmark_variance_attribution.png")
    plt.close(fig)

def save_benchmark_cluster_heatmap(ordered_corr: pd.DataFrame) -> None:
    matrix = ordered_corr.set_index("benchmark")
    fig, ax = plt.subplots(figsize=(15, 13))
    image = ax.imshow(matrix.to_numpy(dtype=float), cmap="RdBu_r", vmin=-1, vmax=1)
    ax.set_title("Clustered Benchmark Similarity")
    ax.set_xticks(np.arange(matrix.shape[1]))
    ax.set_xticklabels([wrap_text(value, 13) for value in matrix.columns], rotation=45, ha="right", fontsize=8)
    ax.set_yticks(np.arange(matrix.shape[0]))
    ax.set_yticklabels([wrap_text(value, 16) for value in matrix.index], fontsize=9)
    cbar = fig.colorbar(image, ax=ax, fraction=0.035, pad=0.02)
    cbar.set_label("Spearman correlation of agent+model score profiles")
    fig.tight_layout()
    save_paper_figure(fig, "benchmark_similarity_clustered_heatmap.png")
    plt.close(fig)

def save_task_similarity_heatmap(cross_similarity: pd.DataFrame, benchmark_clusters: pd.DataFrame) -> None:
    if cross_similarity.empty:
        return
    pivot = cross_similarity.pivot(index="left_benchmark", columns="right_benchmark", values="median_abs_task_similarity")
    all_benchmarks = sorted(set(pivot.index) | set(pivot.columns))
    pivot = pivot.reindex(index=all_benchmarks, columns=all_benchmarks)
    for left in all_benchmarks:
        for right in all_benchmarks:
            if pd.isna(pivot.loc[left, right]) and right in pivot.index and left in pivot.columns:
                pivot.loc[left, right] = pivot.loc[right, left]
    pivot = pivot.fillna(0)
    clusters = benchmark_clusters.set_index("benchmark")["similarity_cluster"]
    order = sorted(all_benchmarks, key=lambda b: (clusters.get(b, 999), b))
    pivot = pivot.loc[order, order]
    fig, ax = plt.subplots(figsize=(15, 13))
    image = ax.imshow(pivot.to_numpy(dtype=float), cmap="YlGnBu", vmin=0, vmax=1)
    ax.set_title("Task Similarity Within and Across Benchmarks")
    ax.set_xticks(np.arange(len(order)))
    ax.set_xticklabels([wrap_text(value, 13) for value in order], rotation=45, ha="right", fontsize=8)
    ax.set_yticks(np.arange(len(order)))
    ax.set_yticklabels([wrap_text(value, 16) for value in order], fontsize=9)
    cbar = fig.colorbar(image, ax=ax, fraction=0.035, pad=0.02)
    cbar.set_label("Median absolute Spearman correlation between reliable task score profiles")
    fig.tight_layout()
    save_paper_figure(fig, "task_similarity_benchmark_pair_heatmap.png")
    plt.close(fig)

def save_task_predictability_plot(task_predictability: pd.DataFrame) -> None:
    plot_df = task_predictability.head(40).sort_values("task_unpredictability_score")
    labels = [wrap_text(f"{row.benchmark} / {str(row.task_id)[:46]}", 38) for row in plot_df.itertuples()]
    fig, ax = plt.subplots(figsize=(13, 15))
    ax.barh(labels, plot_df["task_unpredictability_score"], color="#fdae6b", edgecolor="white")
    ax.set_title("Hard-to-Predict Reliable Tasks")
    ax.set_xlabel("Task unpredictability proxy\n(1 - max absolute peer-task Spearman correlation)")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    save_paper_figure(fig, "task_hard_to_predict_ranked.png")
    plt.close(fig)

def save_representative_task_plot(representatives: pd.DataFrame) -> None:
    top = representatives.sort_values("representativeness_score", ascending=False).groupby("benchmark").head(1)
    plot_df = top.sort_values("representativeness_score", ascending=True).tail(35)
    labels = [wrap_text(f"{row.benchmark} / {str(row.task_id)[:44]}", 38) for row in plot_df.itertuples()]
    fig, ax = plt.subplots(figsize=(13, 13))
    ax.barh(labels, plot_df["representativeness_score"], color="#a1d99b", edgecolor="white")
    ax.set_title("Best Single Task Representative per Benchmark")
    ax.set_xlabel("Absolute correlation with benchmark's\nreliable-task aggregate")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    save_paper_figure(fig, "task_best_representatives.png")
    plt.close(fig)

def save_terminus_delta_by_model_plot(terminus_by_model: pd.DataFrame) -> None:
    if terminus_by_model.empty:
        return
    pivot = terminus_by_model.pivot(index="agent", columns="model", values="mean_delta_vs_terminus").fillna(0)
    fig, ax = plt.subplots(figsize=(11, max(3.8, 0.7 * pivot.shape[0])))
    image = ax.imshow(pivot.to_numpy(dtype=float), cmap="BrBG", vmin=-2.0, vmax=2.0)
    ax.set_title("How Each Agent Changes Performance vs Terminus by Model")
    ax.set_xticks(np.arange(pivot.shape[1]))
    ax.set_xticklabels([wrap_text(value, 18) for value in pivot.columns], rotation=35, ha="right")
    ax.set_yticks(np.arange(pivot.shape[0]))
    ax.set_yticklabels([wrap_text(value, 20) for value in pivot.index])
    cbar = fig.colorbar(image, ax=ax, fraction=0.045, pad=0.02)
    cbar.set_label(DELTA_SCORE_LABEL)
    fig.tight_layout()
    save_paper_figure(fig, "terminus_delta_by_model_heatmap.png")
    plt.close(fig)

def save_harbormix_selection_plot(selected_tasks: pd.DataFrame) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(18, 8.5))
    counts = selected_tasks["benchmark"].value_counts().sort_values()
    axes[0].barh(counts.index, counts.values, color="#9ecae1", edgecolor="white")
    axes[0].tick_params(axis="y", labelsize=10)
    axes[0].set_title("Selected HaborMix Candidate Tasks by Benchmark")
    axes[0].set_xlabel("Selected task count")
    axes[0].set_ylabel("")
    scatter = axes[1].scatter(
        selected_tasks["observed_mean"],
        selected_tasks["strength_correlation"],
        s=50 + 220 * selected_tasks["observed_std"].fillna(0),
        c=selected_tasks["mix_selection_score"],
        cmap="YlGnBu",
        edgecolor="white",
        alpha=0.85,
    )
    axes[1].set_title("HaborMix Candidate Selection Signals")
    axes[1].set_xlabel("Observed mean task score\n(empirical pass-rate scale for bounded tasks)")
    axes[1].set_ylabel("Correlation with overall\nagent+model strength")
    axes[1].grid(color="#dddddd", linewidth=0.8)
    cbar = fig.colorbar(scatter, ax=axes[1], fraction=0.045, pad=0.02)
    cbar.set_label("Selection score")
    fig.tight_layout()
    save_paper_figure(fig, "harbormix_selection_diagnostics.png")
    plt.close(fig)

def benchmark_mini_leaderboard_tables_and_figures(
    benchmark_result: ImputationResult,
    clusters: pd.DataFrame,
    included_benchmarks: list[str],
) -> tuple[pd.DataFrame, list[str]]:
    raw = benchmark_result.raw.copy()
    raw["agent_model"] = raw["agent"] + " + " + raw["model"]
    normalized = benchmark_result.normalized.copy()
    rows = []
    figure_paths = []
    for cluster_id, group in clusters[clusters["benchmark"].isin(included_benchmarks)].groupby("similarity_cluster"):
        benchmarks = group["benchmark"].tolist()
        n = len(benchmarks)
        ncols = 2
        nrows = math.ceil(n / ncols)
        fig, axes = plt.subplots(nrows, ncols, figsize=(18, max(5, 3.1 * nrows)))
        axes_flat = np.atleast_1d(axes).ravel()
        for ax, benchmark in zip(axes_flat, benchmarks):
            leaders = raw[["agent_model", "model", "agent", benchmark]].sort_values(benchmark, ascending=False).head(6)
            leaders = leaders.rename(columns={benchmark: "raw_benchmark_score"})
            for rank, (_, row) in enumerate(leaders.iterrows(), start=1):
                rows.append(
                    {
                        "similarity_cluster": cluster_id,
                        "benchmark": benchmark,
                        "rank": rank,
                        "agent_model": row["agent_model"],
                        "model": row["model"],
                        "agent": row["agent"],
                        "raw_benchmark_score": row["raw_benchmark_score"],
                        "benchmark_relative_score_for_cross_benchmark_methods": float(
                            normalized.loc[row.name, benchmark]
                        ),
                    }
                )
            labels = [wrap_text(value, 28) for value in leaders["agent_model"][::-1]]
            ax.barh(labels, leaders["raw_benchmark_score"][::-1], color="#9ecae1", edgecolor="white")
            ax.set_title(wrap_text(benchmark, 22), fontsize=12)
            ax.set_xlabel("Raw benchmark score", fontsize=9)
            ax.tick_params(axis="y", labelsize=8)
            ax.tick_params(axis="x", labelsize=8)
            ax.grid(axis="x", color="#dddddd", linewidth=0.8)
        for ax in axes_flat[n:]:
            ax.axis("off")
        fig.suptitle(
            f"Raw-Score Mini-Leaderboards for Benchmark Similarity Cluster {cluster_id}\n"
            "Scores are SVD-filled only where the raw benchmark cell was missing",
            y=1.0,
        )
        fig.tight_layout()
        filename = f"mini_leaderboards_cluster_{cluster_id}.png"
        save_paper_figure(fig, filename)
        plt.close(fig)
        figure_paths.append(filename)
    return pd.DataFrame(rows), figure_paths
