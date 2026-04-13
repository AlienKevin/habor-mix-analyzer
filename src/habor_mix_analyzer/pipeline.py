from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from .analysis import (
    adjusted_group_effects,
    agent_model_scores_for_cols,
    analysis_data_provenance,
    benchmark_filter_table,
    benchmark_model_agent_role_by_benchmark,
    benchmark_raw_scores_long,
    benchmark_similarity_clusters,
    filtered_variance_decomposition,
    pairwise_correlations,
    pca_for_cols,
    predictability_for_cols,
    summarize_agent_lift,
    task_aggregate_alignment,
    task_reliability_tables,
    task_similarity_and_representatives,
    terminus_delta_by_model,
    write_tables,
)
from .common import (
    BENCHMARK_STUDY_DIR,
    KEY_COLUMNS,
    PAPER_FIGURE_DIR,
    PAPER_REPORT_DIR,
    PAPER_TABLE_DIR,
    PROCESSED_DIR,
    RANDOM_SEED,
    RAW_DIR,
    TASK_STUDY_DIR,
    clean_dir,
    read_matrix,
    set_plot_style,
    write_csv,
)
from .figures import (
    benchmark_mini_leaderboard_tables_and_figures,
    save_agent_lift_heatmap,
    save_benchmark_cluster_heatmap,
    save_benchmark_role_plot,
    save_benchmark_uniqueness_plot,
    save_harbormix_selection_plot,
    save_paper_agent_model_score_plot,
    save_paper_effect_plot,
    save_representative_task_plot,
    save_task_alignment_plot,
    save_task_composition_plot,
    save_task_predictability_plot,
    save_task_similarity_heatmap,
    save_terminus_delta_by_model_plot,
    save_variance_paper_plot,
)
from .imputation import svd_impute_dataframe, write_matrix_outputs
from .reports import write_paper_reports

INTERMEDIATE_TABLES = [
    "benchmark_observed_imputed_long",
    "task_item_stats",
    "task_benchmark_summary",
    "task_benchmark_matrix_from_tasks",
    "system_scores",
    "agent_differential_by_benchmark",
    "variance_decomposition",
    "benchmark_correlations",
    "benchmark_redundancy_pairs",
    "benchmark_predictability",
    "benchmark_latent_loadings",
    "benchmark_latent_systems",
    "benchmark_latent_explained_variance",
    "svd_scree",
]

PAPER_TABLES = [
    "benchmark_filtering",
    "analysis_data_provenance",
    "benchmark_agent_model_scores",
    "benchmark_raw_scores_long",
    "benchmark_model_adjusted_effects",
    "benchmark_agent_adjusted_effects",
    "benchmark_variance_decomposition_filtered",
    "benchmark_model_agent_role_by_benchmark",
    "benchmark_similarity_clusters",
    "benchmark_correlation_clustered",
    "benchmark_redundancy_pairs_filtered",
    "benchmark_uniqueness_filtered",
    "benchmark_agent_lift_vs_terminus",
    "terminus_delta_by_model",
    "benchmark_mini_leaderboards",
    "task_benchmark_reliable_summary",
    "task_to_benchmark_alignment",
    "task_within_benchmark_similarity",
    "task_cross_benchmark_similarity",
    "task_representative_tasks",
    "task_predictability_ranked",
    "harbormix_candidate_tasks",
    "harbormix_selection_by_benchmark",
]


def clean_legacy_output_dirs() -> None:
    for path in [
        PROCESSED_DIR.parent / "generated",
        PAPER_TABLE_DIR.parents[1] / "figures",
        PAPER_TABLE_DIR.parents[1] / "tables",
        PAPER_TABLE_DIR.parents[1] / "reports",
        PAPER_TABLE_DIR.parents[1] / "intermediate",
    ]:
        if path.exists():
            import shutil

            shutil.rmtree(path)


def ensure_output_dirs() -> None:
    for path in [PROCESSED_DIR, BENCHMARK_STUDY_DIR, TASK_STUDY_DIR, PAPER_TABLE_DIR, PAPER_FIGURE_DIR, PAPER_REPORT_DIR]:
        path.mkdir(parents=True, exist_ok=True)


