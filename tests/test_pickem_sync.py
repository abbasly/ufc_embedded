from datetime import date
from typing import Any

from ufc_embedded.fight_cards import parse_fight_card, result
from ufc_embedded.pickem_sync import (
    bout_id,
    card_bouts,
    event_id,
    events_to_sync,
    fighter_id,
    locks_at,
    sql_text,
    sync_sql,
)

CARD: dict[str, Any] = {
    "date": "2026-11-14",
    "name": "UFC 334: Gane vs. Hokit",
    "city": "New York City",
    "fights": [
        {
            "a": "josh-hokit",
            "b": "ciryl-gane",
            "a_name": "Josh Hokit",
            "b_name": "Ciryl Gane",
            "p_market": 0.4,
        },
        {
            "a": None,
            "b": "sean-o-malley",
            "a_name": "Jo O'Neil",
            "b_name": "Sean O'Malley",
            "p_market": None,
        },
    ],
}

# As on Wikipedia before the event (trimmed).
BEFORE = """==Fight card==
{{MMAevent}}
{{MMAevent card|Main card (Paramount+)}}
{{MMAevent bout|Heavyweight|[[Ciryl Gane]] (c)|vs.|[[Josh Hokit]]||||
For the [[UFC Heavyweight Championship]].}}
{{MMAevent bout
|Welterweight
|[[Stephen Thompson (fighter)|Stephen Thompson]]
|vs.
|Charles Radtke
|
|
|
|
}}
{{MMAevent card|Preliminary card (Paramount+)|header=no}}
{{MMAevent bout|Lightweight|[[Drew Dober]]|vs.|[[Chris Duncan (fighter)|Chris Duncan]]||||
}}
{{MMAevent card|Early preliminary card (Paramount+)|header=no}}
{{MMAevent bout|Women's Bantamweight|[[Macy Chiasson]]|vs.|[[Beatriz Mesquita]]||||
}}
{{MMAevent end|notes=yes}}
"""

# And after it: winners first, "def.", methods.
AFTER = (
    BEFORE.replace(
        "[[Ciryl Gane]] (c)|vs.|[[Josh Hokit]]||||",
        "[[Josh Hokit]]|def.|[[Ciryl Gane]] (c)|KO (punches)|2|3:12|",
    )
    .replace(
        "|vs.\n|Charles Radtke\n|\n",
        "|def.\n|Charles Radtke\n|Decision (split) (29–28, 28–29, 29–28)\n",
    )
    .replace(
        "[[Drew Dober]]|vs.|[[Chris Duncan (fighter)|Chris Duncan]]||",
        "[[Drew Dober]]|vs.|[[Chris Duncan (fighter)|Chris Duncan]]|No Contest (eye poke)|",
    )
    .replace("[[Macy Chiasson]]|vs.", "[[Macy Chiasson]]|def.")
    .replace("[[Beatriz Mesquita]]||||", "[[Beatriz Mesquita]]|Submission (armbar)|1|4:01|")
)

KNOWN = {
    "Ciryl Gane": "ciryl-gane",
    "Josh Hokit": "josh-hokit",
    "Stephen Thompson": "stephen-thompson",
}


def test_the_fight_card_comes_in_running_order_with_its_segments() -> None:
    bouts = parse_fight_card(BEFORE)
    assert [(b["a_name"], b["b_name"]) for b in bouts] == [
        ("Ciryl Gane", "Josh Hokit"),
        ("Stephen Thompson", "Charles Radtke"),
        ("Drew Dober", "Chris Duncan"),
        ("Macy Chiasson", "Beatriz Mesquita"),
    ]
    assert [b["segment"] for b in bouts] == ["main", "main", "prelims", "early"]
    assert [b["title"] for b in bouts] == [True, False, False, False]
    assert all(b["outcome"] is None for b in bouts)


def test_results_and_methods() -> None:
    bouts = parse_fight_card(AFTER)
    assert [(b["a_name"], b["outcome"], b["method"]) for b in bouts] == [
        ("Josh Hokit", "win", "KO/TKO"),
        ("Stephen Thompson", "win", "DEC"),
        ("Drew Dober", "nc", None),
        ("Macy Chiasson", "win", "SUB"),
    ]
    assert result("def.", "TKO (doctor stoppage)") == ("win", "KO/TKO")
    assert result("def.", "DQ (illegal knee)") == ("win", None)
    assert result("vs.", "Draw (majority)") == ("draw", None)


def test_wikipedia_card_with_the_bookmakers_odds_turned_to_match_the_corners() -> None:
    bouts = card_bouts(CARD, parse_fight_card(BEFORE), KNOWN.get)
    gane = bouts[0]
    assert (gane["a"], gane["b"], gane["p_market"]) == ("ciryl-gane", "josh-hokit", 0.6)
    assert bouts[2]["a"] == "drew-dober"  # not on the site: an id from the name
    assert bouts[3]["p_market"] is None  # no odds for this one


def test_without_a_wikipedia_card_the_bookmakers_list_is_used() -> None:
    bouts = card_bouts(CARD, [], KNOWN.get)
    assert [b["a"] for b in bouts] == ["josh-hokit", "jo-o-neil"]
    assert all(b["segment"] == "main" for b in bouts)


def test_ids_and_quoting() -> None:
    assert event_id(CARD) == "2026-11-14-ufc-334"
    assert event_id({"date": "2026-11-07", "name": None}) == "2026-11-07-ufc"
    assert fighter_id(CARD["fights"][1], "a") == "jo-o-neil"
    assert bout_id("e", "b", "a") == bout_id("e", "a", "b") == "e:a:b"
    assert sql_text("O'Malley") == "'O''Malley'"
    assert sql_text(None) == "null"


def test_one_transaction_scored_only_once_every_result_is_in() -> None:
    before = sync_sql([(CARD, card_bouts(CARD, parse_fight_card(BEFORE), KNOWN.get))])
    assert before.startswith("begin;") and before.endswith("commit;\n")
    assert "'2026-11-14T13:00:00Z'" in before  # 8 am in New York: before any start
    assert "e.scored_at is not null" in before  # cancelled bouts are removed only before scoring
    assert "score_event" not in before
    after = sync_sql([(CARD, card_bouts(CARD, parse_fight_card(AFTER), KNOWN.get))])
    assert "'win', 'josh-hokit', 'KO/TKO'" in after
    assert "select public.score_event('2026-11-14-ufc-334');" in after


def test_recent_events_keep_syncing_for_their_results() -> None:
    old = {"date": "2026-10-01", "name": "UFC 333", "fights": []}
    last_week = {"date": "2026-11-07", "name": "UFC Fight Night", "fights": []}
    cards = events_to_sync([CARD], [old, last_week, CARD], date(2026, 11, 10))
    assert [c["name"] for c in cards] == ["UFC Fight Night", "UFC 334: Gane vs. Hokit"]


def test_picks_lock_on_the_morning_of_fight_day_wherever_it_is() -> None:
    day = {"date": "2026-11-07"}
    assert locks_at({**day, "city": "Las Vegas"}) == "2026-11-07T16:00:00Z"
    assert locks_at({**day, "city": "Abu Dhabi"}) == "2026-11-07T04:00:00Z"
    assert locks_at({**day, "city": "Sydney"}) == "2026-11-06T22:00:00Z"  # the day before in UTC
    assert locks_at({**day, "city": None}) == "2026-11-07T04:00:00Z"  # unknown: early to be safe
