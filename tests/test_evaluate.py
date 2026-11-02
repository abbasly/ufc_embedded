import numpy as np
import pandas as pd

from ufc_embedded.evaluate import (
    coverage_curve,
    implied_prob,
    market_prob,
    metrics,
    multiclass_log_loss,
    rolling_folds,
)


def test_american_odds_to_probability() -> None:
    p = implied_prob(pd.Series([-200.0, 150.0, 100.0]))
    np.testing.assert_allclose(p, [2 / 3, 0.4, 0.5])


def test_market_prob_removes_the_vig() -> None:
    # -150 / +130 implies 0.6 + 0.435 > 1; normalised it sums to exactly 1.
    a = market_prob(pd.Series([-150.0]), pd.Series([130.0]))
    b = market_prob(pd.Series([130.0]), pd.Series([-150.0]))
    np.testing.assert_allclose(a + b, 1)
    assert 0.57 < a[0] < 0.59


def test_metrics_on_perfect_and_coin_flip_predictions() -> None:
    y = np.array([1, 0, 1, 0])
    perfect = metrics(y, np.array([1.0, 0.0, 1.0, 0.0]))
    coin = metrics(y, np.full(4, 0.5))
    assert perfect["accuracy"] == 1 and perfect["log_loss"] < 1e-5
    assert np.isclose(coin["log_loss"], np.log(2)) and np.isclose(coin["brier"], 0.25)


def test_multiclass_log_loss_reads_columns_by_name() -> None:
    p = pd.DataFrame({"SUB": [0.2, 0.5], "KO/TKO": [0.8, 0.5]})
    y = pd.Series(["KO/TKO", "SUB"])
    assert np.isclose(multiclass_log_loss(y, p), -(np.log(0.8) + np.log(0.5)) / 2)


def test_coverage_curve_counts_confident_picks() -> None:
    # Picks at 90% (right), 80% (wrong) and 55% (right); y is whether A won.
    y = np.array([1, 1, 1])
    p = np.array([0.9, 0.2, 0.55])
    cov = coverage_curve(y, p, [0.5, 0.75, 0.85])
    np.testing.assert_allclose(cov["coverage"], [1, 2 / 3, 1 / 3])
    np.testing.assert_allclose(cov["accuracy"], [2 / 3, 0.5, 1])


def test_rolling_folds_train_only_on_earlier_years() -> None:
    m = pd.DataFrame({"date": pd.to_datetime(["2018-05-01", "2019-03-01", "2020-07-01"])})
    folds = rolling_folds(m, [2019, 2020])
    assert [len(tr) for tr, _ in folds] == [1, 2]
    assert all(tr["date"].max() < te["date"].min() for tr, te in folds)
