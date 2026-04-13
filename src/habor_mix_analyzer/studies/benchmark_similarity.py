from __future__ import annotations

from ..core import *


def pairwise_correlations(matrix: pd.DataFrame, cols: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    corr = matrix[cols].corr(method="spearman")
    rows = []
    for i, left in enumerate(cols):
        for right in cols[i + 1 :]:
            rows.append({"left": left, "right": right, "spearman": float(corr.loc[left, right])})
    pairs = pd.DataFrame(rows)
    pairs["abs_spearman"] = pairs["spearman"].abs()
    return corr.reset_index(names="benchmark"), pairs.sort_values("abs_spearman", ascending=False)


def benchmark_similarity_clusters(corr: pd.DataFrame, n_clusters: int = 6) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    matrix = corr.set_index("benchmark")
    matrix = matrix.loc[matrix.columns, matrix.columns].fillna(0)
    distance_array = (1 - matrix.abs()).to_numpy(copy=True)
    np.fill_diagonal(distance_array, 0)
    condensed = squareform(distance_array, checks=False)
    z = linkage(condensed, method="average")
    order = matrix.index[leaves_list(z)].tolist()
    labels = fcluster(z, t=n_clusters, criterion="maxclust")
    clusters = pd.DataFrame({"benchmark": matrix.index, "similarity_cluster": labels})
    clusters = clusters.sort_values(["similarity_cluster", "benchmark"]).reset_index(drop=True)
    ordered_corr = matrix.loc[order, order].reset_index(names="benchmark")
    return clusters, ordered_corr, order
