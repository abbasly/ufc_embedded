import pandas as pd

from ufc_embedded.mma_math import (
    fame,
    find_cycles,
    mma_math_payload,
    rank_cycles,
    win_edges,
    win_graph,
)


def make_fights() -> pd.DataFrame:
    # A > B > C > A is a cycle; D only beats A once; one draw is ignored.
    rows = [
        ("2020-01-01", "A", "B", "A"),
        ("2021-01-01", "B", "C", "B"),
        ("2022-01-01", "A", "C", "C"),  # C beats A
        ("2023-01-01", "D", "A", "D"),
        ("2024-01-01", "A", "D", None),
    ]
    return pd.DataFrame(
        {
            "date": pd.to_datetime([r[0] for r in rows]),
            "f1": [r[1] for r in rows],
            "f2": [r[2] for r in rows],
            "winner": [r[3] for r in rows],
            "method": ["KO/TKO", "SUB", "U-DEC", "KO/TKO", "M-DEC"],
            "round": [1, 2, 3, 1, 3],
            "title": [False, False, True, False, False],
            "weight_class": ["Lightweight"] * 5,
            "f1_odds": [-200, 150, -300, 120, 100],
            "f2_odds": [170, -180, 250, -140, -120],
        }
    )


PROFILES = pd.DataFrame(
    {"name": list("ABCD"), "wins": [5, 4, 3, 2], "losses": [1, 1, 1, 1], "draws": [0, 0, 0, 1]},
    index=list("ABCD"),
)


def test_win_edges_drops_draws_and_picks_winner_side() -> None:
    edges = win_edges(make_fights())
    assert list(zip(edges["winner"], edges["loser"], strict=True)) == [
        ("A", "B"),
        ("B", "C"),
        ("C", "A"),
        ("D", "A"),
    ]
    assert edges.loc[2, "winner_odds"] == 250  # C was the underdog


def test_finds_the_cycle_and_rotates_to_most_famous() -> None:
    edges = win_edges(make_fights())
    cycles = find_cycles(win_graph(edges))
    assert len(cycles) == 1 and sorted(cycles[0]) == ["A", "B", "C"]

    fame_of = fame(edges, champions=["B"])
    assert rank_cycles(cycles, fame_of) == [["B", "C", "A"]]


def test_payload_cycle_is_a_chain_of_fights() -> None:
    edges = win_edges(make_fights())
    payload = mma_math_payload(edges, PROFILES, {n: n.lower() for n in "ABCD"})
    assert payload["fighters"][3]["record"] == {"wins": 2, "losses": 1, "draws": 1}
    fights = payload["fights"]
    (cycle,) = payload["cycles"]
    for a, b in zip(cycle, cycle[1:] + cycle[:1], strict=True):
        assert fights[a][1] == fights[b][0]  # loser of one fight is the winner of the next
    assert payload["giant_loop_size"] == 3
