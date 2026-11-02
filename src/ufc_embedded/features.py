"""Point-in-time fighter features for the fight predictor.

Every feature for fighter X in fight F uses only X's fights on *earlier dates* than F.
UFCStats' own career stats and W-L-D records are as of today, so they would leak the
results we're trying to predict; everything here is rebuilt from per-fight stats.

Two traps in the raw data this module handles:
- ``f_1`` is always the winner, so matchups are re-oriented at random.
- Career stats/records are current, so only per-fight stats and the *final* record
  (adjusted back to fight time) are used.
"""

import numpy as np
import pandas as pd

from ufc_embedded.data import fighter_id, load_fights
from ufc_embedded.evaluate import market_prob

# Per-fight stat columns in the raw data -> short names. Each side also gets the
# opponent's numbers as ``opp_<name>`` (what they absorbed / defended).
PER_FIGHT = {
    "knockdowns": "kd",
    "sig_strikes_att": "sig_att",
    "sig_strikes_succ": "sig_succ",
    "takedown_att": "td_att",
    "takedown_succ": "td_succ",
    "submission_att": "sub_att",
    "ctrl_time_sec": "ctrl_sec",
}
COUNTS = list(PER_FIGHT.values())

PRIOR_MINUTES = 30.0  # shrinkage strength for per-minute rates (about three fights)
PRIOR_ATTEMPTS = 10.0  # shrinkage strength for accuracy / defence percentages

# Pre-fight features per fighter; matchups use A - B differences of these.
FEATURES = [
    "ufc_fights",
    "ufc_minutes",
    "win_rate",
    "win_streak",
    "loss_streak",
    "ko_win_rate",
    "sub_win_rate",
    "finished_rate",
    "pro_fights",
    "pro_win_rate",
    "layoff_years",
    "debut",
    "age",
    "height",
    "reach",
    "southpaw",
    "slpm",
    "sapm",
    "str_acc",
    "str_def",
    "td15",
    "td_acc",
    "td_def",
    "sub15",
    "ctrl_share",
    "ctrled_share",
    "kd15",
    "kd_absorbed15",
]


def appearances(raw: pd.DataFrame) -> pd.DataFrame:
    """One row per fighter per fight: outcome, bio, and both sides' stats in that fight.

    ``won`` is 1/0, 0.5 for a draw, NaN for a no contest. ``side`` is the raw column
    (1 or 2) the fighter came from, used later to attach betting odds.
    """
    fights = load_fights(raw).set_index("fight")
    sides = []
    for me, opp in (("1", "2"), ("2", "1")):
        side = pd.DataFrame(
            {
                "fight": raw["fight_url"].map(fighter_id),
                "side": int(me),
                "id": raw[f"f_{me}_fighter_url"].map(fighter_id),
                "opp": raw[f"f_{opp}_fighter_url"].map(fighter_id),
                "name": raw[f"f_{me}_name"],
                "dob": pd.to_datetime(raw[f"f_{me}_fighter_dob"], errors="coerce"),
                "height": raw[f"f_{me}_fighter_height_cm"],
                "reach": raw[f"f_{me}_fighter_reach_cm"],
                "stance": raw[f"f_{me}_fighter_stance"],
            }
        )
        for col, short in PER_FIGHT.items():
            side[short] = pd.to_numeric(raw[f"f_{me}_{col}"], errors="coerce").fillna(0)
            side[f"opp_{short}"] = pd.to_numeric(raw[f"f_{opp}_{col}"], errors="coerce").fillna(0)
        sides.append(side)

    app = pd.concat(sides, ignore_index=True)
    app = app.join(
        fights[["date", "method", "minutes", "winner", "weight_class", "title"]], on="fight"
    )
    app["won"] = (app["winner"] == app["id"]).astype(float).where(app["winner"].notna())
    draw = app["winner"].isna() & app["method"].str.contains("DEC", na=False)
    app.loc[draw, "won"] = 0.5
    return app.sort_values(["date", "fight", "side"], kind="stable").reset_index(drop=True)


def _day_totals(app: pd.DataFrame) -> pd.DataFrame:
    """Per fighter and date: fights, results and stat sums on that date."""
    won = app["won"]
    finish = app["method"].isin(["KO/TKO", "SUB"])
    parts = app[["id", "date", "minutes", *COUNTS, *(f"opp_{c}" for c in COUNTS)]].assign(
        fights=1,
        wins=(won == 1).astype(int),
        losses=(won == 0).astype(int),
        ko_wins=((won == 1) & (app["method"] == "KO/TKO")).astype(int),
        sub_wins=((won == 1) & (app["method"] == "SUB")).astype(int),
        finished=((won == 0) & finish).astype(int),
    )
    return parts.groupby(["id", "date"]).sum()


