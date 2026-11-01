"""Current UFC champions, from the official rankings (where the champion is rank 0)."""

from typing import TypedDict

import pandas as pd

from ufc_embedded.data import slugify


class Champion(TypedDict):
    division: str
    name: str
    fighter: str | None  # UFCStats fighter id, None if the name matches nobody


def _ids_by_slug(profiles: pd.DataFrame) -> dict[str, str]:
    """Name slug -> fighter id. Rankings only have names; for namesakes the first id wins."""
    id_of: dict[str, str] = {}
    for i, name in profiles["name"].items():
        id_of.setdefault(slugify(str(name)), str(i))
    return id_of


def current_ranks(rankings: pd.DataFrame, profiles: pd.DataFrame) -> dict[str, int]:
    """Fighter id -> best current divisional rank (0 = champion)."""
    id_of = _ids_by_slug(profiles)
    ranks: dict[str, int] = {}
    for name, rank in zip(rankings["name"], rankings["rank"], strict=True):
        if (fid := id_of.get(slugify(str(name)))) is not None:
            ranks[fid] = min(int(rank), ranks.get(fid, int(rank)))
    return ranks


def current_champions(rankings: pd.DataFrame, profiles: pd.DataFrame) -> list[Champion]:
    """One champion per division, matched to fighter ids by name slug."""
    id_of = _ids_by_slug(profiles)
    champs = rankings[rankings["rank"] == 0]
    return [
        {"division": str(d), "name": str(n), "fighter": id_of.get(slugify(str(n)))}
        for d, n in zip(champs["division"], champs["name"], strict=True)
    ]
