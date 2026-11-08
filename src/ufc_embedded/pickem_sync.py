"""Pick'em cards and results, as SQL for the accounts database (supabase/migrations).

Which events: the upcoming cards the site already shows (``upcoming`` in
web/public/data/predictor.json), plus every event synced in the last ``KEEP_DAYS`` days (kept
in ``SYNCED_EVENTS``), so results still come in after a card leaves the upcoming list.

What's on them: each event's Wikipedia page (``fight_cards``) gives the full card in running
order, split into main card, prelims and early prelims, and, once fought, the results. Cards
without a page yet fall back to the bookmakers' list from predictor.json. Bookmakers' odds
come from predictor.json either way.

The SQL is one transaction and safe to run again and again: new bouts are added, changed ones
updated, cancelled ones deleted (only before the event is scored), results written as they
come in; points are tallied after every main-card result (``tally_event``) and an event whose
every bout has a result is scored (``score_event``).

The data has each card's date and city but not its start time, so picks lock at
noon local time on fight day (from the city's rough UTC offset), before the earliest prelims
at American and European events (Las Vegas: 21:00 in Berlin, prelims from 23:00). Cards in East
Asia and Oceania start in the local morning, so they lock at ``EARLY_LOCK_HOUR`` instead.

Run from the project root: ``uv run python -m ufc_embedded.pickem_sync | pbcopy``, then paste
into the Supabase SQL editor and run it.
"""

import json
import sys
from collections.abc import Callable
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, TypedDict

from ufc_embedded.data import PROCESSED_DIR, PROJECT_ROOT, slugify
from ufc_embedded.fight_cards import CardBout, fetch_fight_card
from ufc_embedded.pickem_model import MODEL_PLAYER, fallback_pick, model_pick
from ufc_embedded.upcoming import _matcher, scheduled_events

PREDICTOR_JSON = PROJECT_ROOT / "web" / "public" / "data" / "predictor.json"
SYNCED_EVENTS = PROCESSED_DIR / "pickem_events.json"
LOCK_LOCAL_HOUR = 12
EARLY_LOCK_HOUR = 7  # East Asia and Oceania (UTC+8 and later): those cards start in the morning
# Rough UTC offsets of UFC host cities (daylight saving ignored: the lock has hours to spare).
# A city not listed locks as if it were UTC+4, which is early enough for anywhere but Oceania
# and East Asia (listed): for an unlisted US city that's Friday evening, early but safe.
CITY_UTC_OFFSET = {
    **dict.fromkeys(
        [
            "Las Vegas",
            "Enterprise",
            "Paradise",
            "Los Angeles",
            "Inglewood",
            "Anaheim",
            "San Diego",
            "San Francisco",
            "San Jose",
            "Sacramento",
            "Seattle",
            "Portland",
        ],
        -8,
    ),
    **dict.fromkeys(["Denver", "Salt Lake City", "Phoenix", "Glendale", "Edmonton", "Calgary"], -7),
    **dict.fromkeys(
        [
            "Dallas",
            "Houston",
            "Austin",
            "San Antonio",
            "Chicago",
            "Nashville",
            "Kansas City",
            "St. Louis",
            "Milwaukee",
            "Minneapolis",
            "New Orleans",
            "Oklahoma City",
            "Mexico City",
            "Winnipeg",
            "Omaha",
        ],
        -6,
    ),
    **dict.fromkeys(
        [
            "New York City",
            "New York",
            "Newark",
            "Brooklyn",
            "Boston",
            "Philadelphia",
            "Atlanta",
            "Miami",
            "Orlando",
            "Tampa",
            "Jacksonville",
            "Charlotte",
            "Washington, D.C.",
            "Baltimore",
            "Detroit",
            "Cleveland",
            "Columbus",
            "Pittsburgh",
            "Buffalo",
            "Toronto",
            "Montreal",
            "Ottawa",
            "Uncasville",
            "Atlantic City",
            "Louisville",
        ],
        -5,
    ),
    **dict.fromkeys(["Rio de Janeiro", "São Paulo", "Sao Paulo", "Belém", "Brasília"], -3),
    **dict.fromkeys(["London", "Manchester", "Liverpool", "Glasgow", "Dublin", "Lisbon"], 0),
    **dict.fromkeys(
        [
            "Paris",
            "Hamburg",
            "Berlin",
            "Prague",
            "Stockholm",
            "Copenhagen",
            "Amsterdam",
            "Rotterdam",
            "Kraków",
            "Gdańsk",
            "Belgrade",
            "Zagreb",
            "Madrid",
            "Milan",
        ],
        1,
    ),
    **dict.fromkeys(["Riyadh", "Al Rayyan", "Doha", "Kuwait City", "Moscow", "Kazan"], 3),
    **dict.fromkeys(["Abu Dhabi", "Dubai", "Baku"], 4),
    **dict.fromkeys(["Macau", "Shanghai", "Beijing", "Singapore", "Perth", "Manila"], 8),
    **dict.fromkeys(["Tokyo", "Saitama", "Seoul", "Busan"], 9),
    **dict.fromkeys(["Brisbane", "Sydney", "Melbourne", "Adelaide"], 10),
    **dict.fromkeys(["Auckland"], 12),
}
DEFAULT_UTC_OFFSET = 4
KEEP_DAYS = 14  # keep syncing an event this long after it, for its results
SCHEDULED_DAYS = 35  # events Wikipedia lists as scheduled this far ahead join Pick'em


