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
        ("2020-01-01", "A", "B", "Red"),
        ("2021-01-01", "B", "C", "Red"),
        ("2022-01-01", "A", "C", "Blue"),  # C beats A
        ("2023-01-01", "D", "A", "Red"),
        ("2024-01-01", "A", "D", "Draw"),
    ]
    return pd.DataFrame(
        {
            "date": pd.to_datetime([r[0] for r in rows]),
            "R_fighter": [r[1] for r in rows],
            "B_fighter": [r[2] for r in rows],
            "Winner": [r[3] for r in rows],
            "finish": ["KO/TKO", "SUB", "U-DEC", "KO/TKO", "U-DEC"],
            "finish_round": [1, 2, 3, 1, 3],
            "title_bout": [False, False, True, False, False],
            "weight_class": ["Lightweight"] * 5,
            "R_odds": [-200, 150, -300, 120, 100],
            "B_odds": [170, -180, 250, -140, -120],
        }
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
    payload = mma_math_payload(edges, {n: n.lower() for n in "ABCD"})
    fights = payload["fights"]
    (cycle,) = payload["cycles"]
    for a, b in zip(cycle, cycle[1:] + cycle[:1], strict=True):
        assert fights[a][1] == fights[b][0]  # loser of one fight is the winner of the next
    assert payload["giant_loop_size"] == 3
