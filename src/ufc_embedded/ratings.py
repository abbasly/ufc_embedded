"""Skill ratings computed online through fight history (so always pre-fight, no leakage)."""

import pandas as pd

START = 1500.0


def expected(r_a: float, r_b: float) -> float:
    """Elo win probability of A against B."""
    return 1 / (1 + 10 ** ((r_b - r_a) / 400))


def elo(feats: pd.DataFrame, k: float = 40.0) -> tuple[pd.Series, dict[str, float]]:
    """Pre-fight Elo for every appearance in ``feats`` (index aligned), plus final ratings.

    Fights are processed in date order; a draw scores 0.5 and a no contest changes
    nothing. Debutants start at ``START``.
    """
    rating: dict[str, float] = {}
    pre: dict[object, float] = {}
    ordered = feats.sort_values(["date", "fight", "side"], kind="stable")
    for _, pair in ordered.groupby("fight", sort=False):
        if len(pair) != 2:
            continue
        (i, a), (j, b) = pair.iterrows()
        r_a, r_b = rating.get(a["id"], START), rating.get(b["id"], START)
        pre[i], pre[j] = r_a, r_b
        if pd.isna(a["won"]):
            continue
        delta = k * (a["won"] - expected(r_a, r_b))
        rating[a["id"]] = r_a + delta
        rating[b["id"]] = r_b - delta
    return pd.Series(pre, dtype=float).reindex(feats.index, fill_value=START), rating
