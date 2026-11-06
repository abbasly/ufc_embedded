from datetime import date
from typing import Any

from ufc_embedded.fight_cards import parse_fight_card, result
from ufc_embedded.pickem_sync import (
    bout_id,
    card_bouts,
    card_sql,
    event_id,
    events_to_sync,
    fighter_id,
    locks_at,
    model_pick_sql,
    sql_text,
    sync_sql,
    with_recent,
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
    before = sync_sql([(CARD, card_bouts(CARD, parse_fight_card(BEFORE), KNOWN.get), True)])
    assert before.startswith("begin;") and before.endswith("commit;\n")
    assert "'2026-11-14T17:00:00Z'" in before  # noon in New York: before any start
    assert "e.scored_at is not null" in before  # cancelled bouts are removed only before scoring
    assert "score_event" not in before
    after = sync_sql([(CARD, card_bouts(CARD, parse_fight_card(AFTER), KNOWN.get), True)])
    assert "'win', 'josh-hokit', 'KO/TKO'" in after
    assert "select public.score_event('2026-11-14-ufc-334');" in after


def test_recent_events_keep_syncing_for_their_results() -> None:
    old = {"date": "2026-10-01", "name": "UFC 333", "fights": []}
    last_week = {"date": "2026-11-07", "name": "UFC Fight Night", "fights": []}
    cards = events_to_sync([CARD], [old, last_week, CARD], date(2026, 11, 10))
    assert [c["name"] for c in cards] == ["UFC Fight Night", "UFC 334: Gane vs. Hokit"]


def test_picks_lock_on_the_morning_of_fight_day_wherever_it_is() -> None:
    day = {"date": "2026-11-07"}
    # Noon local: 21:00 in Berlin for Las Vegas, where the prelims start at 23:00 Berlin time.
    assert locks_at({**day, "city": "Las Vegas"}) == "2026-11-07T20:00:00Z"
    assert locks_at({**day, "city": "New York City"}) == "2026-11-07T17:00:00Z"
    assert locks_at({**day, "city": "Abu Dhabi"}) == "2026-11-07T08:00:00Z"
    # Morning cards lock at 7 am local: the day before in UTC for Sydney.
    assert locks_at({**day, "city": "Sydney"}) == "2026-11-06T21:00:00Z"
    assert locks_at({**day, "city": None}) == "2026-11-07T08:00:00Z"  # unknown: as if UTC+4


def test_odds_already_in_the_database_are_kept_when_a_sync_has_none() -> None:
    sql = sync_sql([(CARD, card_bouts(CARD, parse_fight_card(AFTER), KNOWN.get), True)])
    assert "market_p_a = coalesce(" in sql and "bouts.market_p_a)" in sql


def test_a_bookmakers_list_never_rewrites_an_existing_card() -> None:
    # Wikipedia unreachable: the fallback may only fill in a card that has no bouts yet.
    sql = "\n".join(card_sql(CARD, card_bouts(CARD, [], KNOWN.get), from_wikipedia=False))
    assert (
        "where not exists (select 1 from public.bouts where event_id = '2026-11-14-ufc-334')" in sql
    )
    assert "delete from" not in sql and "position + 1000" not in sql and "score_event" not in sql


def test_events_from_the_database_are_synced_but_their_event_row_is_left_alone() -> None:
    cards = with_recent(
        [CARD],
        [
            {"date": "2026-11-07", "name": "UFC Fight Night: X vs. Y"},
            {"date": CARD["date"], "name": CARD["name"]},
        ],
    )
    assert [c["name"] for c in cards] == ["UFC Fight Night: X vs. Y", CARD["name"]]  # no duplicate
    recent = cards[0]
    assert card_sql(recent, [], from_wikipedia=True) == []  # nothing on Wikipedia: no change
    bouts = card_bouts(recent, parse_fight_card(AFTER), KNOWN.get)
    sql = "\n".join(card_sql(recent, bouts, from_wikipedia=True))
    assert "on conflict (id) do nothing" in sql  # its lock time stays as it was
    assert "select public.score_event('2026-11-07-ufc-fight-night');" in sql


def test_the_model_picks_like_a_player_only_while_bouts_are_open() -> None:
    model: dict[str, Any] = {"fighters": []}  # nobody known: no picks
    assert "public.picks" not in sync_sql(
        [(CARD, card_bouts(CARD, parse_fight_card(BEFORE), KNOWN.get), True)], model
    )
    sql = model_pick_sql("e:a:b", "a", "KO/TKO")
    assert "display_name = 'the_model'" in sql and "public.bout_is_open('e:a:b')" in sql
    assert "where public.bout_is_open(excluded.bout_id)" in sql  # never changed after the lock


def test_every_sync_leaves_a_line_in_the_change_log() -> None:
    sql = sync_sql([(CARD, card_bouts(CARD, parse_fight_card(AFTER), KNOWN.get), True)])
    assert "values ('sync', '1 cards, 4 bouts, 4 results');" in sql


def test_the_python_model_matches_the_website() -> None:
    # Same numbers as web/src/features/predictor/model.ts for the same data (checked against
    # it when this was written): the shipped predictor.json, one of this week's main events.
    import json

    from ufc_embedded.pickem_model import model_pick, win_prob
    from ufc_embedded.pickem_sync import PREDICTOR_JSON

    data = json.loads(PREDICTOR_JSON.read_text())
    fighters = {f["id"]: f for f in data["fighters"]}
    if "johnny-walker" not in fighters or "waldo-cortes-acosta" not in fighters:
        return  # a later data export without them
    p = win_prob(data["win_model"], fighters["johnny-walker"], fighters["waldo-cortes-acosta"])
    pick = model_pick(data, "johnny-walker", "waldo-cortes-acosta")
    assert pick is not None and pick[0] == ("johnny-walker" if p >= 0.5 else "waldo-cortes-acosta")
    assert (
        abs(
            win_prob(data["win_model"], fighters["waldo-cortes-acosta"], fighters["johnny-walker"])
            - (1 - p)
        )
        < 1e-12
    )
