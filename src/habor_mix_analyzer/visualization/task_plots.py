from __future__ import annotations

from ..core import *


def save_task_composition_plot(task_summary: pd.DataFrame) -> None:
    tier_cols = [col for col in ["hard", "medium", "easy", "frontier", "saturated"] if col in task_summary.columns]
    plot_df = task_summary.sort_values("candidate_pool_tasks", ascending=False).head(25).set_index("benchmark")
    tier_labels = {
        "frontier": "frontier (<5% mean score)",
        "hard": "hard (5-30%)",
        "medium": "medium (30-70%)",
        "easy": "easy (70-95%)",
        "saturated": "saturated (>95%)",
    }
    colors = ["#74c476", "#9ecae1", "#fdd0a2", "#c7e9c0", "#fdae6b"]
    fig, ax = plt.subplots(figsize=(14, 8))
    bottom = np.zeros(plot_df.shape[0])
    for col, color in zip(tier_cols, colors):
        values = plot_df[col].to_numpy(dtype=float)
        ax.bar(
            [wrap_text(value, 14) for value in plot_df.index],
            values,
            bottom=bottom,
            label=tier_labels.get(col, col),
            color=color,
            edgecolor="white",
        )
        bottom += values
    ax.set_title("Reliable Bounded Task Difficulty Composition")
    ax.set_ylabel("Reliable task count")
    ax.set_xlabel("")
    ax.tick_params(axis="x", rotation=35, labelsize=9)
    ax.legend(title="Difficulty tier by mean task score", ncols=2, frameon=False)
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


def save_harbormix_selection_plot(selected_tasks: pd.DataFrame) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(18, 8.5))
    counts = selected_tasks["benchmark"].value_counts().sort_values()
    axes[0].barh(counts.index, counts.values, color="#9ecae1", edgecolor="white")
    axes[0].tick_params(axis="y", labelsize=10)
    axes[0].set_title("Selected HaborMix Candidate Tasks by Benchmark")
    axes[0].set_xlabel("Selected task count")
    axes[0].set_ylabel("")
    scatter = axes[1].scatter(
        selected_tasks["imputed_mean"],
        selected_tasks["strength_correlation"],
        s=50 + 220 * selected_tasks["observed_std"].fillna(0),
        c=selected_tasks["mix_selection_score"],
        cmap="YlGnBu",
        edgecolor="white",
        alpha=0.85,
    )
    axes[1].set_title("HaborMix Candidate Selection Signals")
    axes[1].set_xlabel("Mean task score after SVD filling\n(empirical pass-rate scale for bounded tasks)")
    axes[1].set_ylabel("Correlation with overall\nagent+model strength")
    axes[1].grid(color="#dddddd", linewidth=0.8)
    cbar = fig.colorbar(scatter, ax=axes[1], fraction=0.045, pad=0.02)
    cbar.set_label("Selection score")
    fig.tight_layout()
    save_paper_figure(fig, "harbormix_selection_diagnostics.png")
    plt.close(fig)