class Bout(TypedDict):
    a: str
    b: str
    a_name: str
    b_name: str
    p_market: float | None  # bookmakers' P(a wins)
    segment: str
    title: bool
    outcome: str | None
    winner: str | None
    method: str | None


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


def locks_at(card: dict[str, Any]) -> str:
    """When picks close, in UTC: noon local time on fight day (7 am in East Asia and Oceania)."""
    offset = CITY_UTC_OFFSET.get(card.get("city") or "", DEFAULT_UTC_OFFSET)
    hour = EARLY_LOCK_HOUR if offset >= 8 else LOCK_LOCAL_HOUR
    local = datetime.fromisoformat(f"{card['date']}T{hour:02d}:00:00")
    return (local - timedelta(hours=offset)).strftime("%Y-%m-%dT%H:%M:%SZ")


def bout_id(eid: str, a: str, b: str) -> str:
    """The same id whichever corner each fighter is listed in."""
    first, second = sorted((a, b))
    return f"{eid}:{first}:{second}"


def card_bouts(
    card: dict[str, Any], wiki: list[CardBout], lookup: Callable[[str], str | None]
) -> list[Bout]:
    """A card's bouts in running order: Wikipedia's card where there is one, else the
    bookmakers' list; with the bookmakers' odds wherever they have the bout."""
    market: dict[frozenset[str], tuple[str, float | None]] = {}
    for fight in card.get("fights", []):
        a, b = fighter_id(fight, "a"), fighter_id(fight, "b")
        market[frozenset((a, b))] = (a, fight.get("p_market"))

    if not wiki:
        return [
            {
                "a": fighter_id(f, "a"),
                "b": fighter_id(f, "b"),
                "a_name": f["a_name"],
                "b_name": f["b_name"],
                "p_market": f.get("p_market"),
                "segment": "main",
                "title": False,
                "outcome": None,
                "winner": None,
                "method": None,
            }
            for f in card.get("fights", [])
        ]

    bouts: list[Bout] = []
    for w in wiki:
        a = lookup(w["a_name"]) or slugify(w["a_name"])
        b = lookup(w["b_name"]) or slugify(w["b_name"])
        listed_a, p = market.get(frozenset((a, b)), (a, None))
        if p is not None and listed_a != a:
            p = round(1 - p, 3)
        bouts.append(
            {
                "a": a,
                "b": b,
                "a_name": w["a_name"],
                "b_name": w["b_name"],
                "p_market": p,
                "segment": w["segment"],
                "title": w["title"],
                "outcome": w["outcome"],
                "winner": a if w["outcome"] == "win" else None,  # Wikipedia lists winners first
                "method": w["method"],
            }
        )
    return bouts


