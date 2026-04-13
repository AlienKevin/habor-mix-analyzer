from __future__ import annotations

from ..core import *


def save_key_effect_plot(effects: pd.DataFrame, group_col: str, filename: str, title: str) -> None:
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
    save_key_figure(fig, f"benchmark_level/{filename}")
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
    save_key_figure(fig, "benchmark_level/benchmark_agent_lift_heatmap.png")
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
    save_key_figure(fig, "benchmark_level/benchmark_uniqueness_vs_coverage.png")
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
    save_key_figure(fig, "benchmark_level/benchmark_model_vs_agent_role.png")
    plt.close(fig)


def save_key_variance_plot(variance_df: pd.DataFrame) -> None:
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
    save_key_figure(fig, "benchmark_level/benchmark_variance_attribution.png")
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
    save_key_figure(fig, "benchmark_level/benchmark_similarity_clustered_heatmap.png")
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
    save_key_figure(fig, "benchmark_level/terminus_delta_by_model_heatmap.png")
    plt.close(fig)
