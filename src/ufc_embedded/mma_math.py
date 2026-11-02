"""MMA math: the win graph (winner -> loser) and the cycles that break it.

"A beat B, B beat C, so A beats C" falls apart as soon as C has beaten A.
We find those loops and rank them by how notable everyone in them is.
"""

from collections.abc import Iterable
from typing import Any

import networkx as nx
import numpy as np
import pandas as pd

from ufc_embedded.champions import Champion
from ufc_embedded.wikipedia import Photo

MIN_CYCLE = 3
MAX_CYCLE = 5
TOP_PER_LENGTH = 40


def win_edges(fights: pd.DataFrame) -> pd.DataFrame:
    """One row per decisive fight (no draws / no contests), oldest first; fighters are ids."""
    decisive = fights[fights["winner"].notna()]
    f1_won = decisive["winner"] == decisive["f1"]
    edges = pd.DataFrame(
        {
            "winner": decisive["winner"],
            "loser": decisive["f2"].where(f1_won, decisive["f1"]),
            "date": decisive["date"],
            "method": decisive["method"].fillna("?"),
            "round": decisive["round"],
            "title": decisive["title"].astype(bool),
            "weight_class": decisive["weight_class"],
            # American odds of the winner; positive means they were the underdog.
            "winner_odds": decisive["f1_odds"].where(f1_won, decisive["f2_odds"]),
        }
    )
    return edges.sort_values("date", kind="stable").reset_index(drop=True)


def win_graph(edges: pd.DataFrame) -> "nx.DiGraph[str]":
    """Directed winner -> loser graph; each edge keeps the row index of the latest such win."""
    graph: nx.DiGraph[str] = nx.DiGraph()
    for i, (w, lo) in enumerate(zip(edges["winner"], edges["loser"], strict=True)):
        graph.add_edge(w, lo, fight=i)  # later fights overwrite earlier ones
    return graph


def find_cycles(
    graph: "nx.DiGraph[str]", min_len: int = MIN_CYCLE, max_len: int = MAX_CYCLE
) -> list[list[str]]:
    """Simple cycles with ``min_len <= length <= max_len`` (each cycle listed once)."""
    return [c for c in nx.simple_cycles(graph, length_bound=max_len) if len(c) >= min_len]


def fame(edges: pd.DataFrame, champions: Iterable[str] = ()) -> dict[str, float]:
    """A rough "how well known is this fighter" score: UFC fights, title wins, current belt."""
    n_fights = pd.concat([edges["winner"], edges["loser"]]).value_counts()
    title_wins = edges[edges["title"]].groupby("winner").size()
    score = np.log1p(n_fights) + 1.5 * title_wins.reindex(n_fights.index, fill_value=0).clip(
        upper=3
    )
    for name in champions:
        if name in score.index:
            score[name] += 3
    return {str(k): float(v) for k, v in score.items()}


def rank_cycles(
    cycles: list[list[str]], fame_of: dict[str, float], top_per_length: int = TOP_PER_LENGTH
) -> list[list[str]]:
    """Keep the most notable cycles per length.

    A cycle is only as interesting as its least known fighter, so we rank by the
    minimum fame (mean breaks ties). Each cycle is rotated to start with its most
    famous fighter.
    """
    by_length: dict[int, list[tuple[float, float, list[str]]]] = {}
    for c in cycles:
        scores = [fame_of.get(n, 0.0) for n in c]
        start = int(np.argmax(scores))
        rotated = c[start:] + c[:start]
        by_length.setdefault(len(c), []).append((min(scores), float(np.mean(scores)), rotated))
    ranked = []
    for length in sorted(by_length):
        best = sorted(by_length[length], key=lambda t: (t[0], t[1]), reverse=True)
        ranked += [c for *_, c in best[:top_per_length]]
    return ranked


def optional_int(v: Any) -> int | None:
    return None if pd.isna(v) else int(v)


def mma_math_payload(
    edges: pd.DataFrame,
    profiles: pd.DataFrame,
    ids: dict[str, str],
    champions: list[Champion] | None = None,
    photos: dict[str, Photo] | None = None,
    ranks: dict[str, int] | None = None,
) -> dict[str, Any]:
    """JSON for the MMA math page.

    ``edges`` and ``profiles`` use UFCStats fighter ids; ``ids`` maps them to the public
    ids shared with the style map. ``photos`` and ``ranks`` (current divisional rank, 0 =
    champion) are keyed by fighter id.
    """
    champions = champions or []
    photos = photos or {}
    ranks = ranks or {}
    graph = win_graph(edges)
    fame_of = fame(edges, [c["fighter"] for c in champions if c["fighter"]])
    cycles = rank_cycles(find_cycles(graph), fame_of)

    fighter_ids = sorted(set(edges["winner"]) | set(edges["loser"]))
    index = {f: i for i, f in enumerate(fighter_ids)}
    giant = max(nx.strongly_connected_components(graph), key=len)
    belt = {c["fighter"]: c["division"] for c in champions if c["fighter"]}
    record: dict[str, dict[str, int]] = {
        str(f): {str(k): int(v) for k, v in r.items()}
        for f, r in profiles[["wins", "losses", "draws"]].fillna(0).to_dict("index").items()
    }

    rows: list[dict[str, Any]] = [
        {str(k): v for k, v in r.items()} for r in edges.to_dict("records")
    ]

    return {
        "schema_version": 3,
        "fights_until": rows[-1]["date"].date().isoformat(),
        "giant_loop_size": len(giant),
        "fighters": [
            {
                "id": ids[f],
                "name": str(profiles.at[f, "name"]),
                "record": record[f],
                "champion": belt.get(f),
                "rank": ranks.get(f),
                "image": photos.get(f),
            }
            for f in fighter_ids
        ],
        # Compact rows: [winner, loser, date, method, round, title, winner_odds, weight_class]
        "fights": [
            [
                index[r["winner"]],
                index[r["loser"]],
                r["date"].date().isoformat(),
                r["method"],
                optional_int(r["round"]),
                bool(r["title"]),
                optional_int(r["winner_odds"]),
                r["weight_class"],
            ]
            for r in rows
        ],
        # Each cycle: fight row indices in order, so cycle[i].loser == cycle[i+1].winner.
        "cycles": [
            [graph.edges[a, b]["fight"] for a, b in zip(c, c[1:] + c[:1], strict=True)]
            for c in cycles
        ],
    }