def card_sql(card: dict[str, Any], bouts: list[Bout], from_wikipedia: bool = True) -> list[str]:
    """Statements that bring one card's event, bouts and results up to date.

    Only Wikipedia's card is trusted to rewrite a card (order, segments, results, cancelled
    bouts). The bookmakers' list (``from_wikipedia=False``: no page yet, or Wikipedia couldn't be
    reached) only fills in a card that has no bouts yet, so a failed fetch never touches one.
    """
    eid = event_id(card)
    if not bouts:
        return []
    if not from_wikipedia:
        return _first_listing_sql(card, eid, bouts)
    name = card.get("name") or f"UFC card, {card['date']}"
    # Cards known only from the database (``existing``) keep their event row as it is: there's no
    # city to work the lock time out from.
    event_sql = (
        "insert into public.events (id, name, starts_on, locks_at) values "
        f"({sql_text(eid)}, {sql_text(name)}, {sql_text(card['date'])}, "
        f"{sql_text(locks_at(card))})\n"
        + (
            "  on conflict (id) do nothing;"
            if card.get("existing")
            else "  on conflict (id) do update set name = excluded.name,"
            " starts_on = excluded.starts_on, locks_at = excluded.locks_at;"
        )
    )
    statements = [
        event_sql,
        # Move existing bouts out of the way, so the running order can be rewritten freely.
        f"update public.bouts set position = position + 1000 where event_id = {sql_text(eid)};",
    ]
    ids = []
    for bout in bouts:
        bid = bout_id(eid, bout["a"], bout["b"])
        if bid in ids:
            continue
        ids.append(bid)
        # A bout keeps the corners it was first listed with (Wikipedia moves the winner first
        # after the fight), so the odds and names are flipped to match when needed.
        statements.append(
            "insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name,"
            " b_name, market_p_a, segment, title, outcome, winner, method) values "
            f"({sql_text(bid)}, {sql_text(eid)}, {len(ids)}, {sql_text(bout['a'])}, "
            f"{sql_text(bout['b'])}, {sql_text(bout['a_name'])}, {sql_text(bout['b_name'])}, "
            f"{sql_number(bout['p_market'])}, {sql_text(bout['segment'])}, "
            f"{'true' if bout['title'] else 'false'}, {sql_text(bout['outcome'])}, "
            f"{sql_text(bout['winner'])}, {sql_text(bout['method'])})\n"
            "  on conflict (id) do update set position = excluded.position,"
            " segment = excluded.segment, title = excluded.title,"
            " a_name = case when bouts.fighter_a = excluded.fighter_a"
            " then excluded.a_name else excluded.b_name end,"
            " b_name = case when bouts.fighter_a = excluded.fighter_a"
            " then excluded.b_name else excluded.a_name end,"
            # Keep the odds we have when this sync has none (e.g. the card left the bookmakers'
            # listings after the fight): the underdog bonus depends on them.
            " market_p_a = coalesce(case when bouts.fighter_a = excluded.fighter_a"
            " then excluded.market_p_a else 1 - excluded.market_p_a end, bouts.market_p_a),"
            " outcome = excluded.outcome, winner = excluded.winner, method = excluded.method;"
        )
    # Bouts no longer on the card (cancelled), unless the event has already been scored.
    statements.append(
        f"delete from public.bouts where event_id = {sql_text(eid)}"
        f" and id not in ({', '.join(sql_text(i) for i in ids)})"
        f" and not exists (select 1 from public.events e where e.id = {sql_text(eid)}"
        " and e.scored_at is not null);"
    )
    if bouts and all(b["outcome"] for b in bouts):
        statements.append(f"select public.score_event({sql_text(eid)});")
    elif any(b["outcome"] and b["segment"] == "main" for b in bouts):
        # Mid-card: points so far, so the standings move fight by fight. Scoring proper (the
        # podium, the results emails) waits for the last result.
        statements.append(f"select public.tally_event({sql_text(eid)});")
    return statements


