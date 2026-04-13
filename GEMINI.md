# Harbor Mix Analyzer

## Project Overview
`habor-mix-analyzer` is a Python-based data analysis pipeline designed for processing and evaluating large-scale agent benchmark matrices. It is specifically built for the adapters / HarborMix study. The pipeline takes raw, potentially incomplete score matrices (models and agents vs. benchmarks/tasks) with mixed score scales, and performs rigorous statistical processing. Key steps include SVD-based imputation for missing data, robust centering and scaling, cross-validation for rank selection, and the generation of comprehensive analytical artifacts such as benchmark correlations, similarity clusters, task difficulty metrics, mini-leaderboards, and agent-differential tables.

### Main Technologies
- **Python (>=3.10):** The core programming language.
- **Dependency Management:** Uses `uv` (as indicated by `uv.lock` and CLI commands) and `pyproject.toml` (with `hatchling` as the build backend).
- **Key Libraries:** `pandas`, `numpy`, `scipy`, `scikit-learn` for data manipulation and statistical analysis, and `matplotlib` for visualization.

### Architecture
The project follows a structured data engineering and analysis pipeline pattern, separating raw data, intermediate processing, and final output generation.
- **`data/raw/`**: Contains the input matrices (`benchmark_level_matrix.csv`, `task_level_matrix.csv`).
- **`src/habor_mix_analyzer/`**: Contains the source code, divided into modular components:
  - `cli.py` / `pipeline.py`: Entry points.
  - `orchestration/`: Manages the execution flow of different pipeline steps.
  - `preprocessing/`: Handles data cleaning, scaling, and SVD imputation.
  - `studies/`: Contains specific analytical modules (e.g., benchmark similarity, task alignment, leaderboards).
  - `visualization/` & `reporting/`: Generates figures and markdown reports.
- **`data/processed/intermediate/`**: Stores intermediate computed tables.
- **`output/`**: The final destination for generated figures, tables, and reports, split into `paper/` (for publication-ready artifacts) and `studies/` (for expanded data).

## Building and Running

The project utilizes `uv` to manage the environment and execute the pipeline. The main executable script is exposed as `habor-analyze`.

**Run the Full Pipeline:**
```bash
uv run habor-analyze
```
This runs all stages in dependency order, reading from `data/raw/` and writing to `data/processed/` and `output/`.

**Run Specific Steps:**
The pipeline is modular, allowing you to run specific stages without recomputing everything:

1.  **Imputation (Raw data -> SVD-filled matrices):**
    ```bash
    uv run habor-analyze impute
    ```
2.  **Intermediate Processing (Processed matrices -> Intermediate tables):**
    ```bash
    uv run habor-analyze intermediate
    ```
3.  **Studies (Intermediate tables -> Final reports/figures):**
    ```bash
    uv run habor-analyze studies
    ```

**Clean Runs:**
To forcefully regenerate outputs and clean previous artifacts for a specific step, use the `--clean` flag:
```bash
uv run habor-analyze impute --clean
```

## Development Conventions

- **Modular Design:** The analysis is broken down into specific "studies" (e.g., `model_agent_roles.py`, `task_alignment.py`), promoting single-responsibility and easier maintenance.
- **Reproducibility:** The pipeline design (raw -> intermediate -> output) ensures that analyses can be reliably reproduced from the original data.
- **Deterministic vs. Clean Execution:** By default, running a step only rewrites deterministic files. The `--clean` flag is explicitly required to remove generated outputs before a run, providing a safer development workflow.
- **Scientific Python Stack:** The reliance on standard scientific libraries (`pandas`, `scikit-learn`, etc.) suggests adherence to standard Python data science paradigms (e.g., vectorized operations, statistical rigor).