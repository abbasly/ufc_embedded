"""Small client for the English Wikipedia API: freely licensed fighter photos.

Results are cached on disk so exports work offline; pass ``refresh=True`` to update.
"""

import json
import time
from typing import Any, TypedDict
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from ufc_embedded.data import PROCESSED_DIR

WIKI_API = "https://en.wikipedia.org/w/api.php"
# Wikimedia's API etiquette: identify the client with a contact URL, go slow, back off on 429.
USER_AGENT = "ufc-embedded/0.1 (https://github.com/abbasly/ufc_embedded)"
PAUSE_S = 1.0
PHOTO_CACHE = PROCESSED_DIR / "fighter_photos.json"
BATCH = 50  # max titles per API request

# Accept a page only if its short description says it's a fighter, so a namesake's
# photo (another "Bruno Silva") doesn't end up on the map.
FIGHTER_WORDS = ("mixed martial art", "mma", "kickboxer")
# Tried in order for names whose plain page is missing or about someone else.
DISAMBIGUATIONS = ("", " (fighter)", " (mixed martial artist)")


class Photo(TypedDict):
    url: str
    credit_url: str  # licence / attribution page


def wiki_get(params: dict[str, Any], retries: int = 5) -> dict[str, Any]:
    req = Request(
        f"{WIKI_API}?{urlencode({'format': 'json', **params})}", headers={"User-Agent": USER_AGENT}
    )
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=30) as res:
                result: dict[str, Any] = json.load(res)
            time.sleep(PAUSE_S)
            return result
        except HTTPError as e:
            if e.code != 429 or attempt == retries - 1:
                raise
            time.sleep(float(e.headers.get("Retry-After") or 2 ** (attempt + 2)))
    raise RuntimeError("unreachable")


def fetch_wiki_images(
    pages: list[str], fighters_only: bool = False, thumb_px: int = 240
) -> dict[str, Photo]:
    """Lead image per Wikipedia page title, free licences only (``pilicense=free``)."""
    images: dict[str, Photo] = {}
    for start in range(0, len(pages), BATCH):
        batch = pages[start : start + BATCH]
        query = wiki_get(
            {
                "action": "query",
                "redirects": 1,
                "prop": "pageimages|description",
                "piprop": "thumbnail|name",
                "pithumbsize": thumb_px,
                "pilicense": "free",
                "titles": "|".join(batch),
            }
        )["query"]

        # Map the titles we asked for to the titles Wikipedia answered with.
        title_of = {p: p for p in batch}
        for step in query.get("normalized", []) + query.get("redirects", []):
            for asked, title in title_of.items():
                if title == step["from"]:
                    title_of[asked] = step["to"]

        by_title = {p["title"]: p for p in query["pages"].values()}
        for asked, title in title_of.items():
            page = by_title.get(title, {})
            description = page.get("description", "").lower()
            if "thumbnail" not in page:
                continue
            if fighters_only and not any(w in description for w in FIGHTER_WORDS):
                continue
            url = page["thumbnail"]["source"].split("?")[0]  # drop tracking parameters
            # Free files live on Commons, except some uploaded to English Wikipedia directly.
            host = "en.wikipedia.org" if "/wikipedia/en/" in url else "commons.wikimedia.org"
            images[asked] = {
                "url": url,
                "credit_url": f"https://{host}/wiki/File:{quote(page['pageimage'])}",
            }
    return images


def fetch_fighter_photos(names: list[str]) -> dict[str, Photo]:
    """Photos for fighter names, trying disambiguated page titles for the misses."""
    photos: dict[str, Photo] = {}
    for suffix in DISAMBIGUATIONS:
        missing = [n for n in names if n not in photos]
        found = fetch_wiki_images([n + suffix for n in missing], fighters_only=True)
        photos |= {n: found[n + suffix] for n in missing if n + suffix in found}
    return photos


def fighter_photos(names: list[str], refresh: bool = False) -> dict[str, Photo]:
    """Cached fighter photos; only names not seen before are looked up."""
    cache: dict[str, Photo | None] = {}
    if PHOTO_CACHE.exists() and not refresh:
        cache = json.loads(PHOTO_CACHE.read_text())
    new = sorted(set(names) - set(cache))
    if new:
        found = fetch_fighter_photos(new)
        cache |= {n: found.get(n) for n in new}  # None = looked up, no free photo
        PHOTO_CACHE.parent.mkdir(parents=True, exist_ok=True)
        PHOTO_CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False))
    return {n: photo for n in names if (photo := cache.get(n)) is not None}
