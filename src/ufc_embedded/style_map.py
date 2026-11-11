"""Fighter style map: per-fight stats -> shrunk career style profiles -> a weighted style
embedding, laid out on readable style axes and with t-SNE, plus k-means styles and neighbours.

Every stat is rebuilt from per-fight totals (not UFCStats' career averages), so shrinkage
uses real counts and a fighter's fights can be split in two to test the embedding: a good
style embedding recognises a fighter from one half of their fights by the other half.
Each stat is weighted by how stable it is over a career (see ``reliability``).
"""

from dataclasses import dataclass
from functools import cached_property
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.manifold import TSNE, trustworthiness
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from ufc_embedded.data import fighter_id
from ufc_embedded.features import appearances

PRIOR_MINUTES = 30.0  # shrinkage for per-minute rates and control time (about three fights)
PRIOR_STRIKES = 20.0  # for shares of significant strikes
PRIOR_TAKEDOWNS = 5.0  # for takedown accuracy and defence


@dataclass(frozen=True)
class Stat:
    """A career stat: ``scale * sum(num) / sum(den)`` over a fighter's fights."""

    key: str
    num: str
    den: str
    scale: float
    prior: float  # pseudo-amount of ``den`` at the population rate, added when shrinking
    invert: bool = False  # defence: 100 minus the opponents' success rate
    log: bool = False  # skewed per-minute rates are log1p'd before standardising


M, S, T = PRIOR_MINUTES, PRIOR_STRIKES, PRIOR_TAKEDOWNS  # shorthand for the table
STATS = [
    Stat("significant_strikes_landed_per_minute", "sig_succ", "minutes", 1, M, log=True),
    Stat("significant_strikes_absorbed_per_minute", "opp_sig_succ", "minutes", 1, M, log=True),
    Stat("average_takedowns_landed_per_15_minutes", "td_succ", "minutes", 15, M, log=True),
    Stat("average_submissions_attempted_per_15_minutes", "sub_att", "minutes", 15, M, log=True),
    Stat("knockdowns_per_15_minutes", "kd", "minutes", 15, M, log=True),
    Stat("significant_striking_accuracy", "sig_succ", "sig_att", 100, S),
    Stat("significant_strike_defence", "opp_sig_succ", "opp_sig_att", 100, S, invert=True),
    Stat("takedown_accuracy", "td_succ", "td_att", 100, T),
    Stat("takedown_defense", "opp_td_succ", "opp_td_att", 100, T, invert=True),
    Stat("control_time", "ctrl_min", "minutes", 100, M),
    Stat("body_strikes", "body_att", "sig_att", 100, S),
    Stat("leg_strikes", "leg_att", "sig_att", 100, S),
    Stat("clinch_strikes", "clinch_att", "sig_att", 100, S),
    Stat("ground_strikes", "ground_att", "sig_att", 100, S),
]  # fmt: skip
STYLE_FEATURES = [s.key for s in STATS]
# The 8 UFCStats career averages: the original style map, kept as the baseline.
CAREER_FEATURES = STYLE_FEATURES[:4] + STYLE_FEATURES[5:9]
LOG_FEATURES = {s.key for s in STATS if s.log}

# Where significant strikes went (head is the rest) and where they were thrown from
# (distance is the rest); UFCStats only has these per round.
SPLITS = ["body", "leg", "clinch", "ground"]
ROUNDS = range(1, 6)


def style_appearances(raw: pd.DataFrame) -> pd.DataFrame:
    """One row per fighter per fight, oldest first, with the counts ``STATS`` are built from."""
    sides = []
    for me in ("1", "2"):
        side = pd.DataFrame({"fight": raw["fight_url"].map(fighter_id), "side": int(me)})
        for part in SPLITS:
            side[f"{part}_att"] = sum(raw[f"f_{me}_r{r}_{part}_att"].fillna(0) for r in ROUNDS)
        sides.append(side)
    splits = pd.concat(sides).drop_duplicates(["fight", "side"])
    app = appearances(raw).merge(splits, on=["fight", "side"], how="left")
    app["ctrl_min"] = app["ctrl_sec"] / 60
    cols = {c for s in STATS for c in (s.num, s.den)}
    return app[["id", "date", "fight", *sorted(cols)]].fillna(0)


