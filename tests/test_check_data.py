from typing import Any

from ufc_embedded.check_data import problems


def test_a_normal_refresh_passes() -> None:
    old: dict[str, Any] = {"fighters": [1] * 1000, "fights": 8800, "fights_until": "2026-10-31"}
    new: dict[str, Any] = {"fighters": [1] * 990, "fights": 8814, "fights_until": "2026-11-07"}
    assert problems("f.json", old, new) == []


def test_a_cut_short_or_stale_dataset_is_refused() -> None:
    old: dict[str, Any] = {"fighters": [1] * 1000, "fights": 8800, "fights_until": "2026-10-31"}
    assert "fighters fell" in problems("f.json", old, {**old, "fighters": [1] * 500})[0]
    assert "fights fell" in problems("f.json", old, {**old, "fights": 4000})[0]
    assert "back in time" in problems("f.json", old, {**old, "fights_until": "2026-09-01"})[0]
    assert problems("f.json", old, {}) != []  # a file missing its contents altogether
