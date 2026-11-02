import numpy as np
import pandas as pd

from ufc_embedded.data import load_fights
from ufc_embedded.features import (
    FEATURES,
    appearances,
    current_features,
    matchups,
    pre_fight_features,
    priors,
)
from ufc_embedded.ratings import elo, expected

URL = "http://ufcstats.com/"
STATS = ["knockdowns", "sig_strikes_att", "sig_strikes_succ", "takedown_att", "takedown_succ",
         "submission_att", "ctrl_time_sec"]  # fmt: skip


def make_raw(n: int = 8, seed: int = 0) -> pd.DataFrame:
    """``n`` monthly fights among four fighters; fighter 1 always wins, like the real data."""
    rng = np.random.default_rng(seed)
    pairs = [
        ("A", "B"),
        ("C", "D"),
        ("A", "C"),
        ("B", "D"),
        ("D", "A"),
        ("C", "B"),
        ("A", "B"),
        ("C", "D"),
    ]
    raw = pd.DataFrame(
        {
            "event_date": pd.date_range("2020-01-01", periods=n, freq="MS"),
            "fight_url": [f"{URL}fight-details/f{i}" for i in range(n)],
            "f_1_name": [p[0] for p in pairs[:n]],
            "f_2_name": [p[1] for p in pairs[:n]],
            "result": ["KO/TKO", "Submission", "Decision - Unanimous", "KO/TKO"] * (n // 4),
            "finish_round": [1, 2, 3, 1] * (n // 4),
            "finish_time": ["2:30", "4:00", "5:00", "1:00"] * (n // 4),
            "weight_class": "Lightweight",
            "title_fight": False,
        }
    )
    raw["winner"] = raw["f_1_name"]
    for k in ("1", "2"):
        raw[f"f_{k}_fighter_url"] = URL + "fighter-details/" + raw[f"f_{k}_name"]
        raw[f"f_{k}_fighter_dob"] = "1990-01-01"
        raw[f"f_{k}_fighter_height_cm"] = 180.0
        raw[f"f_{k}_fighter_reach_cm"] = 185.0
        raw[f"f_{k}_fighter_stance"] = "Orthodox"
        for s in STATS:
            raw[f"f_{k}_{s}"] = rng.integers(0, 60, n)
    return raw


# Shrinkage priors come from a fixed earlier period in the real pipeline; keep them fixed here
# too, so the leakage test only measures what the per-fighter features can see.
PRIOR = priors(appearances(make_raw()), pd.Timestamp("2030-01-01"))


def features(raw: pd.DataFrame) -> pd.DataFrame:
    return pre_fight_features(appearances(raw), PRIOR)


def test_features_only_use_earlier_fights() -> None:
    raw = make_raw()
    before = features(raw)
    # Change everything about the last fight: stats and result.
    changed = raw.copy()
    last = changed.index[-1]
    for k in ("1", "2"):
        for s in STATS:
            changed.loc[last, f"f_{k}_{s}"] = 999
    changed.loc[last, "winner"] = changed.loc[last, "f_2_name"]
    after = features(changed)
    # Every appearance's features, including the last fight's own, are unchanged.
    pd.testing.assert_frame_equal(before[FEATURES], after[FEATURES])


def test_first_fight_is_a_debut_with_prior_rates() -> None:
    feats = features(make_raw())
    first = feats[feats["date"] == feats["date"].min()]
    assert (first["ufc_fights"] == 0).all() and (first["debut"] == 1).all()
    assert first["slpm"].nunique() == 1  # nothing known yet: everyone gets the prior


def test_counts_and_streaks_before_each_fight() -> None:
    feats = features(make_raw())
    a = feats[feats["name"] == "A"].set_index("date")
    # A beat B (Jan) and C (Mar), then lost to D (May); this is A's row for the May fight.
    a_may = a.loc[pd.Timestamp("2020-05-01")]
    assert a_may["ufc_fights"] == 2 and a_may["win_streak"] == 2
    a_jul = a.loc[pd.Timestamp("2020-07-01")]
    assert a_jul["ufc_fights"] == 3 and a_jul["loss_streak"] == 1 and a_jul["win_streak"] == 0


def test_matchups_shuffle_the_winner_column() -> None:
    raw = make_raw()
    fights = load_fights(raw).assign(f1_odds=np.nan, f2_odds=np.nan)
    m = matchups(features(raw), fights, seed=3)
    assert 0 < m["y"].mean() < 1  # the raw data always lists the winner first
    swapped = m[m["y"] == 0]
    assert (
        swapped["b_name"]
        == raw.set_index("fight_url")
        .loc[[f"{URL}fight-details/{f}" for f in swapped["fight"]], "winner"]
        .to_numpy()
    ).all()


def test_elo_winner_gains_and_ratings_are_pre_fight() -> None:
    feats = features(make_raw())
    pre, final = elo(feats, k=32)
    first = feats.index[feats["date"] == feats["date"].min()]
    assert (pre[first] == 1500).all()  # nobody has a rating before their first fight
    assert final["A"] > 1500 > final["B"]
    assert expected(1600, 1500) + expected(1500, 1600) == 1


def test_current_features_count_every_past_fight() -> None:
    raw = make_raw()
    app = appearances(raw)
    now = current_features(app, PRIOR, pd.Timestamp("2021-01-01"))
    a = now.loc["A"]
    assert a["ufc_fights"] == 4 and a["win_streak"] == 1  # A: W, W, L (to D), W
    # Last fight Jul 2020 -> about half a year off by Jan 2021.
    assert 0.4 < a["layoff_years"] < 0.6
