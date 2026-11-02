import pandas as pd

from ufc_embedded.method import INPUTS, LOSER_INPUTS, WINNER_INPUTS, method_class, winner_view


def test_method_classes() -> None:
    assert [method_class(m) for m in ["KO/TKO", "SUB", "U-DEC", "S-DEC", "M-DEC", "DQ"]] == [
        "KO/TKO",
        "SUB",
        "DEC",
        "DEC",
        "DEC",
        None,
    ]


def test_winner_view_takes_the_winners_side() -> None:
    cols = {}
    for side, value in (("a", 1.0), ("b", 2.0)):
        for c in WINNER_INPUTS + LOSER_INPUTS:
            cols[f"{side}_{c}"] = [value, value]
    m = pd.DataFrame(
        {
            "y": [1, 0],
            "method": ["KO/TKO", "U-DEC"],
            "weight_class": ["Heavyweight", "Women's Flyweight"],
            **cols,
        }
    )
    x, y = winner_view(m)
    assert list(x.columns) == INPUTS
    assert x["w_ko_win_rate"].tolist() == [1.0, 2.0]  # A won the first fight, B the second
    assert x["l_finished_rate"].tolist() == [2.0, 1.0]
    assert x["weight_lbs"].tolist() == [240, 125] and x["women"].tolist() == [0.0, 1.0]
    assert y.tolist() == ["KO/TKO", "DEC"]
