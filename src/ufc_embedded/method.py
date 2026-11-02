"""How a fight ends (KO/TKO, submission, decision), given who wins.

Combined with the win model: P(A by KO) = P(A wins) * P(KO | A wins). The inputs look
at the fight from the winner's side (their finishing ability) and the loser's side
(their durability), plus the weight class.
"""

import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import StandardScaler

METHODS = ["KO/TKO", "SUB", "DEC"]
WINNER_INPUTS = [
    "ko_win_rate",
    "sub_win_rate",
    "kd15",
    "slpm",
    "str_acc",
    "td15",
    "sub15",
    "ctrl_share",
]
LOSER_INPUTS = ["finished_rate", "kd_absorbed15", "sapm", "str_def", "td_def", "ctrled_share"]
EXTRA_INPUTS = ["weight_lbs", "women"]
INPUTS = [f"w_{c}" for c in WINNER_INPUTS] + [f"l_{c}" for c in LOSER_INPUTS] + EXTRA_INPUTS

WEIGHT_LBS = {
    "Women's Strawweight": 115,
    "Flyweight": 125,
    "Women's Flyweight": 125,
    "Bantamweight": 135,
    "Women's Bantamweight": 135,
    "Featherweight": 145,
    "Women's Featherweight": 145,
    "Lightweight": 155,
    "Welterweight": 170,
    "Middleweight": 185,
    "Light Heavyweight": 205,
    "Heavyweight": 240,
}
CATCH_WEIGHT_LBS = 160


def method_class(method: object) -> str | None:
    """Collapse result labels to KO/TKO, SUB or DEC; anything else (DQ, ...) is None."""
    text = str(method)
    if text == "KO/TKO":
        return "KO/TKO"
    if text == "SUB":
        return "SUB"
    if text.endswith("DEC"):
        return "DEC"
    return None


def winner_view(m: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """Method-model inputs from the winner's perspective, and the method each fight ended by."""
    a_won = m["y"] == 1
    w = {c: m[f"a_{c}"].where(a_won, m[f"b_{c}"]) for c in WINNER_INPUTS}
    lo = {c: m[f"b_{c}"].where(a_won, m[f"a_{c}"]) for c in LOSER_INPUTS}
    x = pd.DataFrame(
        {
            **{f"w_{c}": v for c, v in w.items()},
            **{f"l_{c}": v for c, v in lo.items()},
            "weight_lbs": m["weight_class"].map(WEIGHT_LBS).fillna(CATCH_WEIGHT_LBS),
            "women": m["weight_class"].str.startswith("Women").astype(float),
        }
    )
    y = m["method"].map(method_class)
    keep = y.notna()
    return x[keep], y[keep]


def method_model(C: float) -> Pipeline:
    return make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=2000))