def clean_step_outputs(steps: set[str]) -> None:
    clean_legacy_output_dirs()
    if "impute" in steps:
        clean_dir(PROCESSED_DIR)
    elif "intermediate" in steps:
        PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
        for name in INTERMEDIATE_TABLES:
            path = PROCESSED_DIR / f"{name}.csv"
            if path.exists():
                path.unlink()
    if "studies" in steps:
        for path in [BENCHMARK_STUDY_DIR, TASK_STUDY_DIR, PAPER_TABLE_DIR, PAPER_FIGURE_DIR, PAPER_REPORT_DIR]:
            clean_dir(path)
    ensure_output_dirs()


def read_raw_matrices() -> tuple[pd.DataFrame, pd.DataFrame]:
    raw_benchmark = read_matrix(RAW_DIR / "benchmark_level_matrix.csv")
    raw_task = read_matrix(RAW_DIR / "task_level_matrix.csv")
    if not raw_benchmark[KEY_COLUMNS].equals(raw_task[KEY_COLUMNS]):
        raise ValueError("Benchmark and task matrices do not have identical agent/model rows.")
    return raw_benchmark, raw_task


def load_imputation_result(prefix: str):
    from .common import ImputationResult

    diagnostics_path = PROCESSED_DIR / f"{prefix}_imputation_diagnostics.json"
    if not diagnostics_path.exists():
        raise FileNotFoundError(f"Missing {diagnostics_path}; run `habor-analyze impute` first.")
    diagnostics = json.loads(diagnostics_path.read_text())
    return ImputationResult(
        normalized=pd.read_csv(PROCESSED_DIR / f"{prefix}_svd_imputed_normalized_matrix.csv"),
        raw=pd.read_csv(PROCESSED_DIR / f"{prefix}_svd_imputed_matrix.csv"),
        stats=pd.read_csv(PROCESSED_DIR / f"{prefix}_column_quality.csv"),
        cv=pd.read_csv(PROCESSED_DIR / f"{prefix}_svd_rank_cv.csv"),
        best_rank=int(diagnostics["best_rank"]),
        missing_fraction=float(diagnostics["missing_fraction"]),
    )


def load_imputation_results():
    return load_imputation_result("benchmark"), load_imputation_result("task")


def load_intermediate_tables() -> dict[str, pd.DataFrame]:
    tables = {}
    for name in INTERMEDIATE_TABLES:
        path = PROCESSED_DIR / f"{name}.csv"
        if not path.exists():
            raise FileNotFoundError(f"Missing {path}; run `habor-analyze intermediate` first.")
        tables[name] = pd.read_csv(path)
    return tables


def run_imputation_step() -> None:
    ensure_output_dirs()
    raw_benchmark, raw_task = read_raw_matrices()
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


def run_intermediate_step() -> dict[str, pd.DataFrame]:
    ensure_output_dirs()
    raw_benchmark, raw_task = read_raw_matrices()
    benchmark_result, task_result = load_imputation_results()
    return write_tables(raw_benchmark, raw_task, benchmark_result, task_result)


