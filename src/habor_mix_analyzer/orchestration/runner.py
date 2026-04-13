from __future__ import annotations

import argparse
import json

import pandas as pd

from ..core import (
    BENCHMARK_INTERMEDIATE_STUDY_DIR,
    KEY_COLUMNS,
    KEY_FIGURE_DIR,
    KEY_REPORT_DIR,
    KEY_TABLE_DIR,
    OUTPUT_DIR,
    PROCESSED_DIR,
    RANDOM_SEED,
    RAW_DIR,
    TASK_INTERMEDIATE_STUDY_DIR,
    clean_dir,
    read_matrix,
    set_plot_style,
    write_csv,
)
from ..preprocessing.svd_imputation import (
    aggregate_task_result_to_benchmarks,
    svd_impute_dataframe,
    write_benchmark_aggregate_outputs,
    write_matrix_outputs,
)
from ..reporting.key_analysis_report import write_key_analysis_reports
from ..studies.benchmark_predictability import (
    pca_for_cols,
    predictability_for_cols,
)
from ..studies.benchmark_similarity import (
    benchmark_similarity_clusters,
    pairwise_correlations,
)
from ..studies.coverage_filtering import benchmark_filter_table
from ..studies.intermediate_tables import write_tables
from ..studies.leaderboards import (
    agent_model_scores_for_cols,
    benchmark_scores_long,
)
from ..studies.model_agent_roles import (
    adjusted_group_effects,
    benchmark_model_agent_role_by_benchmark,
    filtered_variance_decomposition,
)
from ..studies.provenance import analysis_data_provenance, imputation_diagnostics_summary
from ..studies.task_alignment import task_aggregate_alignment
from ..studies.task_selection import select_harbormix_tasks, task_reliability_tables
from ..studies.task_similarity import task_similarity_and_representatives
from ..studies.terminus_comparison import summarize_agent_lift, terminus_delta_by_model
from ..visualization.benchmark_plots import (
    save_agent_lift_heatmap,
    save_benchmark_cluster_heatmap,
    save_benchmark_role_plot,
    save_benchmark_uniqueness_plot,
    save_key_effect_plot,
    save_terminus_delta_by_model_plot,
    save_key_variance_plot,
)
from ..visualization.leaderboard_plots import (
    benchmark_mini_leaderboard_tables_and_figures,
    save_key_agent_model_score_plot,
)
from ..visualization.task_plots import (
    save_harbormix_selection_plot,
    save_representative_task_plot,
    save_task_alignment_plot,
    save_task_composition_plot,
    save_task_composition_percent_plot,
    save_task_predictability_plot,
    save_task_similarity_heatmap,
)

INTERMEDIATE_TABLES = [
    "benchmark_observed_imputed_long",
    "task_item_stats",
    "task_benchmark_summary",
    "task_benchmark_matrix_from_tasks",
    "agent_model_strength_scores",
    "agent_differential_by_benchmark",
    "variance_decomposition",
    "benchmark_correlations",
    "benchmark_redundancy_pairs",
    "benchmark_predictability",
    "benchmark_latent_loadings",
    "benchmark_latent_agent_model_scores",
    "benchmark_latent_explained_variance",
    "svd_scree",
]

