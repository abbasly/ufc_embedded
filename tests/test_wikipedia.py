import json
from pathlib import Path

import pytest

from ufc_embedded import wikipedia


def test_manual_photo_fills_a_cached_miss(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cache = tmp_path / "cache.json"
    cache.write_text(json.dumps({"Known": None, "Other": None}))
    manual = tmp_path / "manual.json"
    photo = {"url": "https://example.org/a.jpg", "credit_url": "https://example.org/a"}
    manual.write_text(json.dumps({"Known": photo}))
    monkeypatch.setattr(wikipedia, "PHOTO_CACHE", cache)
    monkeypatch.setattr(wikipedia, "SEARCH_CACHE", tmp_path / "search.json")
    monkeypatch.setattr(wikipedia, "MANUAL_PHOTOS", manual)

    assert wikipedia.fighter_photos(["Known", "Other"]) == {"Known": photo}