def _streaks(day: pd.DataFrame) -> pd.DataFrame:
    """Win and loss streaks going into each date (draws and no contests break both)."""
    rows = []
    for fid, group in day.groupby(level="id", sort=False):
        win = loss = 0
        for (_, date), w, lo, n in zip(
            group.index, group["wins"], group["losses"], group["fights"], strict=True
        ):
            rows.append((fid, date, win, loss))
            win = win + w if w == n else 0
            loss = loss + lo if lo == n else 0
    return pd.DataFrame(rows, columns=["id", "date", "win_streak", "loss_streak"]).set_index(
        ["id", "date"]
    )


def priors(app: pd.DataFrame, before: pd.Timestamp) -> dict[str, float]:
    """Population averages used for shrinkage, from fights before ``before`` only."""
    past = app[app["date"] < before]
    minutes = past["minutes"].sum()

    def per_min(c: str) -> float:
        return float(past[c].sum() / minutes)

    def ratio(a: str, b: str) -> float:
        return float(past[a].sum() / past[b].sum())

    return {
        "sig_per_min": per_min("sig_succ"),
        "td_per_min": per_min("td_succ"),
        "sub_per_min": per_min("sub_att"),
        "kd_per_min": per_min("kd"),
        "ctrl_share": float(past["ctrl_sec"].sum() / 60 / minutes),
        "str_acc": ratio("sig_succ", "sig_att"),
        "td_acc": ratio("td_succ", "td_att"),
    }


def pre_fight_features(
    app: pd.DataFrame, prior: dict[str, float], final_record: pd.DataFrame | None = None
) -> pd.DataFrame:
    """Features for each appearance from that fighter's earlier dates only.

    ``final_record`` (index fighter id; columns wins, losses, draws) is today's pro record;
    subtracting UFC results from this fight on gives the pro record going in.
    """
    day = _day_totals(app)
    before = day.groupby(level="id").cumsum() - day  # strictly earlier dates
    before = before.join(_streaks(day))
    dates = day.reset_index()[["id", "date"]]
    before["layoff_days"] = dates.groupby("id")["date"].diff().dt.days.to_numpy()

    f = app.join(before.add_prefix("b_"), on=["id", "date"])
    n, mins = f["b_fights"], f["b_minutes"]
    m0, k0, p = PRIOR_MINUTES, PRIOR_ATTEMPTS, prior

    def rate(count: str, per_min: float, scale: float = 1.0) -> pd.Series:
        return scale * (f[f"b_{count}"] + per_min * m0) / (mins + m0)

    def pct(succ: str, att: str, base: float) -> pd.Series:
        return (f[f"b_{succ}"] + base * k0) / (f[f"b_{att}"] + k0)

    out = pd.DataFrame(index=f.index)
    out["ufc_fights"] = n
    out["ufc_minutes"] = mins
    out["win_rate"] = (f["b_wins"] + 1) / (n + 2)
    out["win_streak"] = f["b_win_streak"]
    out["loss_streak"] = f["b_loss_streak"]
    out["ko_win_rate"] = f["b_ko_wins"] / (n + 1)
    out["sub_win_rate"] = f["b_sub_wins"] / (n + 1)
    out["finished_rate"] = f["b_finished"] / (n + 1)
    out["layoff_years"] = (f["b_layoff_days"] / 365.25).fillna(0)
    out["debut"] = (n == 0).astype(int)
    out["age"] = (f["date"] - f["dob"]).dt.days / 365.25
    out["height"] = f["height"]
    out["reach"] = f["reach"].fillna(f["height"])  # reach is close to height when missing
    out["southpaw"] = (f["stance"] == "Southpaw").astype(int)
    out["slpm"] = rate("sig_succ", p["sig_per_min"])
    out["sapm"] = rate("opp_sig_succ", p["sig_per_min"])
    out["str_acc"] = pct("sig_succ", "sig_att", p["str_acc"])
    out["str_def"] = 1 - pct("opp_sig_succ", "opp_sig_att", p["str_acc"])
    out["td15"] = rate("td_succ", p["td_per_min"], 15)
    out["td_acc"] = pct("td_succ", "td_att", p["td_acc"])
    out["td_def"] = 1 - pct("opp_td_succ", "opp_td_att", p["td_acc"])
    out["sub15"] = rate("sub_att", p["sub_per_min"], 15)
    out["ctrl_share"] = (f["b_ctrl_sec"] / 60 + p["ctrl_share"] * m0) / (mins + m0)
    out["ctrled_share"] = (f["b_opp_ctrl_sec"] / 60 + p["ctrl_share"] * m0) / (mins + m0)
    out["kd15"] = rate("kd", p["kd_per_min"], 15)
    out["kd_absorbed15"] = rate("opp_kd", p["kd_per_min"], 15)

    # Pro record going in: today's record minus UFC results from this fight onwards.
    # Exact when all later fights were in the UFC, which holds for nearly everyone.
    if final_record is not None:
        totals = day.groupby(level="id")[["wins", "losses"]].sum()
        rec = final_record.reindex(f["id"]).to_numpy()
        tot = totals.reindex(f["id"]).to_numpy()
        pro_w = np.clip(rec[:, 0] - (tot[:, 0] - f["b_wins"].to_numpy()), 0, None)
        pro_l = np.clip(rec[:, 1] - (tot[:, 1] - f["b_losses"].to_numpy()), 0, None)
        out["pro_fights"] = pro_w + pro_l
        out["pro_win_rate"] = (pro_w + 1) / (pro_w + pro_l + 2)
    else:
        out["pro_fights"] = n
        out["pro_win_rate"] = out["win_rate"]

    out["age"] = out["age"].fillna(out["age"].median())
    out["height"] = out["height"].fillna(out["height"].median())
    out["reach"] = out["reach"].fillna(out["height"])
    return pd.concat([app[["fight", "side", "id", "name", "date", "won"]], out[FEATURES]], axis=1)


