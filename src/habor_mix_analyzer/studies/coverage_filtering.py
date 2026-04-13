from __future__ import annotations

from ..core import *


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
