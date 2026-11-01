import pandas as pd

from ufc_embedded.data import (
    active_fighters,
    attach_odds,
    cage_minutes,
    fighter_summary,
    load_fights,
    load_profiles,
    public_ids,
    slugify,
)

URL = "http://ufcstats.com/fighter-details/"


def make_raw() -> pd.DataFrame:
    """Three fights in the UFCStats/Kaggle layout: A-B, A-C (C wins), C-A (draw)."""
    rows = [
        # date, f1, f2, winner, weight, result, round, time, f1 wins (career record at scrape)
        ("2015-01-01", "A", "B", "A", "Lightweight", "KO/TKO", 1, "3:00", 10),
        ("2023-06-01", "A", "C", "C", "Lightweight", "Decision - Unanimous", 3, "5:00", 11),
        ("2026-03-01", "C", "A", None, "Welterweight", "Decision - Majority", 3, "5:00", 12),
    ]
    raw = pd.DataFrame(
        {
            "event_date": pd.to_datetime([r[0] for r in rows]),
            "f_1_name": [r[1] for r in rows],
            "f_2_name": [r[2] for r in rows],
            "winner": [r[3] for r in rows],
            "weight_class": [r[4] for r in rows],
            "result": [r[5] for r in rows],
            "finish_round": [r[6] for r in rows],
            "finish_time": [r[7] for r in rows],
            "title_fight": [False, False, True],
        }
    )
    for k in ("1", "2"):
        raw[f"f_{k}_fighter_url"] = URL + raw[f"f_{k}_name"].str.lower()
        for stat in ("SlpM", "SApM", "TD_Avg", "Sub_Avg", "l", "d"):
            raw[f"f_{k}_fighter_{stat}"] = 1.0
        for stat in ("Str_Acc", "Str_Def", "TD_Acc", "TD_Def"):
            raw[f"f_{k}_fighter_{stat}"] = 0.5
    raw["f_1_fighter_w"] = [r[8] for r in rows]
    raw["f_2_fighter_w"] = [r[8] for r in rows]
    return raw


def test_cage_minutes_from_round_and_clock() -> None:
    minutes = cage_minutes(pd.Series([1, 3]), pd.Series(["3:30", "5:00"]))
    assert minutes.tolist() == [3.5, 15.0]


def test_load_fights_maps_winner_to_id_and_handles_draws() -> None:
    fights = load_fights(make_raw())
    assert fights["winner"].tolist()[:2] == ["a", "c"]
    assert pd.isna(fights["winner"].iloc[2])
    assert fights["method"].tolist() == ["KO/TKO", "U-DEC", "M-DEC"]
    assert fights["minutes"].tolist() == [3.0, 15.0, 15.0]


def test_profiles_use_latest_record_and_percent_scale() -> None:
    profiles = load_profiles(make_raw())
    assert profiles.loc["a", "wins"] == 12  # latest scrape, not the 2015 row
    assert profiles.loc["a", "significant_striking_accuracy"] == 50


def test_summary_and_activity() -> None:
    fights = load_fights(make_raw())
    summary = fighter_summary(fights)
    assert summary.loc["a", "n_fights"] == 3
    assert summary.loc["a", "minutes"] == 33
    assert summary.loc["a", "weight_class"] == "Welterweight"
    assert set(active_fighters(fights, years=3).index) == {"a", "c"}  # B last fought in 2015


def test_public_ids_disambiguate_namesakes_by_weight_class() -> None:
    ids = ["x", "y", "z"]
    profiles = pd.DataFrame({"name": ["Bruno Silva", "Bruno Silva", "Jiří Procházka"]}, index=ids)
    summary = pd.DataFrame(
        {"weight_class": ["Flyweight", "Middleweight", "Light Heavyweight"]}, index=ids
    )
    assert public_ids(profiles, summary) == {
        "x": "bruno-silva-flyweight",
        "y": "bruno-silva-middleweight",
        "z": "jiri-prochazka",
    }


def test_attach_odds_matches_by_date_and_name() -> None:
    odds = pd.DataFrame(
        {
            "Date": pd.to_datetime(["2023-06-01"]),
            "RedFighter": ["A"],
            "BlueFighter": ["C"],
            "RedOdds": [-200.0],
            "BlueOdds": [170.0],
        }
    )
    out = attach_odds(load_fights(make_raw()), odds)
    assert out["f1_odds"].isna().tolist()[:2] == [True, False]
    assert out["f1_odds"].tolist()[1] == -200.0
    assert out["f2_odds"].tolist()[1] == 170.0


def test_slugify_strips_accents_and_punctuation() -> None:
    assert slugify("Jiří Procházka") == "jiri-prochazka"
    assert slugify("Sean O'Malley") == "sean-o-malley"
