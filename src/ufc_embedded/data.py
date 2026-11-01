"""Loading UFC data (UFCStats, via Kaggle) and deriving per-fighter summaries.

Fighters are identified by their UFCStats page id, so different people with the
same name (there are two Bruno Silvas) stay apart.
"""

import re
import unicodedata
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

# Kaggle: scarekrow/ufc-data (every UFC fight with UFCStats fighter records and career stats)
FIGHTS_CSV = RAW_DIR / "ufc-data" / "UFC_full_data_silver_v2.csv"
# Kaggle: valihameed/ufc-stats (same fights with betting odds, which the file above lacks)
ODDS_CSV = RAW_DIR / "ufc-stats" / "ufc-master.csv"
# Kaggle: jerzyszocik/ufc-rankings-history (official rankings; rank 0 = champion)
RANKINGS_CSV = RAW_DIR / "ufc-rankings-history" / "UFC_rankings_history.csv"

CATCH_WEIGHT = "Catch Weight"

# UFCStats career stat columns -> our feature names. Percentages there are 0-1, ours 0-100.
CAREER_STATS = {
    "SlpM": "significant_strikes_landed_per_minute",
    "SApM": "significant_strikes_absorbed_per_minute",
    "TD_Avg": "average_takedowns_landed_per_15_minutes",
    "Sub_Avg": "average_submissions_attempted_per_15_minutes",
    "Str_Acc": "significant_striking_accuracy",
    "Str_Def": "significant_strike_defence",
    "TD_Acc": "takedown_accuracy",
    "TD_Def": "takedown_defense",
}
PERCENT_STATS = {"Str_Acc", "Str_Def", "TD_Acc", "TD_Def"}
RECORD = {"w": "wins", "l": "losses", "d": "draws"}

SHORT_METHOD = {
    "Decision - Unanimous": "U-DEC",
    "Decision - Split": "S-DEC",
    "Decision - Majority": "M-DEC",
    "KO/TKO": "KO/TKO",
    "TKO - Doctor's Stoppage": "KO/TKO",
    "Submission": "SUB",
}