def build_study_tables(
    raw_benchmark: pd.DataFrame,
    benchmark_result,
    task_result,
    tables: dict[str, pd.DataFrame],
) -> tuple[dict[str, pd.DataFrame], list[str], list[str]]:
    filter_table = benchmark_filter_table(benchmark_result.stats)
    included_benchmarks = filter_table[filter_table["include_in_paper_analysis"]]["benchmark"].tolist()
    long_df = tables["benchmark_observed_imputed_long"]

    agent_model_scores = agent_model_scores_for_cols(raw_benchmark, benchmark_result, included_benchmarks)
    raw_score_long = benchmark_raw_scores_long(raw_benchmark, benchmark_result, included_benchmarks)
    provenance = analysis_data_provenance()
    model_effects = adjusted_group_effects(
        long_df[long_df["benchmark"].isin(included_benchmarks)].copy(), "model", ["agent", "benchmark"]
    )
    agent_effects = adjusted_group_effects(
        long_df[long_df["benchmark"].isin(included_benchmarks)].copy(), "agent", ["model", "benchmark"]
    )
    variance_filtered = filtered_variance_decomposition(long_df, included_benchmarks)
    corr_filtered, corr_pairs_filtered = pairwise_correlations(benchmark_result.normalized, included_benchmarks)
    uniqueness = predictability_for_cols(benchmark_result.normalized, included_benchmarks)
    benchmark_role = benchmark_model_agent_role_by_benchmark(long_df, included_benchmarks)
    benchmark_clusters, benchmark_corr_ordered, _benchmark_cluster_order = benchmark_similarity_clusters(corr_filtered)
    pca_loadings, pca_agent_model_scores, pca_explained = pca_for_cols(benchmark_result.normalized, included_benchmarks)
    agent_lift_summary, agent_lift_by_benchmark = summarize_agent_lift(
        tables["agent_differential_by_benchmark"], included_benchmarks
    )
    terminus_by_model = terminus_delta_by_model(tables["agent_differential_by_benchmark"], included_benchmarks)

    tasks_enriched, task_summary, selected_tasks, frontier_tasks = task_reliability_tables(tables["task_item_stats"])
    alignment = task_aggregate_alignment(benchmark_result, task_result, tasks_enriched, included_benchmarks)
    task_within_similarity, representative_tasks, task_predictability, task_cross_similarity = task_similarity_and_representatives(
        task_result, tasks_enriched, benchmark_clusters
    )
    selected_task_summary = (
        selected_tasks.groupby(["benchmark", "difficulty_tier"])
        .agg(
            selected_tasks=("task_column", "size"),
            mean_selection_score=("mix_selection_score", "mean"),
            mean_observed_score=("observed_mean", "mean"),
            mean_strength_correlation=("strength_correlation", "mean"),
        )
        .reset_index()
        .sort_values(["selected_tasks", "mean_selection_score"], ascending=False)
    )
    mini_leaderboards, mini_leaderboard_figures = benchmark_mini_leaderboard_tables_and_figures(
        benchmark_result, benchmark_clusters, included_benchmarks
    )

    study_tables = {
        "benchmark_filtering": filter_table,
        "analysis_data_provenance": provenance,
        "benchmark_agent_model_scores": agent_model_scores,
        "benchmark_raw_scores_long": raw_score_long,
        "benchmark_model_adjusted_effects": model_effects,
        "benchmark_agent_adjusted_effects": agent_effects,
        "benchmark_variance_decomposition_filtered": variance_filtered,
        "benchmark_correlation_filtered": corr_filtered,
        "benchmark_correlation_clustered": benchmark_corr_ordered,
        "benchmark_similarity_clusters": benchmark_clusters,
        "benchmark_redundancy_pairs_filtered": corr_pairs_filtered,
        "benchmark_uniqueness_filtered": uniqueness,
        "benchmark_model_agent_role_by_benchmark": benchmark_role,
        "benchmark_latent_loadings_filtered": pca_loadings,
        "benchmark_latent_agent_model_scores_filtered": pca_agent_model_scores,
        "benchmark_latent_explained_variance_filtered": pca_explained,
        "benchmark_agent_lift_vs_terminus": agent_lift_summary,
        "benchmark_agent_lift_by_benchmark": agent_lift_by_benchmark,
        "terminus_delta_by_model": terminus_by_model,
        "benchmark_mini_leaderboards": mini_leaderboards,
        "task_enriched_item_stats": tasks_enriched,
        "task_benchmark_reliable_summary": task_summary,
        "task_to_benchmark_alignment": alignment,
        "task_within_benchmark_similarity": task_within_similarity,
        "task_cross_benchmark_similarity": task_cross_similarity,
        "task_representative_tasks": representative_tasks,
        "task_predictability_ranked": task_predictability,
        "harbormix_candidate_tasks": selected_tasks,
        "harbormix_selection_by_benchmark": selected_task_summary,
        "task_frontier_or_saturated_watchlist": frontier_tasks,
    }
    return study_tables, included_benchmarks, mini_leaderboard_figures


