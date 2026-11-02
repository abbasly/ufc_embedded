"""Skill ratings computed online through fight history (so always pre-fight, no leakage)."""

import math

import pandas as pd

START = 1500.0

# Glicko: a rating plus a rating deviation (RD) saying how unsure we are about it. RD starts
# at RD_START for debutants, shrinks with every fight and grows back by RD_GROWTH per idle
# month. Values picked on 2019-23 rolling validation.
RD_START = 200.0
RD_GROWTH = 10.0
RD_MIN = 30.0
_Q = math.log(10) / 400


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


def _g(rd: float) -> float:
    return 1 / math.sqrt(1 + 3 * _Q * _Q * rd * rd / math.pi**2)


def glicko_expected(r_a: float, rd_a: float, r_b: float, rd_b: float) -> float:
    """Glicko P(A beats B): the Elo curve, flattened when either rating is uncertain."""
    return 1 / (1 + 10 ** (-_g(math.hypot(rd_a, rd_b)) * (r_a - r_b) / 400))


def glicko(feats: pd.DataFrame) -> pd.DataFrame:
    """Pre-fight Glicko rating and RD for every appearance in ``feats`` (index aligned).

    Appearances without an opponent (``current_features``' hypothetical next fight) get
    the fighter's rating going in, with RD grown for the time since their last fight.
    """
    rating: dict[str, float] = {}
    rd: dict[str, float] = {}
    last: dict[str, pd.Timestamp] = {}
    out: dict[object, tuple[float, float]] = {}
    ordered = feats.sort_values(["date", "fight", "side"], kind="stable")
    for _, group in ordered.groupby("fight", sort=False):
        cur = []
        for i, row in group.iterrows():
            fid, date = row["id"], row["date"]
            r, d = rating.get(fid, START), rd.get(fid, RD_START)
            if fid in last:
                months = (date - last[fid]).days / 30.44
                d = min(math.sqrt(d * d + RD_GROWTH**2 * months), RD_START)
            out[i] = (r, d)
            cur.append((fid, r, d, row["won"]))
        if len(cur) != 2:
            continue
        for fid, _, _, _ in cur:
            last[fid] = group["date"].iloc[0]
        for me, opp in ((cur[0], cur[1]), (cur[1], cur[0])):
            fid, r, d, won = me
            _, r_o, d_o, _ = opp
            if pd.isna(won):  # no contest: only the RD update for the time off
                rating[fid], rd[fid] = r, d
                continue
            g = _g(d_o)
            e = 1 / (1 + 10 ** (-g * (r - r_o) / 400))
            inv = 1 / (d * d) + _Q * _Q * g * g * e * (1 - e)
            rating[fid] = r + _Q / inv * g * (won - e)
            rd[fid] = max(math.sqrt(1 / inv), RD_MIN)
    pre = pd.DataFrame.from_dict(out, orient="index", columns=["glicko", "glicko_rd"])
    return pre.reindex(feats.index).fillna({"glicko": START, "glicko_rd": RD_START})


def schedule(feats: pd.DataFrame, rating: pd.Series) -> pd.DataFrame:
    """Strength of schedule and form against peak, from pre-fight ``rating`` per appearance.

    ``sos``: mean pre-fight rating of everyone the fighter faced earlier (START if nobody).
    ``off_peak``: rating going in minus the best rating they had going into any fight so far.
    """
    t = feats[["fight", "id", "date"]].assign(r=rating)
    opp_r = t.groupby("fight")["r"].transform("sum") - t["r"]  # the other side's rating
    t["opp_r"] = opp_r.where(t.groupby("fight")["r"].transform("size") == 2)
    t = t.sort_values(["date", "fight"], kind="stable")
    by_id = t.groupby("id")
    t["sos"] = by_id["opp_r"].transform(lambda s: s.shift(1).expanding().mean()).fillna(START)
    t["off_peak"] = t["r"] - by_id["r"].cummax()
    return t[["sos", "off_peak"]].reindex(feats.index)
