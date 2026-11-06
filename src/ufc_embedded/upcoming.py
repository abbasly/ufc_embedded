"""Upcoming UFC fights, from the bookmakers' listings in the daily odds data.

Bookmakers list fights before they happen (rows without a UFCStats fight link). The latest
snapshot drops cancelled bouts; fights more than ``HORIZON_DAYS`` out are mostly rumours or
placeholder dates, so they're left out. Event names ("UFC 335: Oliveira vs. Lopes"), the
official date and the city come from Wikipedia's list of scheduled UFC events.

Bookmakers also list other promotions (KSW, PFL...), so only UFC cards are kept: cards
where at least half the bouts are between two current UFC fighters (who fought in the UFC
recently). Debutants on those cards are kept too. Cards where someone is listed in two
bouts are rumour lists on placeholder dates, not bookings.
"""

import json
import re
from collections.abc import Callable, Hashable
from typing import Any, TypedDict

import pandas as pd

from ufc_embedded.data import MARKET_CSV, PROCESSED_DIR, slugify

EVENTS_CACHE = PROCESSED_DIR / "ufc_scheduled_events.json"
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTHS = {m: i for i, m in enumerate(MONTH_NAMES, 1)}

HORIZON_DAYS = 60
SNAPSHOT_DAYS = 3  # listings seen within this many days of the latest snapshot
SAME_CARD_DAYS = 1  # dates this close are one card (time zones split a Saturday night)
UFC_SHARE = 0.5  # a card is UFC if at least this share of bouts are between two known fighters


class Event(TypedDict):
    date: str  # yyyy-mm-dd
    name: str
    city: str


def _plain(wikitext: str) -> str:
    """Wiki markup to plain text: links to their label, refs and templates dropped."""
    text = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", wikitext, flags=re.S)
    text = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    return text.strip()


def parse_scheduled(wikitext: str) -> list[Event]:
    """Rows of the "Scheduled events" table on Wikipedia's "List of UFC events"."""
    events: list[Event] = []
    for row in wikitext.split("\n|-")[1:]:
        cells = [
            c[1:].strip()
            for c in row.strip().split("\n")
            if c.startswith("|") and not c.startswith("|}")
        ]
        # Drop cell attributes such as 'rowspan="1" |'.
        cells = [re.sub(r'^\w+="[^"]*"\s*\|', "", c).strip() for c in cells]
        if len(cells) < 4:
            continue
        date = re.search(r"\{\{dts\|(\d{4})\|(\w{3})\w*\|(\d{1,2})", cells[1])
        if not date or date.group(2) not in MONTHS:
            continue
        y, m, d = int(date.group(1)), MONTHS[date.group(2)], int(date.group(3))
        events.append(
            {
                "date": f"{y:04d}-{m:02d}-{d:02d}",
                "name": _plain(cells[0]),
                "city": _plain(cells[3]).split(",")[0].strip(),
            }
        )
    return events


def scheduled_events() -> list[Event]:
    """Scheduled UFC events from Wikipedia (cached on disk; the cache is used offline)."""
    from ufc_embedded.wikipedia import wiki_get

    try:
        sections = wiki_get({"action": "parse", "page": "List of UFC events", "prop": "sections"})
        index = next(
            s["index"] for s in sections["parse"]["sections"] if s["line"] == "Scheduled events"
        )
        page = wiki_get(
            {"action": "parse", "page": "List of UFC events", "prop": "wikitext", "section": index}
        )
        events = parse_scheduled(page["parse"]["wikitext"]["*"])
        # The cache is a nice-to-have: failing to write it (no folder, e.g. on CI) mustn't
        # throw away what was just fetched.
        try:
            EVENTS_CACHE.parent.mkdir(parents=True, exist_ok=True)
            EVENTS_CACHE.write_text(json.dumps(events, indent=1))
        except OSError:
            pass
        return events
    except (OSError, KeyError, StopIteration):
        if EVENTS_CACHE.exists():
            cached: list[Event] = json.loads(EVENTS_CACHE.read_text())
            return cached
        return []


def load_listings(path: str | None = None) -> pd.DataFrame:
    """Bookmaker rows for fights that haven't happened yet (no UFCStats fight link)."""
    raw = pd.read_csv(
        path or MARKET_CSV,
        usecols=[
            "fight_url",
            "fighter_1",
            "fighter_2",
            "odds_1",
            "odds_2",
            "event_date",
            "adding_date",
        ],
        low_memory=False,
    )
    raw = raw[raw["fight_url"].isna()].drop(columns="fight_url")
    raw["event_date"] = pd.to_datetime(raw["event_date"], errors="coerce")
    raw["added"] = pd.to_datetime(raw["adding_date"], errors="coerce", utc=True, format="mixed")
    return raw.dropna(subset=["event_date", "added", "fighter_1", "fighter_2"])


