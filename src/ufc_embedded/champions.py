"""Current UFC champions and their (freely licensed) photos.

The champions are curated by hand: the dataset's ``title_bout`` flag also marks
Road to UFC finals and interim title fights, so the latest "title fight" winner
per division is often wrong.
"""

import json
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from ufc_embedded.data import PROCESSED_DIR

# Undisputed champions at the end of the fight data (no interim belts).
CHAMPIONS_AS_OF = "2026-03-28"
CHAMPIONS = {
    "Flyweight": "Joshua Van",
    "Bantamweight": "Petr Yan",
    "Featherweight": "Alexander Volkanovski",
    "Lightweight": "Ilia Topuria",
    "Welterweight": "Islam Makhachev",
    "Middleweight": "Khamzat Chimaev",
    "Light Heavyweight": "Alex Pereira",
    "Heavyweight": "Tom Aspinall",
    "Women's Strawweight": "Mackenzie Dern",
    "Women's Flyweight": "Valentina Shevchenko",
    "Women's Bantamweight": "Kayla Harrison",
}

WIKI_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "ufc-embedded/0.1 (personal project)"
IMAGE_CACHE = PROCESSED_DIR / "wiki_images.json"


def fetch_wiki_images(names: list[str], thumb_px: int = 240) -> dict[str, dict[str, str]]:
    """Lead image of each fighter's English Wikipedia page, free licences only.

    Pages whose description doesn't mention MMA are skipped, to avoid photos of
    a namesake.
    """
    params = {
        "action": "query",
        "format": "json",
        "redirects": 1,
        "prop": "pageimages|description",
        "piprop": "thumbnail|name",
        "pithumbsize": thumb_px,
        "pilicense": "free",
        "titles": "|".join(names),
    }
    req = Request(f"{WIKI_API}?{urlencode(params)}", headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=30) as res:
        query: dict[str, Any] = json.load(res)["query"]

    # Map page titles back to the names we asked for.
    title_of = {n: n for n in names}
    for step in query.get("normalized", []) + query.get("redirects", []):
        for name, title in title_of.items():
            if title == step["from"]:
                title_of[name] = step["to"]

    pages = {p["title"]: p for p in query["pages"].values()}
    images = {}
    for name, title in title_of.items():
        page = pages.get(title, {})
        if "thumbnail" in page and "mixed martial artist" in page.get("description", ""):
            url = page["thumbnail"]["source"]
            # Free files live on Commons, except some uploaded to English Wikipedia directly.
            host = "en.wikipedia.org" if "/wikipedia/en/" in url else "commons.wikimedia.org"
            images[name] = {
                "url": url,
                "credit_url": f"https://{host}/wiki/File:{quote(page['pageimage'])}",
            }
    return images


def champion_images(cache: Path = IMAGE_CACHE, refresh: bool = False) -> dict[str, dict[str, str]]:
    """Champion photos, cached on disk so exports don't hit Wikipedia every time."""
    names = sorted(CHAMPIONS.values())
    if cache.exists() and not refresh:
        cached = json.loads(cache.read_text())
        images: dict[str, dict[str, str]] = cached["images"]
        if set(names) <= set(images) | set(cached["missing"]):
            return {n: images[n] for n in names if n in images}
    images = fetch_wiki_images(names)
    cache.parent.mkdir(parents=True, exist_ok=True)
    missing = [n for n in names if n not in images]
    cache.write_text(json.dumps({"images": images, "missing": missing}, indent=1))
    return images
