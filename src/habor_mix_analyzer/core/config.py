from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed" / "intermediate"

OUTPUT_DIR = ROOT / "output"
STUDY_DIR = OUTPUT_DIR / "studies"
BENCHMARK_STUDY_DIR = STUDY_DIR / "benchmark_level"
TASK_STUDY_DIR = STUDY_DIR / "task_level"

PAPER_DIR = OUTPUT_DIR / "paper"
PAPER_TABLE_DIR = PAPER_DIR / "tables"
PAPER_FIGURE_DIR = PAPER_DIR / "figures"
PAPER_REPORT_DIR = PAPER_DIR / "reports"

KEY_COLUMNS = ["model", "agent"]
RANDOM_SEED = 42

RELATIVE_SCORE_LABEL = "Benchmark-relative score (0 = benchmark median; +1 = one robust scale above median)"
DELTA_SCORE_LABEL = "Benchmark-relative score change\nvs terminus-2"


@dataclass(frozen=True)
class ImputationResult:
    normalized: pd.DataFrame
    raw: pd.DataFrame
    stats: pd.DataFrame
    cv: pd.DataFrame
    best_rank: int
    missing_fraction: float
