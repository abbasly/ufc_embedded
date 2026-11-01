"""Current UFC champions and their (freely licensed) photos, from Wikipedia.

The fight dataset can't tell us this: its ``title_bout`` flag also marks Road to
UFC finals and interim fights, and it lags behind real events. So we read the
"Current champions" tables of Wikipedia's "List of UFC champions" instead.
Results are cached on disk so exports work offline; pass ``refresh=True`` to update.
"""

import json
import re
from datetime import date
from typing import TypedDict

from ufc_embedded.data import PROCESSED_DIR
from ufc_embedded.wikipedia import Photo, fetch_wiki_images, wiki_get

CHAMPIONS_PAGE = "List_of_UFC_champions"
CACHE = PROCESSED_DIR / "champions.json"


class Champion(TypedDict):
    division: str
    name: str
    since: str
    wiki_page: str
    image: Photo | None


# A table row in the wikitext looks like:
#   ! ...| [[#Heavyweight Championship|Heavyweight]]
#   | {{flagicon|FRA}} [[Ciryl Gane]]            (or [[Page (fighter)|Display name]])
#   | Sep 14, 2026
_ROW = re.compile(
    r"^!.*\|\s*\[\[[^|\]]*\|(?P<division>[^\]]+)\]\]\s*\n"
    r"\|.*?\[\[(?P<page>[^|\]]+)(?:\|(?P<name>[^\]]+))?\]\]\s*\n"
    r"\|\s*(?P<since>[^\n]+)",
    re.MULTILINE,
)


def parse_champions(wikitext: str) -> list[tuple[str, str, str, str]]:
    """(division, name, since, wiki page) for each row of the current champions tables."""
    men, _, women = wikitext.partition("===Women===")
    rows = []
    for prefix, text in [("", men), ("Women's ", women)]:
        for m in _ROW.finditer(text):
            page = m["page"].strip()
            rows.append(
                (
                    prefix + m["division"].strip(),
                    (m["name"] or page).strip(),
                    m["since"].strip(),
                    page,
                )
            )
    return rows


def fetch_current_champions() -> list[Champion]:
    sections = wiki_get({"action": "parse", "page": CHAMPIONS_PAGE, "prop": "sections"})
    index = next(
        s["index"] for s in sections["parse"]["sections"] if s["line"] == "Current champions"
    )
    wikitext = wiki_get(
        {"action": "parse", "page": CHAMPIONS_PAGE, "prop": "wikitext", "section": index}
    )["parse"]["wikitext"]["*"]

    rows = parse_champions(wikitext)
    if not rows:
        raise ValueError("no champions parsed; the Wikipedia table format probably changed")
    images = fetch_wiki_images([page for *_, page in rows])
    return [
        {"division": d, "name": n, "since": s, "wiki_page": p, "image": images.get(p)}
        for d, n, s, p in rows
    ]


def current_champions(refresh: bool = False) -> tuple[list[Champion], str]:
    """Current champions and the date they were fetched, using the on-disk cache if present."""
    if CACHE.exists() and not refresh:
        cached = json.loads(CACHE.read_text())
        return cached["champions"], cached["fetched"]
    champions, fetched = fetch_current_champions(), date.today().isoformat()
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps({"fetched": fetched, "champions": champions}, indent=1))
    return champions, fetched
