"""UFC fight cards from Wikipedia: the running order, the card segments (main card, prelims,
early prelims) and, once the fights have happened, the results.

Every UFC event page has a "Fight card" section built from ``{{MMAevent card|...}}`` headers
and ``{{MMAevent bout|weight|fighter 1|vs.|fighter 2|method|round|time|notes}}`` rows, main
event first. After a fight, the row reads ``|winner|def.|loser|KO (punches)|2|3:12|``;
draws and no contests keep ``vs.`` and say so in the method.
"""

import re
from typing import Literal, TypedDict

from ufc_embedded.upcoming import _plain

Segment = Literal["main", "prelims", "early"]
Method = Literal["KO/TKO", "SUB", "DEC"]
Outcome = Literal["win", "draw", "nc"]


class CardBout(TypedDict):
    segment: Segment
    weight: str
    a_name: str  # the winner, once there's a result
    b_name: str
    title: bool  # a championship fight
    outcome: Outcome | None  # None until the fight has happened
    method: Method | None  # for wins by KO/TKO, submission or decision (not DQ)


def templates(wikitext: str) -> list[list[str]]:
    """Every top-level ``{{...}}`` template, as its name and fields (split on the ``|`` that
    aren't inside links or nested templates)."""
    found: list[list[str]] = []
    depth, start = 0, 0
    i = 0
    while i < len(wikitext) - 1:
        pair = wikitext[i : i + 2]
        if pair == "{{":
            if depth == 0:
                start = i + 2
            depth += 1
            i += 2
        elif pair == "}}" and depth:
            depth -= 1
            if depth == 0:
                found.append(_fields(wikitext[start:i]))
            i += 2
        else:
            i += 1
    return found


def _fields(inner: str) -> list[str]:
    fields: list[str] = []
    current: list[str] = []
    depth = 0
    for i, ch in enumerate(inner):
        pair = inner[i : i + 2]
        if pair in ("[[", "{{"):
            depth += 1
        elif pair in ("]]", "}}") and depth:
            depth -= 1
        if ch == "|" and depth == 0:
            fields.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    fields.append("".join(current).strip())
    return fields


def _segment(header: str) -> Segment:
    header = header.lower()
    if "early" in header:
        return "early"
    return "prelims" if "prelim" in header else "main"


def _name(cell: str) -> str:
    """A fighter cell to a plain name: links unwrapped, "(c)" / "(ic)" champion marks dropped."""
    return re.sub(r"\s*\((?:c|ic)\)\s*$", "", _plain(cell)).strip()


def result(verb: str, method_cell: str) -> tuple[Outcome | None, Method | None]:
    """The outcome and method from a bout's "def."/"vs." cell and its method cell."""
    method = _plain(method_cell).lower()
    if verb.lower().startswith("def"):
        if method.startswith(("ko", "tko")):
            return "win", "KO/TKO"
        if "submission" in method:
            return "win", "SUB"
        if method.startswith("decision"):
            return "win", "DEC"
        return "win", None  # disqualification and the like
    if method.startswith("draw"):
        return "draw", None
    if method.startswith("no contest"):
        return "nc", None
    return None, None


def parse_fight_card(wikitext: str) -> list[CardBout]:
    """The bouts of an event page's fight card, in running order (main event first)."""
    bouts: list[CardBout] = []
    segment: Segment = "main"
    for name, *fields in templates(wikitext):
        kind = name.strip().lower()
        if kind == "mmaevent card":
            segment = _segment(fields[0] if fields else "")
        elif kind == "mmaevent bout":
            positional = [f for f in fields if not re.match(r"^\w+\s*=", f)] + [""] * 8
            weight, a, verb, b, method = positional[:5]
            notes = positional[7]
            if not _name(a) or not _name(b):
                continue
            outcome, how = result(verb, method)
            bouts.append(
                {
                    "segment": segment,
                    "weight": _plain(weight),
                    "a_name": _name(a),
                    "b_name": _name(b),
                    "title": "championship" in notes.lower(),
                    "outcome": outcome,
                    "method": how,
                }
            )
    return bouts


def fetch_fight_card(event_name: str) -> list[CardBout]:
    """An event's fight card from its Wikipedia page (empty if there's no page or card yet).
    Numbered events' pages are titled by the number alone ("UFC 334", not "UFC 334: Gane vs.
    Hokit"), so that's tried too."""
    from ufc_embedded.wikipedia import wiki_get

    titles = [event_name]
    if re.match(r"^UFC \d+:", event_name):
        titles.insert(0, event_name.split(":")[0])
    for title in titles:
        try:
            page = wiki_get({"action": "parse", "page": title, "prop": "wikitext", "redirects": 1})
            bouts = parse_fight_card(page["parse"]["wikitext"]["*"])
        except (OSError, KeyError):
            continue
        if bouts:
            return bouts
    return []