KEY_ANALYSIS_TABLES = [
    "benchmark_filtering",
    "analysis_data_provenance",
    "imputation_diagnostics_summary",
    "benchmark_agent_model_scores",
    "benchmark_scores_long",
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


def log(message: str) -> None:
    print(f"[habor-analyze] {message}", flush=True)


def clean_legacy_output_dirs() -> None:
    for path in [
        PROCESSED_DIR.parent / "generated",
        OUTPUT_DIR / "figures",
        OUTPUT_DIR / "tables",
        OUTPUT_DIR / "reports",
        OUTPUT_DIR / "intermediate",
        OUTPUT_DIR / "paper",
        OUTPUT_DIR / "studies",
    ]:
        if path.exists():
            import shutil

            shutil.rmtree(path)


def ensure_output_dirs() -> None:
    for path in [PROCESSED_DIR, BENCHMARK_INTERMEDIATE_STUDY_DIR, TASK_INTERMEDIATE_STUDY_DIR, KEY_TABLE_DIR, KEY_FIGURE_DIR, KEY_REPORT_DIR]:
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
        for path in [BENCHMARK_INTERMEDIATE_STUDY_DIR, TASK_INTERMEDIATE_STUDY_DIR, KEY_TABLE_DIR, KEY_FIGURE_DIR, KEY_REPORT_DIR]:
            clean_dir(path)
    ensure_output_dirs()


def read_raw_matrices() -> tuple[pd.DataFrame, pd.DataFrame]:
    raw_benchmark = read_matrix(RAW_DIR / "benchmark_level_matrix.csv")
    raw_task = read_matrix(RAW_DIR / "task_level_matrix.csv")
    if not raw_benchmark[KEY_COLUMNS].equals(raw_task[KEY_COLUMNS]):
        raise ValueError("Benchmark and task matrices do not have identical agent/model rows.")
    return raw_benchmark, raw_task


def load_imputation_result(prefix: str):
    from ..core import ImputationResult

    if prefix == "benchmark":
        diagnostics_path = PROCESSED_DIR / "benchmark_from_task_aggregate_diagnostics.json"
        if not diagnostics_path.exists():
            raise FileNotFoundError(f"Missing {diagnostics_path}; run `habor-analyze impute` first.")
        diagnostics = json.loads(diagnostics_path.read_text())
        return ImputationResult(
            normalized=pd.read_csv(PROCESSED_DIR / "benchmark_from_task_aggregate_normalized_matrix.csv"),
            raw=pd.read_csv(PROCESSED_DIR / "benchmark_from_task_aggregate_matrix.csv"),
            stats=pd.read_csv(PROCESSED_DIR / "benchmark_from_task_aggregate_column_quality.csv"),
            cv=pd.read_csv(PROCESSED_DIR / "benchmark_from_task_aggregate_diagnostics_cv.csv"),
            best_rank=0,
            missing_fraction=float(diagnostics["missing_fraction_before_task_aggregation"]),
        )

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
    log("impute: reading raw benchmark and task matrices")
    ensure_output_dirs()
    raw_benchmark, raw_task = read_raw_matrices()
    log("impute: fitting task-level SVD imputer")
    task_result = svd_impute_dataframe(
        raw_task,
        ranks=[2, 4, 6, 8, 10, 12, 16, 20],
        holdout_fraction=0.05,
        seed=RANDOM_SEED,
    )
    log("impute: aggregating SVD-filled task matrix into benchmark scores")
    benchmark_result = aggregate_task_result_to_benchmarks(raw_benchmark, raw_task, task_result)
    write_benchmark_aggregate_outputs(benchmark_result, task_result)
    write_matrix_outputs("task", task_result)
    log("impute: wrote processed task SVD and benchmark-from-task-aggregate matrices")


def run_intermediate_step() -> dict[str, pd.DataFrame]:
    log("intermediate: loading processed matrices")
    ensure_output_dirs()
    raw_benchmark, raw_task = read_raw_matrices()
    benchmark_result, task_result = load_imputation_results()
    log("intermediate: building shared benchmark/task tables")
    return write_tables(raw_benchmark, raw_task, benchmark_result, task_result)


def build_study_tables(
    raw_benchmark: pd.DataFrame,
    benchmark_result,
    task_result,
    tables: dict[str, pd.DataFrame],
) -> tuple[dict[str, pd.DataFrame], list[str], list[str]]:
    filter_table = benchmark_filter_table(benchmark_result.stats)
    included_benchmarks = filter_table[filter_table["include_in_key_analysis"]]["benchmark"].tolist()
    long_df = tables["benchmark_observed_imputed_long"]

    log("studies: building benchmark leaderboards and provenance")
    agent_model_scores = agent_model_scores_for_cols(raw_benchmark, benchmark_result, included_benchmarks)
    score_long = benchmark_scores_long(raw_benchmark, benchmark_result, included_benchmarks)
    provenance = analysis_data_provenance()
    imputation_diagnostics = imputation_diagnostics_summary(benchmark_result, task_result)
    log("studies: estimating model vs agent roles")
    model_effects = adjusted_group_effects(
        long_df[long_df["benchmark"].isin(included_benchmarks)].copy(), "model", ["agent", "benchmark"]
    )
    agent_effects = adjusted_group_effects(
        long_df[long_df["benchmark"].isin(included_benchmarks)].copy(), "agent", ["model", "benchmark"]
    )
    variance_filtered = filtered_variance_decomposition(long_df, included_benchmarks)
    log("studies: estimating benchmark predictability and similarity")
    corr_filtered, corr_pairs_filtered = pairwise_correlations(benchmark_result.normalized, included_benchmarks)
    uniqueness = predictability_for_cols(benchmark_result.normalized, included_benchmarks)
    benchmark_role = benchmark_model_agent_role_by_benchmark(long_df, included_benchmarks)
    benchmark_clusters, benchmark_corr_ordered, _benchmark_cluster_order = benchmark_similarity_clusters(corr_filtered)
    pca_loadings, pca_agent_model_scores, pca_explained = pca_for_cols(benchmark_result.normalized, included_benchmarks)
    log("studies: estimating Terminus harness deltas")
    agent_lift_summary, agent_lift_by_benchmark = summarize_agent_lift(
        tables["agent_differential_by_benchmark"], included_benchmarks
    )
    terminus_by_model = terminus_delta_by_model(tables["agent_differential_by_benchmark"], included_benchmarks)

    log("studies: building task reliability tables")
    tasks_enriched, task_summary, frontier_tasks = task_reliability_tables(tables["task_item_stats"])
    alignment = task_aggregate_alignment(benchmark_result, task_result, tasks_enriched, included_benchmarks)
    log("studies: estimating task similarity, predictability, and representatives")
    task_within_similarity, representative_tasks, task_predictability, task_cross_similarity = task_similarity_and_representatives(
        task_result, tasks_enriched, benchmark_clusters
    )
    log("studies: selecting HaborMix candidate tasks")
    selected_tasks = select_harbormix_tasks(tasks_enriched, representative_tasks, task_predictability)
    selected_task_summary = (
        selected_tasks.groupby(["benchmark", "difficulty_tier"])
        .agg(
            selected_tasks=("task_column", "size"),
            mean_selection_score=("mix_selection_score", "mean"),
            mean_task_score=("imputed_mean", "mean"),
            mean_representative_signal=("representative_signal", "mean"),
            mean_unique_unpredictable_signal=("unique_unpredictable_signal", "mean"),
            mean_difficulty_signal=("difficulty_signal", "mean"),
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
        "imputation_diagnostics_summary": imputation_diagnostics,
        "benchmark_agent_model_scores": agent_model_scores,
        "benchmark_scores_long": score_long,
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
        directory = BENCHMARK_INTERMEDIATE_STUDY_DIR if name.startswith("benchmark") or name.startswith("analysis") else TASK_INTERMEDIATE_STUDY_DIR
        write_csv(table, directory / f"{name}.csv")
    for name in KEY_ANALYSIS_TABLES:
        write_csv(study_tables[name], KEY_TABLE_DIR / f"{name}.csv")


def write_study_figures(study_tables: dict[str, pd.DataFrame]) -> None:
    log("figures: writing key analysis visualizations")
    set_plot_style()
    save_key_agent_model_score_plot(study_tables["benchmark_agent_model_scores"])
    save_key_effect_plot(
        study_tables["benchmark_model_adjusted_effects"],
        "model",
        "benchmark_model_adjusted_effects.png",
        "Model Effects Adjusted for Agent and Benchmark",
    )
    save_key_effect_plot(
        study_tables["benchmark_agent_adjusted_effects"],
        "agent",
        "benchmark_agent_adjusted_effects.png",
        "Agent Effects Adjusted for Model and Benchmark",
    )
    save_key_variance_plot(study_tables["benchmark_variance_decomposition_filtered"])
    save_benchmark_role_plot(study_tables["benchmark_model_agent_role_by_benchmark"])
    save_benchmark_cluster_heatmap(study_tables["benchmark_correlation_clustered"])
    save_agent_lift_heatmap(study_tables["benchmark_agent_lift_by_benchmark"])
    save_terminus_delta_by_model_plot(study_tables["terminus_delta_by_model"])
    save_benchmark_uniqueness_plot(study_tables["benchmark_uniqueness_filtered"], study_tables["benchmark_filtering"])
    save_task_composition_plot(study_tables["task_benchmark_reliable_summary"])
    save_task_composition_percent_plot(study_tables["task_benchmark_reliable_summary"])
    save_task_alignment_plot(study_tables["task_to_benchmark_alignment"])
    save_task_similarity_heatmap(
        study_tables["task_cross_benchmark_similarity"], study_tables["benchmark_similarity_clusters"]
    )
    save_task_predictability_plot(study_tables["task_predictability_ranked"])
    save_representative_task_plot(study_tables["task_representative_tasks"])
    save_harbormix_selection_plot(study_tables["harbormix_candidate_tasks"])


def run_studies_step() -> None:
    log("studies: loading processed and intermediate tables")
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
    write_key_analysis_reports(study_tables, benchmark_result, task_result, included_benchmarks, mini_leaderboard_figures)
    log("studies: wrote key analysis tables, figures, and reports")


def expand_steps(steps: list[str]) -> list[str]:
    if not steps or "all" in steps:
        return ["impute", "intermediate", "studies"]
    order = ["impute", "intermediate", "studies"]
    selected = set(steps)
    return [step for step in order if step in selected]


def run_pipeline(steps: list[str] | None = None, clean: bool = False) -> None:
    ordered_steps = expand_steps(steps or ["all"])
    log(f"run: steps={ordered_steps}, clean={clean}")
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