def slugify(name: str) -> str:
    """URL-safe id from a name ("Jiří Procházka" -> "jiri-prochazka")."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")


def fighter_id(url: str) -> str:
    """The stable UFCStats id at the end of a fighter-details URL."""
    return url.rstrip("/").rsplit("/", 1)[-1]


def load_raw(path: Path = FIGHTS_CSV) -> pd.DataFrame:
    return pd.read_csv(path, low_memory=False, parse_dates=["event_date"])


def cage_minutes(finish_round: pd.Series, finish_time: pd.Series) -> pd.Series:
    """Fight length in minutes from the finishing round and the clock ("3:32")."""
    clock = finish_time.fillna("0:00").str.split(":", expand=True).astype(float)
    return (finish_round.fillna(1) - 1) * 5 + clock[0] + clock[1] / 60


def load_fights(raw: pd.DataFrame) -> pd.DataFrame:
    """One row per fight, oldest first; ``winner`` is a fighter id or None (draw / no contest)."""
    f1 = raw["f_1_fighter_url"].map(fighter_id)
    f2 = raw["f_2_fighter_url"].map(fighter_id)
    winner = f1.where(raw["winner"] == raw["f_1_name"], f2.where(raw["winner"] == raw["f_2_name"]))
    fights = pd.DataFrame(
        {
            "date": raw["event_date"],
            "weight_class": raw["weight_class"].fillna(CATCH_WEIGHT),
            "title": raw["title_fight"].astype(bool),
            "method": raw["result"].map(SHORT_METHOD).fillna(raw["result"]),
            "round": raw["finish_round"],
            "minutes": cage_minutes(raw["finish_round"], raw["finish_time"]),
            "f1": f1,
            "f2": f2,
            "f1_name": raw["f_1_name"],
            "f2_name": raw["f_2_name"],
            "winner": winner,
        }
    )
    return fights.sort_values("date", kind="stable").reset_index(drop=True)


def load_profiles(raw: pd.DataFrame) -> pd.DataFrame:
    """Per fighter id: name, pro record and UFCStats career stats, from their latest fight row."""
    sides = []
    for k in ("1", "2"):
        cols = {f"f_{k}_fighter_url": "id", f"f_{k}_name": "name", "event_date": "date"}
        cols |= {f"f_{k}_fighter_{c}": n for c, n in (RECORD | CAREER_STATS).items()}
        sides.append(raw[list(cols)].rename(columns=cols))
    rows = pd.concat(sides).sort_values("date", kind="stable")
    profiles = rows.assign(id=rows["id"].map(fighter_id)).groupby("id").last().drop(columns="date")
    for c, n in CAREER_STATS.items():
        if c in PERCENT_STATS:
            profiles[n] = profiles[n] * 100
    return profiles


def attach_odds(fights: pd.DataFrame, odds: pd.DataFrame) -> pd.DataFrame:
    """Add American odds per fighter (``f1_odds``/``f2_odds``), matched on date and name."""
    lookup: dict[tuple[pd.Timestamp, str], float] = {}
    for corner in ("Red", "Blue"):
        for d, n, o in zip(
            odds["Date"], odds[f"{corner}Fighter"], odds[f"{corner}Odds"], strict=True
        ):
            lookup[(pd.Timestamp(d), slugify(str(n)))] = o
    out = fights.copy()
    for f in ("f1", "f2"):
        out[f"{f}_odds"] = [
            lookup.get((d, slugify(str(n))))
            for d, n in zip(out["date"], out[f"{f}_name"], strict=True)
        ]
    return out


def load_odds(path: Path = ODDS_CSV) -> pd.DataFrame:
    return pd.read_csv(path, parse_dates=["Date"])


def fighter_appearances(fights: pd.DataFrame) -> pd.DataFrame:
    """Stack both corners so each row is one fighter in one fight."""
    cols = ["date", "weight_class", "minutes"]
    return pd.concat(
        [fights[[f, *cols]].rename(columns={f: "id"}) for f in ("f1", "f2")], ignore_index=True
    ).sort_values("date", kind="stable")


def fighter_summary(fights: pd.DataFrame) -> pd.DataFrame:
    """Per fighter id: last fight, UFC fights, UFC cage minutes and most recent weight class.

    ``weight_class`` ignores catch weight bouts unless a fighter only has those.
    """
    app = fighter_appearances(fights)
    summary = app.groupby("id").agg(
        last_fight=("date", "max"),
        n_fights=("date", "size"),
        minutes=("minutes", "sum"),
        weight_class=("weight_class", "last"),
    )
    divisional = app[app["weight_class"] != CATCH_WEIGHT].groupby("id")["weight_class"].last()
    summary["weight_class"] = divisional.reindex(summary.index).fillna(summary["weight_class"])
    return summary


def active_fighters(fights: pd.DataFrame, years: int = 3) -> pd.DataFrame:
    """Fighters whose last fight is within ``years`` of the latest fight in the data."""
    summary = fighter_summary(fights)
    cutoff = fights["date"].max() - pd.DateOffset(years=years)
    active: pd.DataFrame = summary.loc[summary["last_fight"] >= cutoff]
    return active


def load_rankings(path: Path = RANKINGS_CSV) -> tuple[pd.DataFrame, str]:
    """The latest official divisional rankings (pound-for-pound lists dropped) and their date."""
    rankings = pd.read_csv(path)
    latest = str(rankings["date"].max())
    current = rankings[
        (rankings["date"] == latest) & ~rankings["weightclass"].str.contains("Pound")
    ]
    return current.rename(columns={"weightclass": "division", "fighter": "name"}), latest


def public_ids(profiles: pd.DataFrame, summary: pd.DataFrame) -> dict[str, str]:
    """Readable, unique URL ids: the name slug, plus the weight class for namesakes."""
    slugs = profiles["name"].map(lambda n: slugify(str(n)))
    taken = slugs.duplicated(keep=False)
    division = summary["weight_class"].reindex(profiles.index).fillna("")
    return {
        str(i): f"{s}-{slugify(str(d))}" if dup else str(s)
        for i, s, dup, d in zip(slugs.index, slugs, taken, division, strict=True)
    }
