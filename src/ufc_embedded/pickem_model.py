"""The model as a Pick'em player: its pick for a bout, from the same exported models the
predictor page evaluates in the browser (``web/src/features/predictor/model.ts``; keep the two
in step). The winner is the fighter it gives the better chance; the method, that winner's most
likely way to win.
"""

import math
from typing import Any

MODEL_PLAYER = "the_model"  # the display name of the model's Pick'em account

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


def win_prob(model: dict[str, Any], a: dict[str, Any], b: dict[str, Any]) -> float:
    """P(A beats B): logistic on scaled feature differences."""
    z = sum(
        w * (xa - xb) / s
        for w, xa, xb, s in zip(model["weights"], a["x"], b["x"], model["scale"], strict=False)
    )
    return 1 / (1 + math.exp(-z))


def method_probs(
    model: dict[str, Any], inputs: list[str], winner: dict[str, Any], loser: dict[str, Any]
) -> list[float]:
    """P(KO/TKO), P(SUB), P(DEC) given that ``winner`` beats ``loser``."""

    def feat(f: dict[str, Any], name: str) -> float:
        i = inputs.index(name) if name in inputs else -1
        return float(f["x"][i]) if 0 <= i < len(f["x"]) else 0.0

    lbs = max(
        WEIGHT_LBS.get(winner["weight_class"], CATCH_WEIGHT_LBS),
        WEIGHT_LBS.get(loser["weight_class"], CATCH_WEIGHT_LBS),
    )
    women = (
        1.0
        if winner["weight_class"].startswith("Women") and loser["weight_class"].startswith("Women")
        else 0.0
    )
    raw = (
        [feat(winner, n) for n in model["winner_inputs"]]
        + [feat(loser, n) for n in model["loser_inputs"]]
        + [lbs, women]
    )
    z = [(v - m) / s for v, m, s in zip(raw, model["mean"], model["scale"], strict=True)]
    logits = [
        sum(w * zi for w, zi in zip(row, z, strict=True)) + b
        for row, b in zip(model["coef"], model["intercept"], strict=True)
    ]
    top = max(logits)
    exps = [math.exp(v - top) for v in logits]
    total = sum(exps)
    return [e / total for e in exps]


def model_pick(data: dict[str, Any], a_id: str, b_id: str) -> tuple[str, str, float] | None:
    """(winner id, method, P(winner)) for a bout, or None if the model doesn't know both
    fighters (UFC newcomers)."""
    fighters = {f["id"]: f for f in data["fighters"]}
    a, b = fighters.get(a_id), fighters.get(b_id)
    if a is None or b is None:
        return None
    p_a = win_prob(data["win_model"], a, b)
    winner, loser, p = (a, b, p_a) if p_a >= 0.5 else (b, a, 1 - p_a)
    methods = method_probs(data["method_model"], data["win_model"]["inputs"], winner, loser)
    method = data["method_model"]["classes"][max(range(len(methods)), key=methods.__getitem__)]
    return str(winner["id"]), str(method), p
