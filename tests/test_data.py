import pandas as pd

from ufc_embedded.data import (
    active_fighters,
    canonicalize_names,
    fighter_appearances,
    fighter_summary,
)


def make_fights() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date": pd.to_datetime(["2015-01-01", "2023-06-01", "2026-03-01"]),
            "R_fighter": ["A", "A", "C"],
            "B_fighter": ["B", "C", "A"],
            "weight_class": ["Lightweight", "Lightweight", "Welterweight"],
            "R_match_weightclass_rank": [None, 5.0, None],
            "B_match_weightclass_rank": [None, None, 3.0],
        }
    )


def test_appearances_has_one_row_per_fighter_per_fight() -> None:
    app = fighter_appearances(make_fights())
    assert len(app) == 6
    assert set(app.columns) == {"name", "date", "weight_class", "rank"}


def test_summary_counts_and_latest_weight_class() -> None:
    summary = fighter_summary(make_fights(), as_of=pd.Timestamp("2024-01-01"))
    assert summary.loc["A", "n_fights"] == 3
    assert summary.loc["A", "n_fights_as_of"] == 2
    assert summary.loc["C", "n_fights_as_of"] == 1
    assert summary.loc["A", "weight_class"] == "Welterweight"
    assert summary.loc["A", "last_fight"] == pd.Timestamp("2026-03-01")
    assert summary.loc["A", "rank"] == 3.0  # rank going into the last fight
    assert summary["rank"].isna()["C"]  # never ranked


def test_active_uses_cutoff_relative_to_latest_fight() -> None:
    active = active_fighters(make_fights(), years=3)
    assert set(active.index) == {"A", "C"}  # B last fought in 2015


def test_canonicalize_merges_spelling_variants_to_most_common() -> None:
    fights = pd.DataFrame(
        {
            "R_fighter": ["Kai Kara-France", "Kai Kara-France", "X"],
            "B_fighter": ["Y", "Z", "Kai Kara France"],
        }
    )
    out = canonicalize_names(fights)
    assert set(out["R_fighter"]) | set(out["B_fighter"]) == {"Kai Kara-France", "X", "Y", "Z"}