def _first_listing_sql(card: dict[str, Any], eid: str, bouts: list[Bout]) -> list[str]:
    """A card from the bookmakers' list: the event and its bouts, only if it has none yet."""
    name = card.get("name") or f"UFC card, {card['date']}"
    rows = []
    ids: list[str] = []
    for bout in bouts:
        bid = bout_id(eid, bout["a"], bout["b"])
        if bid in ids:
            continue
        ids.append(bid)
        rows.append(
            f"({sql_text(bid)}, {sql_text(eid)}, {len(ids)}, {sql_text(bout['a'])}, "
            f"{sql_text(bout['b'])}, {sql_text(bout['a_name'])}, {sql_text(bout['b_name'])}, "
            f"{sql_number(bout['p_market'])}::real)"
        )
    return [
        "insert into public.events (id, name, starts_on, locks_at) values "
        f"({sql_text(eid)}, {sql_text(name)}, {sql_text(card['date'])}, "
        f"{sql_text(locks_at(card))})\n"
        "  on conflict (id) do update set name = excluded.name, starts_on = excluded.starts_on,"
        " locks_at = excluded.locks_at;",
        "insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name, b_name,"
        " market_p_a)\n  select * from (values " + ", ".join(rows) + ") as v\n"
        f"  where not exists (select 1 from public.bouts where event_id = {sql_text(eid)});",
    ]


def model_pick_sql(bid: str, winner: str, method: str) -> str:
    """The model's pick on a bout, made (or updated) only while the bout is open, and only if
    its account exists (see MODEL_PLAYER)."""
    return (
        "insert into public.picks (user_id, bout_id, winner, method)\n"
        f"  select p.id, {sql_text(bid)}, {sql_text(winner)}, {sql_text(method)}"
        f" from public.profiles p where p.display_name = {sql_text(MODEL_PLAYER)}"
        f" and public.bout_is_open({sql_text(bid)})\n"
        "  on conflict (user_id, bout_id) do update set winner = excluded.winner,"
        " method = excluded.method where public.bout_is_open(excluded.bout_id);"
    )


def card_rarity(fighter: dict[str, Any]) -> str:
    """How rare a fighter's card is in packs: champions, the top 5 (rank 0 is the champion),
    anyone else ranked, everyone else."""
    if fighter.get("champion"):
        return "legendary"
    rank = fighter.get("rank")
    if rank is None:
        return "common"
    return "epic" if rank <= 5 else "rare"


def card_pool_sql(fighters: list[dict[str, Any]]) -> list[str]:
    """Statements that make the pool packs draw from match the predictor's fighters. Only rows
    that changed are written, as this runs with every sync."""
    if not fighters:
        return []
    rows = ", ".join(
        f"({sql_text(f['id'])}, {sql_text(f['name'])}, {sql_text(card_rarity(f))})"
        for f in fighters
    )
    ids = ", ".join(sql_text(f["id"]) for f in fighters)
    return [
        f"insert into public.card_pool (fighter_id, name, rarity) values {rows} "
        "on conflict (fighter_id) do update set name = excluded.name, rarity = excluded.rarity "
        "where (public.card_pool.name, public.card_pool.rarity) "
        "is distinct from (excluded.name, excluded.rarity);",
        f"delete from public.card_pool where fighter_id not in ({ids});",
    ]


def sync_sql(
    cards: list[tuple[dict[str, Any], list[Bout], bool]], model: dict[str, Any] | None = None
) -> str:
    """One transaction that brings every card up to date: (card, bouts, from Wikipedia). With
    the predictor's ``model`` data, the model's account picks too. Ends with a line in the
    change log (pickem_log)."""
    body = [s for card, bouts, from_wiki in cards for s in card_sql(card, bouts, from_wiki)]
    if model:
        for card, bouts, from_wiki in cards:
            if not from_wiki:
                continue
            for bout in bouts:
                pick = model_pick(model, bout["a"], bout["b"]) or fallback_pick(
                    model, bout["a"], bout["b"], bout["p_market"]
                )
                if pick and not bout["outcome"]:
                    body.append(
                        model_pick_sql(bout_id(event_id(card), bout["a"], bout["b"]), *pick[:2])
                    )
    if model:
        body.extend(card_pool_sql(model.get("fighters", [])))
    n_bouts = sum(len(bouts) for _, bouts, _ in cards)
    n_results = sum(1 for _, bouts, _ in cards for b in bouts if b["outcome"])
    summary = f"{len(cards)} cards, {n_bouts} bouts, {n_results} results"
    body.append(
        f"insert into public.pickem_log (kind, detail) values ('sync', {sql_text(summary)});"
    )
    return "begin;\n" + "\n".join(body) + "\ncommit;\n"


