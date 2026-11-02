"""Time-based splits, the betting-market baseline and probabilistic metrics."""

import numpy as np
import pandas as pd

# Train on everything before VAL_START, tune on the validation years, and keep the
# test years untouched until a final run (``train.py --final``).
VAL_START = pd.Timestamp("2022-01-01")
TEST_START = pd.Timestamp("2024-01-01")


def split(m: pd.DataFrame) -> dict[str, pd.DataFrame]:
    return {
        "train": m[m["date"] < VAL_START],
        "val": m[(m["date"] >= VAL_START) & (m["date"] < TEST_START)],
        "test": m[m["date"] >= TEST_START],
    }


def implied_prob(american: pd.Series) -> pd.Series:
    """Bookmaker probability from American odds (-200 -> 0.667, +150 -> 0.4)."""
    a = american.astype(float)
    return pd.Series(np.where(a < 0, -a / (-a + 100), 100 / (a + 100)), index=american.index)


def market_prob(a_odds: pd.Series, b_odds: pd.Series) -> pd.Series:
    """P(A wins) from both sides' odds, with the bookmaker margin (vig) removed."""
    pa, pb = implied_prob(a_odds), implied_prob(b_odds)
    return pa / (pa + pb)


def metrics(y: np.ndarray | pd.Series, p: np.ndarray | pd.Series) -> dict[str, float]:
    """Log loss (main metric), Brier score, accuracy and expected calibration error."""
    y_ = np.asarray(y, dtype=float)
    p_ = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
    return {
        "log_loss": float(-np.mean(y_ * np.log(p_) + (1 - y_) * np.log(1 - p_))),
        "brier": float(np.mean((p_ - y_) ** 2)),
        "accuracy": float(np.mean((p_ > 0.5) == (y_ == 1))),
        "ece": expected_calibration_error(y_, p_),
        "n": float(len(y_)),
    }


def calibration_table(
    y: np.ndarray | pd.Series, p: np.ndarray | pd.Series, bins: int = 10
) -> pd.DataFrame:
    """Per probability bin: mean prediction vs how often A actually won."""
    df = pd.DataFrame({"y": np.asarray(y, float), "p": np.asarray(p, float)})
    df["bin"] = np.minimum((df["p"] * bins).astype(int), bins - 1)
    return (
        df.groupby("bin")
        .agg(predicted=("p", "mean"), observed=("y", "mean"), n=("y", "size"))
        .reset_index()
    )


def expected_calibration_error(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    t = calibration_table(y, p, bins)
    return float((t["n"] * (t["predicted"] - t["observed"]).abs()).sum() / t["n"].sum())


def multiclass_log_loss(y: pd.Series, p: pd.DataFrame) -> float:
    """Mean -log P(true class); ``p`` has one column per class name."""
    cols = {c: i for i, c in enumerate(p.columns)}
    picked = p.to_numpy()[np.arange(len(y)), [cols[c] for c in y]]
    return float(-np.mean(np.log(np.clip(picked, 1e-9, 1))))
