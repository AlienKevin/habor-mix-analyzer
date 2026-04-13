from __future__ import annotations

import textwrap
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt

from .config import KEY_FIGURE_DIR


def wrap_text(value: object, width: int = 24) -> str:
    text = str(value)
    return "\n".join(textwrap.wrap(text, width=width, break_long_words=False)) or text


def save_key_figure(fig: plt.Figure, filename: str | Path) -> None:
    path = KEY_FIGURE_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=200, bbox_inches="tight", pad_inches=0.08)


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
            "axes.axisbelow": True,
            "grid.linestyle": ":",
            "grid.alpha": 0.35,
            "axes.facecolor": "#fbfbfb",
            "figure.facecolor": "white",
            "savefig.facecolor": "white",
        }
    )