def career_stats(
    app: pd.DataFrame, population: pd.DataFrame | None = None, shrink: bool = True
) -> pd.DataFrame:
    """``STYLE_FEATURES`` per fighter from their appearances in ``app``.

    With ``shrink``, each stat is pulled toward the ``population``'s rate (by default the
    fighters in ``app``) by its prior, so a 100% takedown accuracy from one attempt reads as
    about average, while one from fifty attempts stays high.
    """
    pop = app if population is None else population
    totals = app.groupby("id")[sorted({c for s in STATS for c in (s.num, s.den)})].sum()
    out = pd.DataFrame(index=totals.index)
    for s in STATS:
        num, den = totals[s.num], totals[s.den]
        if shrink:
            rate = pop[s.num].sum() / pop[s.den].sum()
            value = (num + rate * s.prior) / (den + s.prior)
        else:
            value = (num / den.where(den > 0)).fillna(0)
        out[s.key] = s.scale * (1 - value if s.invert else value)
    return out


def build_feature_table(
    app: pd.DataFrame, active: pd.DataFrame, min_fights: int = 3
) -> pd.DataFrame:
    """Raw (unshrunk) career stats for active fighters with at least ``min_fights`` UFC fights.

    ``active`` (indexed by fighter id) supplies the other columns, such as ``n_fights``.
    """
    eligible = active[active["n_fights"] >= min_fights]
    stats = career_stats(app[app["id"].isin(eligible.index)], shrink=False)
    return eligible.join(stats, how="inner")


def transform(stats: pd.DataFrame, features: list[str] = STYLE_FEATURES) -> np.ndarray:
    """log1p the per-minute rates, so a few extreme output fighters don't dominate."""
    x = stats[features].to_numpy(dtype=float).copy()
    for i, f in enumerate(features):
        if f in LOG_FEATURES:
            x[:, i] = np.log1p(x[:, i])
    return x


def scale_features(stats: pd.DataFrame, features: list[str] = STYLE_FEATURES) -> np.ndarray:
    """Transformed, then standardised: every stat counts the same."""
    scaled: np.ndarray = StandardScaler().fit_transform(transform(stats, features))
    return scaled