def upcoming_cards(
    listings: pd.DataFrame,
    known: dict[str, str],
    current: set[str],
    today: pd.Timestamp,
    events: list[Event] | None = None,
    horizon_days: int = HORIZON_DAYS,
) -> list[dict[str, Any]]:
    """Upcoming cards, earliest first: ``{"date", "fights": [{"a", "b", "a_name", "b_name",
    "p_market"}]}``. ``a`` / ``b`` are public fighter ids (None for fighters we don't know,
    such as UFC debutants); ``p_market`` is the bookmakers' median vig-free P(A wins).

    Cards matching a scheduled event (within a day: bookmakers' dates can be a time zone
    off) get its ``name``, ``city`` and official date, with the main event first.

    ``known`` maps a name slug to the public id of every UFC fighter; ``current`` holds the
    ids of those still fighting there, so ex-UFC fighters now in other promotions don't make
    those promotions' cards count as UFC.
    """
    window = listings[
        (listings["event_date"] >= today)
        & (listings["event_date"] <= today + pd.Timedelta(days=horizon_days))
    ]
    if window.empty:
        return []
    latest = window[window["added"] >= window["added"].max() - pd.Timedelta(days=SNAPSHOT_DAYS)]

    # One row per bout, in a fixed corner order, with the market's P(first named wins).
    s1, s2 = latest["fighter_1"].map(slugify), latest["fighter_2"].map(slugify)
    swap = s1 > s2
    valid = (latest["odds_1"] > 1) & (latest["odds_2"] > 1)
    q1, q2 = 1 / latest["odds_1"], 1 / latest["odds_2"]
    p1 = (q1 / (q1 + q2)).where(valid)
    bouts = pd.DataFrame(
        {
            "date": latest["event_date"],
            "a_name": latest["fighter_1"].where(~swap, latest["fighter_2"]),
            "b_name": latest["fighter_2"].where(~swap, latest["fighter_1"]),
            "p": p1.where(~swap, 1 - p1),
        }
    )
    lookup = _matcher(known)
    bouts["a"] = bouts["a_name"].map(lookup)
    bouts["b"] = bouts["b_name"].map(lookup)
    bouts = bouts[bouts["a"].notna() | bouts["b"].notna()]
    if bouts.empty:
        return []
    bouts = (
        bouts.groupby(["a_name", "b_name"], sort=False)
        .agg(date=("date", "min"), a=("a", "first"), b=("b", "first"), p=("p", "median"))
        .reset_index()
        .sort_values("date", kind="stable")
    )

    # Group bouts into cards: a new card starts more than SAME_CARD_DAYS after the last.
    card_start = bouts["date"].diff().dt.days.fillna(SAME_CARD_DAYS + 1) > SAME_CARD_DAYS
    bouts["card"] = card_start.cumsum()
    cards = []
    for _, card in bouts.groupby("card", sort=True):
        both_current = card["a"].isin(current) & card["b"].isin(current)
        if both_current.mean() < UFC_SHARE:
            continue  # another promotion's card
        if pd.concat([card["a_name"], card["b_name"]]).duplicated().any():
            continue  # a rumour list: someone is "booked" against two opponents
        date = card["date"].min()
        event = _event_for(date, events or [])
        fights = [_bout(r) for r in card.to_dict("records")]
        for f in fights:
            f["main"] = bool(event) and _is_main_event(f, event["name"] if event else "")
        fights.sort(key=lambda f: not f["main"])
        cards.append(
            {
                "date": event["date"] if event else str(date.date()),
                "name": event["name"] if event else None,
                "city": event["city"] if event else None,
                "fights": fights,
            }
        )
    return cards


def _event_for(date: pd.Timestamp, events: list[Event]) -> Event | None:
    """The scheduled event within SAME_CARD_DAYS of a card's date, if there is one."""
    close = [e for e in events if abs((pd.Timestamp(e["date"]) - date).days) <= SAME_CARD_DAYS]
    return min(close, key=lambda e: abs((pd.Timestamp(e["date"]) - date).days), default=None)


def _is_main_event(fight: dict[str, Any], event_name: str) -> bool:
    """Whether the event is named after this bout ("UFC 335: Oliveira vs. Lopes")."""
    title = slugify(event_name)
    return all(slugify(n).split("-")[-1] in title for n in (fight["a_name"], fight["b_name"]))


def _matcher(known: dict[str, str]) -> Callable[[str], str | None]:
    """Name -> public id. Exact slug first; else the same surname and the same first three
    letters of the first name, if only one fighter fits ("Sergey" vs UFCStats' "Sergei")."""
    by_key: dict[tuple[str, str], list[str]] = {}
    for slug, public in known.items():
        parts = slug.split("-")
        by_key.setdefault((parts[0][:3], parts[-1]), []).append(public)

    def lookup(name: str) -> str | None:
        slug = slugify(name)
        if slug in known:
            return known[slug]
        parts = slug.split("-")
        matches = by_key.get((parts[0][:3], parts[-1]), [])
        return matches[0] if len(matches) == 1 else None

    return lookup


def _bout(r: dict[Hashable, Any]) -> dict[str, Any]:
    def text(v: Any) -> str | None:
        return None if pd.isna(v) else str(v)

    return {
        "a": text(r["a"]),
        "b": text(r["b"]),
        "a_name": str(r["a_name"]),
        "b_name": str(r["b_name"]),
        "p_market": None if pd.isna(r["p"]) else round(float(r["p"]), 3),
    }


def name_index(names: pd.Series, ids: dict[str, str]) -> dict[str, str]:
    """Name slug -> public id (``names`` indexed by fighter id), skipping shared names."""
    slugs = names.map(lambda n: slugify(str(n)))
    unique = slugs[~slugs.duplicated(keep=False)]
    return {s: ids[str(i)] for i, s in unique.items() if str(i) in ids}
