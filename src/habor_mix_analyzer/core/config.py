from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed" / "intermediate"

OUTPUT_DIR = ROOT / "output"
INTERMEDIATE_STUDY_DIR = OUTPUT_DIR / "intermediate_studies"
BENCHMARK_INTERMEDIATE_STUDY_DIR = INTERMEDIATE_STUDY_DIR / "benchmark_level"
TASK_INTERMEDIATE_STUDY_DIR = INTERMEDIATE_STUDY_DIR / "task_level"

KEY_ANALYSIS_DIR = OUTPUT_DIR / "key_analyses"
KEY_TABLE_DIR = KEY_ANALYSIS_DIR / "tables"
KEY_FIGURE_DIR = KEY_ANALYSIS_DIR / "figures"
KEY_REPORT_DIR = KEY_ANALYSIS_DIR / "reports"

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
