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

MIN_CYCLE = 3
MAX_CYCLE = 5
TOP_PER_LENGTH = 40


def win_edges(fights: pd.DataFrame) -> pd.DataFrame:
    """One row per decisive fight (no draws / no contests), oldest first."""
    decisive = fights[fights["Winner"].isin(["Red", "Blue"])]
    red_won = decisive["Winner"] == "Red"
    edges = pd.DataFrame(
        {
            "winner": decisive["R_fighter"].where(red_won, decisive["B_fighter"]),
            "loser": decisive["B_fighter"].where(red_won, decisive["R_fighter"]),
            "date": decisive["date"],
            "method": decisive["finish"].fillna("?"),
            "round": decisive["finish_round"],
            "title": decisive["title_bout"].astype(bool),
            "weight_class": decisive["weight_class"],
            # American odds of the winner; positive means they were the underdog.
            "winner_odds": decisive["R_odds"].where(red_won, decisive["B_odds"]),
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
    ids: dict[str, str],
    champions: list[Champion] | None = None,
) -> dict[str, Any]:
    """JSON for the MMA math page. ``ids`` maps fighter name -> slug (shared with the style map)."""
    champions = champions or []
    graph = win_graph(edges)
    fame_of = fame(edges, [c["name"] for c in champions])
    cycles = rank_cycles(find_cycles(graph), fame_of)

    names = sorted(set(edges["winner"]) | set(edges["loser"]))
    index = {n: i for i, n in enumerate(names)}
    giant = max(nx.strongly_connected_components(graph), key=len)
    belt = {c["name"]: c for c in champions}
    wins = edges["winner"].value_counts()
    losses = edges["loser"].value_counts()

    rows: list[dict[str, Any]] = [
        {str(k): v for k, v in r.items()} for r in edges.to_dict("records")
    ]

    return {
        "schema_version": 1,
        "fights_until": rows[-1]["date"].date().isoformat(),
        "giant_loop_size": len(giant),
        "fighters": [
            {
                "id": ids[n],
                "name": n,
                "wins": int(wins.get(n, 0)),
                "losses": int(losses.get(n, 0)),
                "champion": belt[n]["division"] if n in belt else None,
                "image": belt[n]["image"] if n in belt else None,
            }
            for n in names
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
