"""Fighter style map: shrunk + scaled stats -> style axes and t-SNE layouts, k-means, neighbours."""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.manifold import TSNE, trustworthiness
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
    profiles: pd.DataFrame, active: pd.DataFrame, min_fights: int = 3
) -> pd.DataFrame:
    """Join career stats onto active fighters and drop rows we can't trust.

    Drops all-zero or missing stat rows (UFCStats writes 0 for "no data") and
    fighters with fewer than ``min_fights`` UFC fights.
    """
    table = active.join(profiles, how="inner").dropna(subset=STYLE_FEATURES)
    table = table[~(table[STYLE_FEATURES] == 0).all(axis=1)]
    return table[table["n_fights"] >= min_fights]


PRIOR_MINUTES = 30.0  # shrinkage strength for per-minute rates (about three fights)
PRIOR_ATTEMPTS = 10.0  # shrinkage strength for accuracy / defence percentages


def _pull(value: pd.Series, evidence: pd.Series, prior_weight: float) -> pd.Series:
    """Weighted average of each value and the population mean, by evidence vs prior weight."""
    return (value * evidence + value.mean() * prior_weight) / (evidence + prior_weight)


def shrink(table: pd.DataFrame) -> pd.DataFrame:
    """Pull noisy stats toward the population mean, harder for fighters with less evidence.

    Career rates from 2 fights or a 100% takedown accuracy from 1 attempt say little.
    Rates are weighted by UFC cage minutes; percentages by estimated attempts
    (landed / accuracy), approximate since the data has no raw counts.
    """
    s = table[STYLE_FEATURES].astype(float)
    minutes = table["minutes"].clip(lower=1)
    out = s.copy()
    for f in RATE_FEATURES:
        out[f] = _pull(s[f], minutes, PRIOR_MINUTES)

    def attempts(per_minute: pd.Series, success_pct: pd.Series) -> pd.Series:
        return per_minute * minutes / (success_pct / 100).clip(lower=0.05)

    strike_attempts = attempts(
        s["significant_strikes_landed_per_minute"], s["significant_striking_accuracy"]
    )
    td_attempts = attempts(
        s["average_takedowns_landed_per_15_minutes"] / 15, s["takedown_accuracy"]
    ).where(s["takedown_accuracy"] > 0, 0)  # 0% accuracy: attempts unknown, rely on the prior
    opp_strikes = attempts(
        s["significant_strikes_absorbed_per_minute"], 100 - s["significant_strike_defence"]
    )
    opp_tds = minutes * (td_attempts / minutes).mean()  # no per-fighter data: assume typical
    for f, n in [
        ("significant_striking_accuracy", strike_attempts),
        ("takedown_accuracy", td_attempts),
        ("significant_strike_defence", opp_strikes),
        ("takedown_defense", opp_tds),
    ]:
        out[f] = _pull(s[f], n, PRIOR_ATTEMPTS)
    return out


def scale_features(table: pd.DataFrame) -> np.ndarray:
    """Shrink noisy stats, log1p the skewed per-minute rates, then standardise every feature."""
    x = shrink(table).to_numpy(dtype=float)
    x[:, : len(RATE_FEATURES)] = np.log1p(x[:, : len(RATE_FEATURES)])
    scaled: np.ndarray = StandardScaler().fit_transform(x)
    return scaled


@dataclass
class Layout:
    """One way of placing fighters in 3D and 2D, plus how faithful it is."""

    coords3: np.ndarray  # (n, 3)
    coords2: np.ndarray  # (n, 2)
    trustworthiness: dict[int, float]  # dims -> sklearn trustworthiness@10
    knn_kept: dict[int, float]  # dims -> share of true 10-NN kept in the layout


@dataclass
class StyleMap:
    names: pd.Index
    xs: np.ndarray  # scaled features, shape (n, d)
    labels: np.ndarray  # k-means cluster per fighter
    axes: Layout  # hand-defined style axes (AXIS_WEIGHTS): interpretable
    similarity: Layout  # t-SNE: best at keeping neighbours, axes have no meaning

    @property
    def coords(self) -> np.ndarray:
        return self.axes.coords3

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


# Hand-defined style axes: weighted averages of standardised stats, each stat used once.
# Readable by construction (unlike PCA axes, whose strongest pattern here is "accuracy").
AXIS_WEIGHTS: dict[str, dict[str, float]] = {
    "grappling": {
        "average_takedowns_landed_per_15_minutes": 2,  # grappling is mostly takedowns
        "average_submissions_attempted_per_15_minutes": 1,
        "takedown_accuracy": 1,
    },
    "striking": {
        "significant_strikes_landed_per_minute": 1,
        "significant_striking_accuracy": 1,
    },
    "defence": {
        "significant_strike_defence": 1,
        "takedown_defense": 1,
        "significant_strikes_absorbed_per_minute": -1,
    },
}
SCENE_RADIUS = 4.0  # layouts are rescaled so ~all fighters fit within this radius


def style_axes(xs: np.ndarray) -> np.ndarray:
    """Scores on the AXIS_WEIGHTS axes, each standardised; shape (n, 3)."""
    weights = np.array([[w.get(f, 0.0) for f in STYLE_FEATURES] for w in AXIS_WEIGHTS.values()]).T
    scores = xs @ (weights / np.abs(weights).sum(axis=0))
    standardised: np.ndarray = (scores - scores.mean(axis=0)) / scores.std(axis=0)
    return standardised


def rescale(coords: np.ndarray) -> np.ndarray:
    """Uniformly scale a layout so 97.5% of coordinates fall within SCENE_RADIUS."""
    scaled: np.ndarray = coords / np.percentile(np.abs(coords), 97.5) * SCENE_RADIUS
    return scaled


def knn_kept(xs: np.ndarray, coords: np.ndarray, k: int = 10) -> float:
    """Average share of each fighter's true k nearest neighbours that stay nearest in ``coords``."""
    true = NearestNeighbors(n_neighbors=k + 1).fit(xs).kneighbors(xs, return_distance=False)
    mapped = (
        NearestNeighbors(n_neighbors=k + 1).fit(coords).kneighbors(coords, return_distance=False)
    )
    return float(
        np.mean([len(set(a[1:]) & set(b[1:])) / k for a, b in zip(true, mapped, strict=True)])
    )


def make_layout(xs: np.ndarray, coords3: np.ndarray, coords2: np.ndarray) -> Layout:
    return Layout(
        coords3=rescale(coords3),
        coords2=rescale(coords2),
        trustworthiness={
            d: float(trustworthiness(xs, c, n_neighbors=10))
            for d, c in [(3, coords3), (2, coords2)]
        },
        knn_kept={d: knn_kept(xs, c) for d, c in [(3, coords3), (2, coords2)]},
    )


def fit_style_map(table: pd.DataFrame, n_clusters: int = 5, seed: int = 0) -> StyleMap:
    xs = scale_features(table)
    scores = style_axes(xs)
    perplexity = min(30.0, (len(xs) - 1) / 3)  # t-SNE needs perplexity < n
    tsne = {
        d: TSNE(d, perplexity=perplexity, init="pca", random_state=seed).fit_transform(xs)
        for d in (3, 2)
    }
    labels = KMeans(n_clusters=n_clusters, n_init=10, random_state=seed).fit_predict(xs)
    return StyleMap(
        names=table.index,
        xs=xs,
        labels=labels,
        axes=make_layout(xs, scores, scores[:, :2]),
        similarity=make_layout(xs, tsne[3], tsne[2]),
    )