def _halves(app: pd.DataFrame, min_fights: int, split: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Each fighter's fights in two halves: ``"alternate"`` (1st, 3rd... vs 2nd, 4th...) or
    ``"career"`` (first half vs second half), for fighters with ``min_fights`` or more."""
    n = app.groupby("id")["fight"].transform("size")
    app = app[n >= min_fights]
    k = app.groupby("id").cumcount()
    first = k % 2 == 0 if split == "alternate" else k < n[n >= min_fights] / 2
    return app[first], app[~first]


def reliability(
    app: pd.DataFrame, features: list[str] = STYLE_FEATURES, min_fights: int = 6
) -> pd.Series:
    """How stable each stat is over a career: the correlation between a fighter's first and
    second half of fights (shrunk, standardised as in the map). Near 0 means mostly noise."""
    a, b = _halves(app, min_fights, "career")
    sa, sb = career_stats(a, app), career_stats(b, app)
    both = sa.index.intersection(sb.index)
    scaler = StandardScaler().fit(transform(career_stats(app), features))
    xa = scaler.transform(transform(sa.loc[both], features))
    xb = scaler.transform(transform(sb.loc[both], features))
    r = [np.corrcoef(xa[:, i], xb[:, i])[0, 1] for i in range(len(features))]
    return pd.Series(np.clip(r, 0, None), index=features)


def self_match(
    app: pd.DataFrame,
    features: list[str] = STYLE_FEATURES,
    weights: pd.Series | None = None,
    min_fights: int = 6,
) -> dict[str, float]:
    """Does the embedding recognise a fighter's style? Each fighter's alternate fights make
    two profiles; for each profile from one half, rank every fighter's other-half profile by
    distance. Reports how often the fighter's own is nearest (top 1) or in the top 10, and
    the median rank (0 = nearest), out of ``n`` fighters."""
    a, b = _halves(app, min_fights, "alternate")
    sa, sb = career_stats(a, app), career_stats(b, app)
    both = sa.index.intersection(sb.index)
    scaler = StandardScaler().fit(transform(career_stats(app), features))
    w = np.ones(len(features)) if weights is None else weights[features].to_numpy()
    xa = scaler.transform(transform(sa.loc[both], features)) * w
    xb = scaler.transform(transform(sb.loc[both], features)) * w
    d = ((xa[:, None, :] - xb[None, :, :]) ** 2).sum(-1)
    rank = (d < np.diag(d)[:, None]).sum(axis=1)
    return {
        "n": len(both),
        "top1": round(float(np.mean(rank == 0)), 3),
        "top10": round(float(np.mean(rank < 10)), 3),
        "median_rank": float(np.median(rank)),
    }


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
    xs: np.ndarray  # standardised stats, shape (n, d)
    embedding: np.ndarray  # xs times the stat weights: what similarity is measured in
    labels: np.ndarray  # k-means cluster per fighter
    axes: Layout  # hand-defined style axes (AXIS_WEIGHTS): interpretable
    similarity: Layout  # t-SNE: best at keeping neighbours, axes have no meaning

    @property
    def coords(self) -> np.ndarray:
        return self.axes.coords3

    def neighbours(self, name: str, k: int = 5) -> pd.Series:
        """The ``k`` most similar fighters to ``name`` and their distances."""
        return self.all_neighbours(k)[name]

    def all_neighbours(self, k: int = 5, among: pd.Series | None = None) -> dict[str, pd.Series]:
        """Nearest neighbours in the embedding for every fighter. With ``among`` (a group
        label per fighter, such as the division), only fighters in the same group count."""
        groups = pd.Series(0, index=self.names) if among is None else among.loc[self.names]
        names = self.names.to_numpy()
        out: dict[str, pd.Series] = {}
        for _, members in groups.groupby(groups, sort=False):
            pos = self.names.get_indexer(members.index)
            n = min(k + 1, len(pos))
            dist, idx = (
                NearestNeighbors(n_neighbors=n)
                .fit(self.embedding[pos])
                .kneighbors(self.embedding[pos])
            )
            for row, i in enumerate(pos):
                keep = idx[row] != row  # drop the fighter themself
                out[names[i]] = pd.Series(
                    dist[row][keep][:k], index=names[pos[idx[row][keep]]][:k], name="distance"
                )
        return out

    @cached_property
    def typical_distance(self) -> float:
        """The median distance between two fighters in the embedding."""
        x = self.embedding
        d = np.sqrt(((x[:, None, :] - x[None, :, :]) ** 2).sum(-1))
        return float(np.median(d[np.triu_indices(len(x), k=1)]))

    def similarity_score(self, distances: np.ndarray) -> np.ndarray:
        """Distances as a 0-100 similarity: 100 is the same style, 0 is as far apart as a
        typical pair of fighters (or further)."""
        score: np.ndarray = np.clip(100 * (1 - distances / self.typical_distance), 0, 100)
        return score


# Hand-defined style axes: weighted averages of standardised stats, each stat used once.
# Readable by construction (unlike PCA axes, whose strongest pattern here is "accuracy").
AXIS_WEIGHTS: dict[str, dict[str, float]] = {
    "grappling": {
        "average_takedowns_landed_per_15_minutes": 2,  # grappling is mostly takedowns
        "control_time": 2,
        "average_submissions_attempted_per_15_minutes": 1,
    },
    "striking": {
        "significant_strikes_landed_per_minute": 2,
        "significant_striking_accuracy": 1,
        "knockdowns_per_15_minutes": 1,
    },
    "defence": {
        "significant_strike_defence": 1,
        "takedown_defense": 1,
        "significant_strikes_absorbed_per_minute": -1,
    },
}
SCENE_RADIUS = 4.0  # layouts are rescaled so ~all fighters fit within this radius


def axis_matrix() -> np.ndarray:
    """AXIS_WEIGHTS as a (stats, 3) matrix, each column's weights summing to 1 in size."""
    weights = np.array([[w.get(f, 0.0) for f in STYLE_FEATURES] for w in AXIS_WEIGHTS.values()]).T
    matrix: np.ndarray = weights / np.abs(weights).sum(axis=0)
    return matrix


def style_axes(xs: np.ndarray) -> np.ndarray:
    """Scores on the AXIS_WEIGHTS axes, each standardised; shape (n, 3)."""
    scores = xs @ axis_matrix()
    standardised: np.ndarray = (scores - scores.mean(axis=0)) / scores.std(axis=0)
    return standardised


def axes_projection(xs: np.ndarray) -> dict[str, Any]:
    """The Style axes layout of ``xs`` as one formula, so any vector in the same space (a sum
    or difference of fighters, say) lands where it belongs on the map: its 3D position is
    ``(v @ matrix - mean) / std * scale3``, and its 2D position the first two of those with
    ``scale2`` instead. It's linear, so adding vectors adds their arrows on the map."""
    matrix = axis_matrix()
    scores = xs @ matrix
    mean, std = scores.mean(axis=0), scores.std(axis=0)
    z = (scores - mean) / std
    return {
        "matrix": matrix.tolist(),
        "mean": mean.tolist(),
        "std": std.tolist(),
        "scale3": float(SCENE_RADIUS / np.percentile(np.abs(z), 97.5)),
        "scale2": float(SCENE_RADIUS / np.percentile(np.abs(z[:, :2]), 97.5)),
    }


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


def fit_style_map(
    stats: pd.DataFrame,
    n_clusters: int = 5,
    seed: int = 0,
    weights: pd.Series | None = None,
) -> StyleMap:
    """Fit the map from (shrunk) ``STYLE_FEATURES`` per fighter. ``weights`` scale each
    standardised stat in the embedding (default: all 1)."""
    xs = scale_features(stats)
    w = np.ones(len(STYLE_FEATURES)) if weights is None else weights[STYLE_FEATURES].to_numpy()
    emb = xs * w
    perplexity = min(30.0, (len(xs) - 1) / 3)  # t-SNE needs perplexity < n
    tsne = {
        d: TSNE(d, perplexity=perplexity, init="pca", random_state=seed).fit_transform(emb)
        for d in (3, 2)
    }
    labels = KMeans(n_clusters=n_clusters, n_init=10, random_state=seed).fit_predict(emb)
    scores = style_axes(xs)
    return StyleMap(
        names=stats.index,
        xs=xs,
        embedding=emb,
        labels=labels,
        axes=make_layout(emb, scores, scores[:, :2]),
        similarity=make_layout(emb, tsne[3], tsne[2]),
    )


def main() -> None:
    """Compare the old 8-stat embedding with the new one (``uv run python -m
    ufc_embedded.style_map``)."""
    from ufc_embedded.data import active_fighters, load_fights, load_raw

    raw = load_raw()
    active = active_fighters(load_fights(raw))
    app = style_appearances(raw)
    app = app[app["id"].isin(active.index)]
    w = reliability(app)
    print("stat stability (first vs second half of career):")
    for f, r in w.sort_values(ascending=False).items():
        print(f"  {f:<46} {r:.2f}")
    for name, feats, weights in [
        ("8 career stats", CAREER_FEATURES, None),
        ("14 stats", STYLE_FEATURES, None),
        ("14 stats, stability-weighted", STYLE_FEATURES, w),
    ]:
        print(f"{name:<30} {self_match(app, feats, weights)}")


if __name__ == "__main__":
    main()
