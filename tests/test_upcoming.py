from typing import Any

import pandas as pd

from ufc_embedded.upcoming import parse_scheduled, upcoming_cards

TODAY = pd.Timestamp("2026-11-02")
NAMES = ["tatiana-suarez", "virna-jandiroba", "amanda-nunes", "kayla-harrison", "jose-delano",
         "alexa-grasso", "natalia-silva"]  # fmt: skip
KNOWN = {n: n for n in NAMES}


def listing(
    f1: str, f2: str, date: str, added: str = "2026-11-01", o1: float = 1.5, o2: float = 2.6
) -> dict[str, object]:
    return {"fighter_1": f1, "fighter_2": f2, "odds_1": o1, "odds_2": o2,
            "event_date": pd.Timestamp(date), "added": pd.Timestamp(added, tz="UTC")}  # fmt: skip


def cards(rows: list[dict[str, object]]) -> list[dict[str, Any]]:
    return upcoming_cards(pd.DataFrame(rows), KNOWN, set(NAMES) - {"amanda-nunes"}, TODAY)


def test_dates_a_day_apart_are_one_card_and_names_map_to_ids() -> None:
    out = cards(
        [
            listing("Tatiana Suarez", "Virna Jandiroba", "2026-11-08"),
            listing("José Delano", "Someone New", "2026-11-07"),
            listing("Amanda Nunes", "Kayla Harrison", "2026-11-15"),
            listing("Alexa Grasso", "Natalia Silva", "2026-11-14"),
        ]
    )
    assert [c["date"] for c in out] == ["2026-11-07", "2026-11-14"]
    first = out[0]["fights"]
    assert len(first) == 2  # the debutant's bout is kept on a UFC card
    debut = next(f for f in first if f["b_name"] == "Someone New")
    assert debut["a"] == "jose-delano" and debut["b"] is None


def test_other_promotions_past_and_far_off_fights_are_dropped() -> None:
    out = cards(
        [
            listing("Marcin Held", "Valeriu Mircea", "2026-11-21"),  # KSW: nobody known
            listing("Tatiana Suarez", "Valeriu Mircea", "2026-11-22"),  # another promotion's card
            listing("Fresh Face", "Other Guy", "2026-11-22"),
            listing("Tatiana Suarez", "Virna Jandiroba", "2026-10-30"),  # already happened
            listing("Amanda Nunes", "Kayla Harrison", "2027-07-01"),  # a placeholder date
        ]
    )
    assert out == []


def test_cancelled_bouts_drop_out_with_old_snapshots() -> None:
    out = cards(
        [
            listing("Amanda Nunes", "Kayla Harrison", "2026-11-15", added="2026-10-01"),  # stale
            listing("Tatiana Suarez", "Virna Jandiroba", "2026-11-15", added="2026-11-01"),
        ]
    )
    assert [f["a_name"] for f in out[0]["fights"]] == ["Tatiana Suarez"]


def test_market_probability_is_vig_free_and_follows_the_corner_order() -> None:
    # Listed as Virna first: 2.6 vs 1.5 -> P(Virna) = 0.366; corners sorted by name put
    # Tatiana in A, so p_market is P(Tatiana) = 0.634.
    out = cards([listing("Virna Jandiroba", "Tatiana Suarez", "2026-11-08", o1=2.6, o2=1.5)])
    fight = out[0]["fights"][0]
    assert fight["a_name"] == "Tatiana Suarez"
    assert abs(fight["p_market"] - 0.634) < 0.001


def test_former_fighters_are_named_but_rumour_lists_are_dropped() -> None:
    out = cards(
        [
            # Nunes hasn't fought in years (not current) but is still recognised.
            listing("Amanda Nunes", "Kayla Harrison", "2026-11-15"),
            listing("Tatiana Suarez", "Virna Jandiroba", "2026-11-15"),
            # Placeholder date: Harrison "booked" against two opponents.
            listing("Tatiana Suarez", "Kayla Harrison", "2026-12-31"),
            listing("Jose Delano", "Kayla Harrison", "2026-12-31"),
        ]
    )
    assert [c["date"] for c in out] == ["2026-11-15"]
    nunes = next(f for f in out[0]["fights"] if f["a_name"] == "Amanda Nunes")
    assert nunes["a"] == "amanda-nunes"


def test_spelling_variants_match_on_surname_and_first_name_start() -> None:
    known = {"sergei-pavlovich": "sergei-pavlovich", "alex-pereira": "alex-pereira"}
    rows = [listing("Alex Pereira", "Sergey Pavlovich", "2026-12-13")]
    out = upcoming_cards(pd.DataFrame(rows), known, set(known.values()), TODAY)
    assert out[0]["fights"][0]["b"] == "sergei-pavlovich"


def test_a_card_already_fought_is_not_upcoming_even_if_dated_a_day_late() -> None:
    rows = [listing("Tatiana Suarez", "Virna Jandiroba", "2026-11-08")]
    fought = pd.Timestamp("2026-11-07")
    assert upcoming_cards(pd.DataFrame(rows), KNOWN, set(NAMES), TODAY, last_fought=fought) == []
    # A card the following weekend is still upcoming.
    later = [listing("Tatiana Suarez", "Virna Jandiroba", "2026-11-14")]
    assert upcoming_cards(pd.DataFrame(later), KNOWN, set(NAMES), TODAY, last_fought=fought)


WIKITEXT = """==Scheduled events==
{| class="sortable wikitable"
! Event
! Date
|-
|[[UFC 334|UFC 334: Nunes vs. Harrison]]
|{{dts|2026|Nov|14}}
|[[Madison Square Garden]]
|[[New York City]], [[New York (state)|New York]], U.S.
|<ref name="x"/>
|-
|[[UFC Fight Night: Suarez vs. Jandiroba]]
|{{dts|2026|Nov|7}}
|rowspan="1" |[[UFC Apex|Meta Apex]]
|rowspan="1" |[[Las Vegas]], [[Nevada]], U.S.
|<ref>{{Cite web|url=https://example.com|title=x}}</ref>
|}"""


def test_parses_wikipedia_scheduled_events() -> None:
    assert parse_scheduled(WIKITEXT) == [
        {"date": "2026-11-14", "name": "UFC 334: Nunes vs. Harrison", "city": "New York City"},
        {
            "date": "2026-11-07",
            "name": "UFC Fight Night: Suarez vs. Jandiroba",
            "city": "Las Vegas",
        },
    ]


def test_cards_get_the_event_name_official_date_and_main_event_first() -> None:
    rows = [
        listing("Alexa Grasso", "Natalia Silva", "2026-11-15"),
        listing("Amanda Nunes", "Kayla Harrison", "2026-11-15"),
    ]
    out = upcoming_cards(pd.DataFrame(rows), KNOWN, set(NAMES), TODAY, parse_scheduled(WIKITEXT))
    card = out[0]
    assert card["date"] == "2026-11-14" and card["name"] == "UFC 334: Nunes vs. Harrison"
    assert card["city"] == "New York City"
    assert card["fights"][0]["a_name"] == "Amanda Nunes" and card["fights"][0]["main"]
    assert not card["fights"][1]["main"]