def matchups(
    feats: pd.DataFrame, fights: pd.DataFrame, market: pd.DataFrame | None = None, seed: int = 0
) -> pd.DataFrame:
    """One row per decisive fight, fighters randomly assigned to A and B.

    The raw data lists the winner first, so without the random swap a model could
    learn the column order instead of anything about fighters. ``y`` is 1 if A won.
    ``p_market`` is the market's P(A wins): from ``market`` (see ``data.load_market``)
    where available, else from the American odds in ``fights``.
    """
    s1 = feats[feats["side"] == 1].set_index("fight")
    s2 = feats[feats["side"] == 2].set_index("fight")
    s2 = s2.loc[s1.index]
    odds = fights.set_index("fight")[["f1_odds", "f2_odds"]].reindex(s1.index)

    swap = np.random.default_rng(seed).random(len(s1)) < 0.5
    keep = pd.Series(~swap, index=s1.index)
    a = s1.where(keep, s2, axis=0)
    b = s2.where(keep, s1, axis=0)
    m = pd.DataFrame(
        {
            "date": s1["date"],
            "a": a["id"],
            "b": b["id"],
            "a_name": a["name"],
            "b_name": b["name"],
            "y": a["won"],
            "a_odds": np.where(swap, odds["f2_odds"], odds["f1_odds"]),
            "b_odds": np.where(swap, odds["f1_odds"], odds["f2_odds"]),
        }
    )
    m["p_market"] = market_prob(m["a_odds"], m["b_odds"])
    if market is not None:
        mk = market.reindex(s1.index)
        p_a = mk["p"].where(mk["fighter"] == m["a"], 1 - mk["p"])
        m["p_market"] = p_a.fillna(m["p_market"])
    info = fights.set_index("fight")[["method", "weight_class", "title"]].reindex(s1.index)
    m["method"] = info["method"].to_numpy()
    m["weight_class"] = info["weight_class"].to_numpy()
    m["title"] = info["title"].to_numpy()
    for col in FEATURES:
        m[f"a_{col}"] = a[col].astype(float)
        m[f"b_{col}"] = b[col].astype(float)
        m[f"d_{col}"] = m[f"a_{col}"] - m[f"b_{col}"]
    m = m[m["y"].isin([0.0, 1.0])]
    return m.reset_index().sort_values("date", kind="stable").reset_index(drop=True)


def current_features(
    app: pd.DataFrame,
    prior: dict[str, float],
    as_of: pd.Timestamp,
    final_record: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Every fighter's features going into a hypothetical fight on ``as_of``.

    Adds one empty appearance per fighter on that date and reads off its pre-fight
    features, so "today" is computed exactly like any historical fight.
    """
    latest = app.sort_values("date").groupby("id").tail(1)
    upcoming = latest.assign(
        fight="next-" + latest["id"],
        side=0,
        opp=None,
        date=as_of,
        won=np.nan,
        method=None,
        minutes=0.0,
        winner=None,
        **{c: 0 for c in COUNTS},
        **{f"opp_{c}": 0 for c in COUNTS},
    )
    feats = pre_fight_features(pd.concat([app, upcoming], ignore_index=True), prior, final_record)
    now = feats[feats["fight"].str.startswith("next-")].set_index("id")
    now["last_fight"] = latest.set_index("id")["date"].reindex(now.index)
    now["weight_class"] = latest.set_index("id")["weight_class"].reindex(now.index)
    return now.drop(columns=["fight", "side", "won", "date"])
