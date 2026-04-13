from __future__ import annotations

import shutil
from pathlib import Path

import pandas as pd

from .config import KEY_COLUMNS, ROOT


def clean_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


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
