"""Baseline fighter style map: features -> scaled -> PCA 2D + k-means + nearest neighbours."""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

RATE_FEATURES = [
    "significant_strikes_landed_per_minute",
    "significant_strikes_absorbed_per_minute",
    "average_takedowns_landed_per_15_minutes",
    "average_submissions_attempted_per_15_minutes",
]
PCT_FEATURES = [
    "significant_striking_accuracy",
    "significant_strike_defence",
    "takedown_accuracy",
    "takedown_defense",
]
STYLE_FEATURES = RATE_FEATURES + PCT_FEATURES


def build_feature_table(
    stats: pd.DataFrame, active: pd.DataFrame, min_fights: int = 3
) -> pd.DataFrame:
    """Join career stats onto active fighters and drop rows we can't trust.

    Drops: names that appear more than once in ``stats`` (different people, can't
    disambiguate), all-zero stat rows (UFCStats writes 0 for "no data"), and
    fighters with fewer than ``min_fights`` UFC fights when the stats were taken.
    """
    unique_stats = stats[~stats["name"].duplicated(keep=False)].set_index("name")
    table = active.join(unique_stats[STYLE_FEATURES], how="inner")
    table = table[~(table[STYLE_FEATURES] == 0).all(axis=1)]
    return table[table["n_fights_as_of"] >= min_fights]


def scale_features(table: pd.DataFrame) -> np.ndarray:
    """log1p the skewed per-minute rates, then standardise every feature."""
    x = table[STYLE_FEATURES].to_numpy(dtype=float).copy()
    x[:, : len(RATE_FEATURES)] = np.log1p(x[:, : len(RATE_FEATURES)])
    scaled: np.ndarray = StandardScaler().fit_transform(x)
    return scaled


@dataclass
class StyleMap:
    names: pd.Index
    xs: np.ndarray  # scaled features, shape (n, d)
    coords: np.ndarray  # PCA embedding, shape (n, n_components)
    labels: np.ndarray  # k-means cluster per fighter
    pca: PCA

    def neighbours(self, name: str, k: int = 5) -> pd.Series:
        """The ``k`` most similar fighters to ``name`` and their distances."""
        return self.all_neighbours(k)[name]

    def all_neighbours(self, k: int = 5) -> dict[str, pd.Series]:
        """Nearest neighbours (in scaled feature space) for every fighter."""
        dist, idx = NearestNeighbors(n_neighbors=k + 1).fit(self.xs).kneighbors(self.xs)
        return {
            name: pd.Series(dist[i, 1:], index=self.names[idx[i, 1:]], name="distance")
            for i, name in enumerate(self.names)
        }


# PCA axis signs are arbitrary; flip each axis so this feature loads positively,
# which keeps "right / up / forward" meaning the same thing between runs.
AXIS_ANCHORS = [
    "average_takedowns_landed_per_15_minutes",  # PC1: grappling
    "takedown_defense",  # PC2: defence
    "significant_strikes_landed_per_minute",  # PC3: pace
]


def fit_style_map(
    table: pd.DataFrame, n_clusters: int = 5, n_components: int = 3, seed: int = 0
) -> StyleMap:
    xs = scale_features(table)
    pca = PCA(n_components=n_components, random_state=seed)
    coords = pca.fit_transform(xs)
    for i, anchor in enumerate(AXIS_ANCHORS[:n_components]):
        if pca.components_[i, STYLE_FEATURES.index(anchor)] < 0:
            pca.components_[i] *= -1
            coords[:, i] *= -1
    labels = KMeans(n_clusters=n_clusters, n_init=10, random_state=seed).fit_predict(xs)
    return StyleMap(names=table.index, xs=xs, coords=coords, labels=labels, pca=pca)
