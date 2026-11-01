"""Loading raw Kaggle data and deriving per-fighter activity."""

import re
import unicodedata
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

FIGHTS_CSV = RAW_DIR / "ultimate-ufc-dataset" / "ufc-master.csv"
UPCOMING_CSV = RAW_DIR / "ultimate-ufc-dataset" / "upcoming.csv"
FIGHTER_STATS_CSV = RAW_DIR / "ufc-fighters-statistics" / "ufc-fighters-statistics.csv"

# The fighter stats file is a snapshot of UFCStats career numbers taken on this date.
FIGHTER_STATS_SNAPSHOT = pd.Timestamp("2024-02-17")

CATCH_WEIGHT = "Catch Weight"


def slugify(name: str) -> str:
    """URL-safe id that also merges spelling variants ("Kai Kara-France" / "Kai Kara France")."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")


def canonicalize_names(fights: pd.DataFrame) -> pd.DataFrame:
    """Use one spelling per fighter: the most common variant among names with the same slug."""
    counts = pd.concat([fights["R_fighter"], fights["B_fighter"]]).value_counts()
    best: dict[str, str] = {}
    for name in counts.index:  # most common first, so the first spelling per slug wins
        best.setdefault(slugify(str(name)), str(name))
    canonical = {str(name): best[slugify(str(name))] for name in counts.index}
    return fights.assign(
        R_fighter=fights["R_fighter"].map(canonical), B_fighter=fights["B_fighter"].map(canonical)
    )


def load_fights(path: Path = FIGHTS_CSV) -> pd.DataFrame:
    """One row per fight, Red vs Blue corner, with fighter names canonicalised."""
    return canonicalize_names(pd.read_csv(path, parse_dates=["date"]))


def load_upcoming(path: Path = UPCOMING_CSV) -> pd.DataFrame:
    return pd.read_csv(path, parse_dates=["date"])


def load_fighter_stats(path: Path = FIGHTER_STATS_CSV) -> pd.DataFrame:
    """One row per fighter with UFCStats career averages."""
    return pd.read_csv(path, parse_dates=["date_of_birth"])


def fighter_appearances(fights: pd.DataFrame) -> pd.DataFrame:
    """Stack Red and Blue corners so each row is one fighter in one fight."""
    cols = ["date", "weight_class"]
    red = fights[["R_fighter", "R_match_weightclass_rank", *cols]].rename(
        columns={"R_fighter": "name", "R_match_weightclass_rank": "rank"}
    )
    blue = fights[["B_fighter", "B_match_weightclass_rank", *cols]].rename(
        columns={"B_fighter": "name", "B_match_weightclass_rank": "rank"}
    )
    return pd.concat([red, blue], ignore_index=True).sort_values("date", kind="stable")


def fighter_summary(
    fights: pd.DataFrame, as_of: pd.Timestamp = FIGHTER_STATS_SNAPSHOT
) -> pd.DataFrame:
    """Per-fighter last fight, fight counts, most recent weight class and rank.

    ``rank`` is the division ranking going into the fighter's last fight (NaN if unranked).
    ``weight_class`` ignores catch weight bouts unless a fighter only has those.
    ``n_fights_as_of`` counts fights on or before ``as_of``, which is what the
    career stats in the fighter stats file are based on.
    """
    app = fighter_appearances(fights)
    summary = app.groupby("name").agg(
        last_fight=("date", "max"),
        n_fights=("date", "size"),
        weight_class=("weight_class", "last"),
    )
    divisional = app[app["weight_class"] != CATCH_WEIGHT].groupby("name")["weight_class"].last()
    summary["weight_class"] = divisional.reindex(summary.index).fillna(summary["weight_class"])
    summary["rank"] = app.groupby("name").tail(1).set_index("name")["rank"].reindex(summary.index)
    summary["n_fights_as_of"] = (
        app[app["date"] <= as_of].groupby("name").size().reindex(summary.index, fill_value=0)
    )
    return summary


def active_fighters(fights: pd.DataFrame, years: int = 3) -> pd.DataFrame:
    """Fighters whose last fight is within ``years`` of the latest fight in the data."""
    summary = fighter_summary(fights)
    cutoff = fights["date"].max() - pd.DateOffset(years=years)
    active: pd.DataFrame = summary.loc[summary["last_fight"] >= cutoff]
    return active
