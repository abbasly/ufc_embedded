"""Upcoming UFC cards for Pick'em, as SQL for the accounts database (supabase/migrations).

Reads the cards the site already shows (``upcoming`` in web/public/data/predictor.json) and
writes SQL that adds or updates them in ``events`` and ``bouts``. It is safe to run again and
again: new bouts are added, changed ones updated, bouts dropped from a card (cancelled) deleted,
but only for events that haven't been scored; results and scores are never touched.

The data has each card's date but not its start time, so picks lock at ``LOCK_HOUR_UTC`` on
fight day: earlier than any usual UFC start, so no one picks a fight that has begun.

Run with ``uv run python -m ufc_embedded.pickem_sync > pickem.sql`` and run the file in the
Supabase SQL editor (or with psql and the database's connection string).
"""

import json
import sys
from pathlib import Path
from typing import Any

from ufc_embedded.data import PROJECT_ROOT, slugify

PREDICTOR_JSON = PROJECT_ROOT / "web" / "public" / "data" / "predictor.json"
LOCK_HOUR_UTC = 17


def sql_text(value: str | None) -> str:
    """A SQL string literal (or NULL)."""
    return "null" if value is None else "'" + value.replace("'", "''") + "'"


def sql_number(value: float | None) -> str:
    return "null" if value is None else repr(float(value))


def event_id(card: dict[str, Any]) -> str:
    """'2026-11-14-ufc-334': the date and the event's short name ("UFC 334", "UFC Fight Night")."""
    name = card.get("name")
    short = name.split(":")[0] if name else "ufc"
    return f"{card['date']}-{slugify(short)}"


def fighter_id(fight: dict[str, Any], side: str) -> str:
    """The fighter's public id, or one made from their name for fighters not on the site yet
    (UFC debutants)."""
    return str(fight[side] or slugify(fight[f"{side}_name"]))


def card_sql(card: dict[str, Any]) -> list[str]:
    """Statements that bring one card's event and bouts up to date."""
    eid = event_id(card)
    name = card.get("name") or f"UFC card, {card['date']}"
    locks_at = f"{card['date']}T{LOCK_HOUR_UTC:02d}:00:00Z"
    statements = [
        "insert into public.events (id, name, starts_on, locks_at) values "
        f"({sql_text(eid)}, {sql_text(name)}, {sql_text(card['date'])}, {sql_text(locks_at)})\n"
        "  on conflict (id) do update set name = excluded.name, starts_on = excluded.starts_on,"
        " locks_at = excluded.locks_at;",
        # Move existing bouts out of the way, so the running order can be rewritten freely.
        f"update public.bouts set position = position + 1000 where event_id = {sql_text(eid)};",
    ]
    ids = []
    for position, fight in enumerate(card["fights"], start=1):
        a, b = fighter_id(fight, "a"), fighter_id(fight, "b")
        bid = f"{eid}:{a}:{b}"
        ids.append(bid)
        statements.append(
            "insert into public.bouts (id, event_id, position, fighter_a, fighter_b,"
            " a_name, b_name, market_p_a) values "
            f"({sql_text(bid)}, {sql_text(eid)}, {position}, {sql_text(a)}, {sql_text(b)}, "
            f"{sql_text(fight['a_name'])}, {sql_text(fight['b_name'])}, "
            f"{sql_number(fight.get('p_market'))})\n"
            "  on conflict (id) do update set position = excluded.position,"
            " a_name = excluded.a_name, b_name = excluded.b_name,"
            " market_p_a = excluded.market_p_a;"
        )
    # Bouts no longer on the card (cancelled), unless the event has already been scored.
    statements.append(
        f"delete from public.bouts where event_id = {sql_text(eid)}"
        f" and id not in ({', '.join(sql_text(i) for i in ids)})"
        f" and not exists (select 1 from public.events e where e.id = {sql_text(eid)}"
        " and e.scored_at is not null);"
    )
    return statements


def sync_sql(cards: list[dict[str, Any]]) -> str:
    """One transaction that brings every upcoming card up to date."""
    body = [s for card in cards for s in card_sql(card)]
    return "begin;\n" + "\n".join(body) + "\ncommit;\n"


def main(path: Path = PREDICTOR_JSON) -> None:
    cards = json.loads(path.read_text())["upcoming"]
    sys.stdout.write(sync_sql(cards))
    print(f"-- {len(cards)} cards, {sum(len(c['fights']) for c in cards)} bouts", file=sys.stderr)


if __name__ == "__main__":
    main()
