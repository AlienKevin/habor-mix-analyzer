from __future__ import annotations

from ..core import *


def predictability_for_cols(normalized: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    matrix = normalized[cols].astype(float)
    rows = []
    n_splits = min(5, matrix.shape[0])
    cv = KFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)
    alphas = np.logspace(-3, 3, 13)
    for target in cols:
        predictors = [col for col in cols if col != target]
        if not predictors:
            continue
        x = matrix[predictors].to_numpy()
        y = matrix[target].to_numpy()
        predictions = np.full_like(y, np.nan, dtype=float)
        for train_idx, test_idx in cv.split(x):
            model = RidgeCV(alphas=alphas)
            model.fit(x[train_idx], y[train_idx])
            predictions[test_idx] = model.predict(x[test_idx])
        rows.append(
            {
                "benchmark": target,
                "cv_r2_from_other_included_benchmarks": float(r2_score(y, predictions)),
                "cv_rmse": float(np.sqrt(np.mean((y - predictions) ** 2))),
            }
        )
    return pd.DataFrame(rows).sort_values("cv_r2_from_other_included_benchmarks")


def pca_for_cols(normalized: pd.DataFrame, cols: list[str], n_components: int = 4) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    x = normalized[cols].astype(float).to_numpy()
    n_components = min(n_components, x.shape[0] - 1, x.shape[1])
    pca = PCA(n_components=n_components, random_state=RANDOM_SEED)
    scores = pca.fit_transform(x)
    loadings = pd.DataFrame(
        pca.components_.T,
        index=cols,
        columns=[f"PC{i + 1}" for i in range(n_components)],
    ).reset_index(names="benchmark")
    agent_model_scores = normalized[KEY_COLUMNS].copy()
    for i in range(n_components):
        agent_model_scores[f"PC{i + 1}"] = scores[:, i]
    explained = pd.DataFrame(
        {
            "component": [f"PC{i + 1}" for i in range(n_components)],
            "explained_variance_ratio": pca.explained_variance_ratio_,
        }
    )
    return loadings, agent_model_scores, explained
