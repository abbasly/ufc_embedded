from ufc_embedded.pickem_sync import event_id, fighter_id, sql_text, sync_sql

CARD = {
    "date": "2026-11-14",
    "name": "UFC 334: Gane vs. Hokit",
    "fights": [
        {
            "a": "ciryl-gane",
            "b": "josh-hokit",
            "a_name": "Ciryl Gane",
            "b_name": "Josh Hokit",
            "p_market": 0.6,
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


def test_event_ids_come_from_the_date_and_short_name() -> None:
    assert event_id(CARD) == "2026-11-14-ufc-334"
    assert event_id({"date": "2026-11-07", "name": None}) == "2026-11-07-ufc"


def test_debutants_get_an_id_from_their_name() -> None:
    assert fighter_id(CARD["fights"][1], "a") == "jo-o-neil"
    assert fighter_id(CARD["fights"][1], "b") == "sean-o-malley"


def test_names_are_quoted_safely_and_it_is_one_transaction() -> None:
    assert sql_text("O'Malley") == "'O''Malley'"
    assert sql_text(None) == "null"
    sql = sync_sql([CARD])
    assert sql.startswith("begin;") and sql.endswith("commit;\n")
    assert "'Sean O''Malley'" in sql
    assert "'2026-11-14T17:00:00Z'" in sql  # picks lock on fight day, before any start
    assert "e.scored_at is not null" in sql  # cancelled bouts are removed only before scoring
