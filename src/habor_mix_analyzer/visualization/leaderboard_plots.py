from __future__ import annotations

from ..core import *


def save_key_agent_model_score_plot(scores: pd.DataFrame) -> None:
    plot_df = scores.sort_values("mean_score_percentile_across_benchmarks").tail(18)
    labels = [wrap_text(value, width=32) for value in plot_df["agent_model"]]
    fig, ax = plt.subplots(figsize=(12, 8.5))
    ax.barh(labels, plot_df["mean_score_percentile_across_benchmarks"], color="#9ecae1", edgecolor="white")
    ax.set_title("Top Agent+Model Pairs by Benchmark Score Percentile")
    ax.set_xlabel("Mean within-benchmark score percentile\n(1.0 = best score on each benchmark)")
    ax.set_ylabel("")
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    fig.tight_layout()
    save_key_figure(fig, "benchmark_agent_model_top_scores.png")
    plt.close(fig)


def _plot_grouped_leaderboard(
    ax: plt.Axes,
    leaders: pd.DataFrame,
    benchmark: str,
    agent_colors: dict[str, str],
    label_size: int = 8,
) -> None:
    model_order = leaders.groupby("model")["benchmark_score"].max().sort_values(ascending=True).index.tolist()
    model_to_y = {model: pos for pos, model in enumerate(model_order)}
    for model, model_group in leaders.groupby("model", sort=False):
        group = model_group.sort_values("agent")
        offsets = np.linspace(-0.16, 0.16, len(group)) if len(group) > 1 else [0]
        for offset, row in zip(offsets, group.itertuples()):
            ax.barh(
                model_to_y[row.model] + offset,
                row.benchmark_score,
                height=0.28,
                color=agent_colors[row.agent],
                edgecolor="white",
                label=row.agent,
            )
    ax.set_yticks(list(model_to_y.values()))
    ax.set_yticklabels([wrap_text(model, 24) for model in model_order], fontsize=label_size)
    ax.set_title(wrap_text(benchmark, 28), fontsize=12)
    ax.set_xlabel("Benchmark score", fontsize=9)
    ax.tick_params(axis="x", labelsize=8)
    ax.grid(axis="x", color="#dddddd", linewidth=0.8)
    handles, labels = ax.get_legend_handles_labels()
    unique = dict(zip(labels, handles))
    ax.legend(unique.values(), unique.keys(), title="Agent", fontsize=7, title_fontsize=8, frameon=False)


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
    agents = sorted(scores["agent"].dropna().unique())
    palette = ["#9ecae1", "#fdae6b", "#a1d99b", "#bcbddc", "#fdd0a2"]
    agent_colors = {agent: palette[i % len(palette)] for i, agent in enumerate(agents)}
    for cluster_id, group in clusters[clusters["benchmark"].isin(included_benchmarks)].groupby("similarity_cluster"):
        benchmarks = group["benchmark"].tolist()
        n_models = scores["model"].nunique()
        cluster_pages = [benchmarks[i : i + 4] for i in range(0, len(benchmarks), 4)]
        for page_idx, page_benchmarks in enumerate(cluster_pages, start=1):
            ncols = 2 if len(page_benchmarks) > 1 else 1
            nrows = math.ceil(len(page_benchmarks) / ncols)
            panel_height = max(6.5, 0.26 * n_models)
            fig, axes = plt.subplots(nrows, ncols, figsize=(18, 2.0 + panel_height * nrows))
            axes_flat = np.atleast_1d(axes).ravel()
            for ax, benchmark in zip(axes_flat, page_benchmarks):
                leaders = scores[["agent_model", "model", "agent", benchmark]].sort_values(
                    ["model", "agent"], ascending=[True, True]
                )
                leaders = leaders.rename(columns={benchmark: "benchmark_score"})
                ranked = leaders.sort_values("benchmark_score", ascending=False).reset_index()
                for rank, row in enumerate(ranked.itertuples(), start=1):
                    rows.append(
                        {
                            "similarity_cluster": cluster_id,
                            "benchmark": benchmark,
                            "rank": rank,
                            "agent_model": row.agent_model,
                            "model": row.model,
                            "agent": row.agent,
                            "benchmark_score": row.benchmark_score,
                            "benchmark_relative_score_for_cross_benchmark_methods": float(
                                normalized.loc[row.index, benchmark]
                            ),
                        }
                    )
                _plot_grouped_leaderboard(ax, leaders, benchmark, agent_colors, label_size=7)
                single_fig, single_ax = plt.subplots(figsize=(12, max(6, 0.44 * n_models)))
                _plot_grouped_leaderboard(single_ax, leaders, benchmark, agent_colors, label_size=9)
                single_fig.suptitle(
                    "Rows are models; colored paired bars compare available agents",
                    y=0.995,
                    fontsize=14,
                )
                single_fig.tight_layout()
                safe_benchmark = benchmark.replace("/", "_").replace(" ", "_")
                single_filename = f"mini_leaderboard_{safe_benchmark}.png"
                save_key_figure(single_fig, single_filename)
                plt.close(single_fig)
                figure_paths.append(single_filename)
            for ax in axes_flat[len(page_benchmarks) :]:
                ax.axis("off")
            fig.suptitle(
                f"Benchmark Score Mini-Leaderboards for Similarity Cluster {cluster_id}, Page {page_idx}\n"
                "Rows are models; colored bars compare available agents for each model",
                y=0.995,
            )
            fig.tight_layout(rect=(0, 0, 1, 0.96))
            filename = f"mini_leaderboards_cluster_{cluster_id}_page_{page_idx}.png"
            save_key_figure(fig, filename)
            plt.close(fig)
            figure_paths.append(filename)
    return pd.DataFrame(rows), figure_paths
