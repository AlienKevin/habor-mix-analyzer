from __future__ import annotations

from ..core import *


def save_paper_agent_model_score_plot(scores: pd.DataFrame) -> None:
    plot_df = scores.sort_values("mean_score_percentile_across_benchmarks").tail(18)
    labels = [wrap_text(value, width=32) for value in plot_df["agent_model"]]
    fig, ax = plt.subplots(figsize=(12, 8.5))
    ax.barh(labels, plot_df["mean_score_percentile_across_benchmarks"], color="#9ecae1", edgecolor="white")
    ax.set_title("Top Agent+Model Pairs by Benchmark Score Percentile")
    ax.set_xlabel("Mean within-benchmark score percentile\n(1.0 = best score on each benchmark)")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    save_paper_figure(fig, "benchmark_agent_model_top_scores.png")
    plt.close(fig)


def benchmark_mini_leaderboard_tables_and_figures(
    benchmark_result: ImputationResult,
    clusters: pd.DataFrame,
    included_benchmarks: list[str],
) -> tuple[pd.DataFrame, list[str]]:
    scores = benchmark_result.raw.copy()
    scores["agent_model"] = scores["agent"] + " + " + scores["model"]
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
            leaders = scores[["agent_model", "model", "agent", benchmark]].sort_values(benchmark, ascending=False).head(6)
            leaders = leaders.rename(columns={benchmark: "benchmark_score"})
            for rank, (_, row) in enumerate(leaders.iterrows(), start=1):
                rows.append(
                    {
                        "similarity_cluster": cluster_id,
                        "benchmark": benchmark,
                        "rank": rank,
                        "agent_model": row["agent_model"],
                        "model": row["model"],
                        "agent": row["agent"],
                        "benchmark_score": row["benchmark_score"],
                        "benchmark_relative_score_for_cross_benchmark_methods": float(
                            normalized.loc[row.name, benchmark]
                        ),
                    }
                )
            labels = [wrap_text(value, 28) for value in leaders["agent_model"][::-1]]
            ax.barh(labels, leaders["benchmark_score"][::-1], color="#9ecae1", edgecolor="white")
            ax.set_title(wrap_text(benchmark, 22), fontsize=12)
            ax.set_xlabel("Benchmark score", fontsize=9)
            ax.tick_params(axis="y", labelsize=8)
            ax.tick_params(axis="x", labelsize=8)
            ax.grid(axis="x", color="#dddddd", linewidth=0.8)
        for ax in axes_flat[n:]:
            ax.axis("off")
        fig.suptitle(
            f"Benchmark Score Mini-Leaderboards for Similarity Cluster {cluster_id}\n"
            "Scores are SVD-filled only where the original benchmark cell was missing",
            y=1.0,
        )
        fig.tight_layout()
        filename = f"mini_leaderboards_cluster_{cluster_id}.png"
        save_paper_figure(fig, filename)
        plt.close(fig)
        figure_paths.append(filename)
    return pd.DataFrame(rows), figure_paths