def events_to_sync(
    upcoming: list[dict[str, Any]], synced: list[dict[str, Any]], today: date
) -> list[dict[str, Any]]:
    """The upcoming cards, plus recently synced ones that have left the upcoming list."""
    current = {event_id(c) for c in upcoming}
    recent = [
        c
        for c in synced
        if event_id(c) not in current
        and date.fromisoformat(c["date"]) >= today - timedelta(days=KEEP_DAYS)
    ]
    return recent + upcoming


def with_scheduled(
    cards: list[dict[str, Any]],
    scheduled: list[dict[str, Any]],
    today: date,
    horizon_days: int = SCHEDULED_DAYS,
) -> list[dict[str, Any]]:
    """Add UFC events Wikipedia lists as scheduled within ``horizon_days`` that the upcoming
    list doesn't have yet (no bookmakers' listing, or the site's data not refreshed since):
    their cards come from their Wikipedia pages; the odds follow once predictor.json has them."""
    have = {event_id(c) for c in cards}
    extra = [
        {"date": e["date"], "name": e["name"], "city": e.get("city"), "fights": []}
        for e in scheduled
        if today <= date.fromisoformat(e["date"]) <= today + timedelta(days=horizon_days)
        and event_id(e) not in have
    ]
    return cards + extra


def with_recent(cards: list[dict[str, Any]], recent: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Add events the database knows but the upcoming list doesn't (fought, not scored yet):
    ``recent`` is ``[{"date", "name"}]``, e.g. straight from the events table."""
    have = {event_id(c) for c in cards}
    extra = [
        {"date": r["date"], "name": r["name"], "fights": [], "existing": True}
        for r in recent
        if event_id(r) not in have
    ]
    return extra + cards


def main(
    path: Path = PREDICTOR_JSON,
    fetch: Callable[[str], list[CardBout]] = fetch_fight_card,
    recent: Path | None = None,
    scheduled: bool = True,
) -> None:
    data = json.loads(path.read_text())
    synced = json.loads(SYNCED_EVENTS.read_text()) if SYNCED_EVENTS.exists() else []
    cards = events_to_sync(data["upcoming"], synced, date.today())
    if scheduled:
        cards = with_scheduled(cards, [dict(e) for e in scheduled_events()], date.today())
    if recent:
        cards = with_recent(cards, json.loads(recent.read_text()) or [])

    names = [slugify(f["name"]) for f in data["fighters"]]
    known = {
        s: f["id"] for s, f in zip(names, data["fighters"], strict=True) if names.count(s) == 1
    }
    lookup = _matcher(known)

    out = []
    for card in cards:
        wiki = fetch(card["name"]) if card.get("name") else []
        bouts = card_bouts(card, wiki, lookup)
        out.append((card, bouts, bool(wiki)))
        done = sum(1 for b in bouts if b["outcome"])
        source = "Wikipedia" if wiki else "bookmakers"
        print(
            f"-- {card.get('name')}: {len(bouts)} bouts ({source}), {done} results", file=sys.stderr
        )
    sys.stdout.write(sync_sql(out, data))

    SYNCED_EVENTS.parent.mkdir(parents=True, exist_ok=True)
    SYNCED_EVENTS.write_text(json.dumps([c for c, _, _ in out if not c.get("existing")], indent=1))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pick'em cards and results as SQL.")
    parser.add_argument(
        "--recent",
        type=Path,
        help='JSON list of {"date", "name"}: unscored events from the database, kept in sync too',
    )
    main(recent=parser.parse_args().recent)