def write_study_tables(study_tables: dict[str, pd.DataFrame]) -> None:
    for name, table in study_tables.items():
        directory = BENCHMARK_STUDY_DIR if name.startswith("benchmark") or name.startswith("analysis") else TASK_STUDY_DIR
        write_csv(table, directory / f"{name}.csv")
    for name in PAPER_TABLES:
        write_csv(study_tables[name], PAPER_TABLE_DIR / f"{name}.csv")


def write_study_figures(study_tables: dict[str, pd.DataFrame]) -> None:
    set_plot_style()
    save_paper_agent_model_score_plot(study_tables["benchmark_agent_model_scores"])
    save_paper_effect_plot(
        study_tables["benchmark_model_adjusted_effects"],
        "model",
        "benchmark_model_adjusted_effects.png",
        "Model Effects Adjusted for Agent and Benchmark",
    )
    save_paper_effect_plot(
        study_tables["benchmark_agent_adjusted_effects"],
        "agent",
        "benchmark_agent_adjusted_effects.png",
        "Agent Effects Adjusted for Model and Benchmark",
    )
    save_variance_paper_plot(study_tables["benchmark_variance_decomposition_filtered"])
    save_benchmark_role_plot(study_tables["benchmark_model_agent_role_by_benchmark"])
    save_benchmark_cluster_heatmap(study_tables["benchmark_correlation_clustered"])
    save_agent_lift_heatmap(study_tables["benchmark_agent_lift_by_benchmark"])
    save_terminus_delta_by_model_plot(study_tables["terminus_delta_by_model"])
    save_benchmark_uniqueness_plot(study_tables["benchmark_uniqueness_filtered"], study_tables["benchmark_filtering"])
    save_task_composition_plot(study_tables["task_benchmark_reliable_summary"])
    save_task_alignment_plot(study_tables["task_to_benchmark_alignment"])
    save_task_similarity_heatmap(
        study_tables["task_cross_benchmark_similarity"], study_tables["benchmark_similarity_clusters"]
    )
    save_task_predictability_plot(study_tables["task_predictability_ranked"])
    save_representative_task_plot(study_tables["task_representative_tasks"])
    save_harbormix_selection_plot(study_tables["harbormix_candidate_tasks"])


def run_studies_step() -> None:
    ensure_output_dirs()
    raw_benchmark, _raw_task = read_raw_matrices()
    benchmark_result, task_result = load_imputation_results()
    tables = load_intermediate_tables()
    set_plot_style()
    study_tables, included_benchmarks, mini_leaderboard_figures = build_study_tables(
        raw_benchmark, benchmark_result, task_result, tables
    )
    write_study_tables(study_tables)
    write_study_figures(study_tables)
    write_paper_reports(study_tables, benchmark_result, task_result, included_benchmarks, mini_leaderboard_figures)


def expand_steps(steps: list[str]) -> list[str]:
    if not steps or "all" in steps:
        return ["impute", "intermediate", "studies"]
    order = ["impute", "intermediate", "studies"]
    selected = set(steps)
    return [step for step in order if step in selected]


def run_pipeline(steps: list[str] | None = None, clean: bool = False) -> None:
    ordered_steps = expand_steps(steps or ["all"])
    if clean:
        clean_step_outputs(set(ordered_steps))
    else:
        clean_legacy_output_dirs()
        ensure_output_dirs()
    for step in ordered_steps:
        if step == "impute":
            run_imputation_step()
        elif step == "intermediate":
            run_intermediate_step()
        elif step == "studies":
            run_studies_step()
        else:
            raise ValueError(f"Unknown pipeline step: {step}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the HaborMix analysis pipeline in reusable steps.")
    parser.add_argument(
        "steps",
        nargs="*",
        choices=["all", "impute", "intermediate", "studies"],
        help="Steps to run in dependency order. Default: all. Example: habor-analyze impute intermediate studies",
    )
    parser.add_argument("--clean", action="store_true", help="Clean generated outputs for the selected steps before running.")
    args = parser.parse_args()
    run_pipeline(args.steps or ["all"], clean=args.clean)


if __name__ == "__main__":
    main()
