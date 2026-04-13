from __future__ import annotations

import argparse
import json
import math
import shutil
import textwrap
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.linear_model import LinearRegression, RidgeCV
from sklearn.metrics import r2_score
from sklearn.model_selection import KFold
from scipy.cluster.hierarchy import fcluster, leaves_list, linkage
from scipy.spatial.distance import squareform


ROOT = Path(__file__).resolve().parents[2]
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
RAW_SCORE_LABEL = "Raw benchmark score on the benchmark's original metric scale"


@dataclass(frozen=True)
class ImputationResult:
    normalized: pd.DataFrame
    raw: pd.DataFrame
    stats: pd.DataFrame
    cv: pd.DataFrame
    best_rank: int
    missing_fraction: float


def clean_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

def prepare_output_dirs() -> None:
    legacy_dirs = [
        ROOT / "data" / "processed" / "generated",
        OUTPUT_DIR / "figures",
        OUTPUT_DIR / "tables",
        OUTPUT_DIR / "reports",
        OUTPUT_DIR / "intermediate",
    ]
    for path in legacy_dirs:
        if path.exists():
            shutil.rmtree(path)

    for path in [
        PROCESSED_DIR,
        BENCHMARK_STUDY_DIR,
        TASK_STUDY_DIR,
        PAPER_TABLE_DIR,
        PAPER_FIGURE_DIR,
        PAPER_REPORT_DIR,
    ]:
        clean_dir(path)

def read_matrix(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = [col for col in KEY_COLUMNS if col not in df.columns]
    if missing:
        raise ValueError(f"{path} is missing key columns: {missing}")
    return df

def score_columns(df: pd.DataFrame) -> list[str]:
    return [col for col in df.columns if col not in KEY_COLUMNS]

def write_csv(table: pd.DataFrame, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(path, index=False)
    return path

def wrap_text(value: object, width: int = 24) -> str:
    text = str(value)
    return "\n".join(textwrap.wrap(text, width=width, break_long_words=False)) or text

def save_paper_figure(fig: plt.Figure, filename: str) -> None:
    fig.savefig(PAPER_FIGURE_DIR / filename, dpi=200, bbox_inches="tight", pad_inches=0.08)

def md_path(path: Path) -> str:
    return str(path.relative_to(ROOT))

def report_image(filename: str, alt: str) -> str:
    return f"![{alt}](../figures/{filename})"

def markdown_table(df: pd.DataFrame, columns: list[str], n: int = 8) -> list[str]:
    if df.empty:
        return ["No rows."]
    subset = df.head(n)[columns].copy()
    for col in subset.columns:
        subset[col] = subset[col].map(lambda value: f"{value:.3f}" if isinstance(value, float) else str(value))
    header = "| " + " | ".join(subset.columns) + " |"
    separator = "| " + " | ".join(["---"] * len(subset.columns)) + " |"
    rows = ["| " + " | ".join(row) + " |" for row in subset.astype(str).to_numpy()]
    return [header, separator, *rows]

def set_plot_style() -> None:
    plt.rcParams.update(
        {
            "font.size": 14,
            "axes.titlesize": 18,
            "axes.labelsize": 15,
            "xtick.labelsize": 11,
            "ytick.labelsize": 11,
            "legend.fontsize": 12,
            "figure.titlesize": 20,
            "axes.facecolor": "#fbfbfb",
            "figure.facecolor": "white",
            "savefig.facecolor": "white",
        }
    )
