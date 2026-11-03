import numpy as np
import pandas as pd

from ufc_embedded.style_map import (
    STATS,
    STYLE_FEATURES,
    build_feature_table,
    career_stats,
    fit_style_map,
    reliability,
    self_match,
    style_axes,
)

COUNTS = sorted({c for s in STATS for c in (s.num, s.den)})


def make_app(n_fighters: int, n_fights: int, seed: int = 0, noise: float = 0.3) -> pd.DataFrame:
    """Fights of fighters with their own steady style: each count is the fighter's own rate
    times a little per-fight noise."""
    rng = np.random.default_rng(seed)
    style = rng.uniform(0.2, 2.0, size=(n_fighters, len(COUNTS)))
    rows = []
    for i in range(n_fighters):
        for k in range(n_fights):
            counts = style[i] * rng.lognormal(0, noise, len(COUNTS)) * 10
            date = pd.Timestamp("2020-01-01") + pd.Timedelta(days=k)
            fight = {"id": f"f{i}", "date": date, "fight": f"f{i}-{k}"}
            rows.append(fight | dict(zip(COUNTS, counts, strict=True)))
    app = pd.DataFrame(rows)
    # Attempts are always at least the successes, and minutes are a normal fight length.
    splits = app[["body_att", "leg_att", "clinch_att", "ground_att"]].sum(axis=1)
    app["sig_att"] = app["sig_succ"] + app["sig_att"] + splits
    app["opp_sig_att"] = app["opp_sig_succ"] + app["opp_sig_att"]
    app["td_att"] = app["td_succ"] + app["td_att"]
    app["opp_td_att"] = app["opp_td_succ"] + app["opp_td_att"]
    app["minutes"] = 10.0
    return app


def test_career_stats_are_rates_and_shrink_low_evidence_harder() -> None:
    app = pd.DataFrame(
        {
            "id": ["short", "long"],
            "minutes": [5.0, 500.0],
            "td_succ": [5.0, 50.0],  # 15 vs 1.5 takedowns per 15 minutes
        }
        | {c: [1.0, 1.0] for c in COUNTS if c not in ("minutes", "td_succ")}
    )
    td = "average_takedowns_landed_per_15_minutes"
    raw = career_stats(app, shrink=False)[td]
    assert raw["short"] == 15 and raw["long"] == 1.5
    shrunk = career_stats(app)[td]  # the population rate is about 1.6
    assert shrunk["short"] < 5  # five minutes of evidence: mostly the prior
    assert abs(shrunk["long"] - 1.5) < 0.1  # 500 minutes: barely moved


def test_feature_table_keeps_active_fighters_with_enough_fights() -> None:
    app = make_app(3, 4)
    active = pd.DataFrame({"n_fights": [4, 1]}, index=["f0", "f1"])
    table = build_feature_table(app, active, min_fights=3)
    assert list(table.index) == ["f0"]
    assert set(STYLE_FEATURES) <= set(table.columns)


def test_style_map_shapes_neighbours_and_match() -> None:
    app = make_app(40, 4)
    stats = career_stats(app)
    sm = fit_style_map(stats, n_clusters=3)
    for layout in (sm.axes, sm.similarity):
        assert layout.coords3.shape == (40, 3)
        assert layout.coords2.shape == (40, 2)
        assert 0 <= layout.knn_kept[3] <= 1
    assert set(sm.labels) == {0, 1, 2}
    nb = sm.neighbours("f0", k=4)
    assert len(nb) == 4
    assert "f0" not in nb.index
    assert nb.is_monotonic_increasing
    score = sm.similarity_score(nb.to_numpy())
    assert all(0 <= s <= 100 for s in score)
    assert all(np.diff(score) <= 0)  # further away, less similar
    assert sm.similarity_score(np.array([0.0, sm.typical_distance, 99.0])).tolist() == [100, 0, 0]


def test_neighbours_within_a_group_stay_in_it() -> None:
    stats = career_stats(make_app(30, 4))
    sm = fit_style_map(stats, n_clusters=3)
    division = pd.Series(["Flyweight", "Heavyweight", "Lightweight"] * 10, index=stats.index)
    for fighter, nb in sm.all_neighbours(5, among=division).items():
        assert len(nb) == 5
        assert (division[nb.index] == division[fighter]).all()


def test_weights_scale_stats_in_the_embedding() -> None:
    stats = career_stats(make_app(30, 4))
    weights = pd.Series(1.0, index=STYLE_FEATURES)
    weights[STYLE_FEATURES[0]] = 0.0
    sm = fit_style_map(stats, n_clusters=3, weights=weights)
    assert np.all(sm.embedding[:, 0] == 0)
    np.testing.assert_allclose(sm.embedding[:, 1:], sm.xs[:, 1:])


def test_steady_styles_are_recognised_and_reliable() -> None:
    app = make_app(60, 8, noise=0.1)
    check = self_match(app, min_fights=6)
    assert check["n"] == 60
    assert check["top1"] > 0.5  # far above chance (1/60)
    assert (reliability(app, min_fights=6) > 0.5).all()


def test_noisy_stats_are_unreliable() -> None:
    steady, noisy = make_app(60, 8, seed=1, noise=0.05), make_app(60, 8, seed=1, noise=3.0)
    assert reliability(noisy, min_fights=6).mean() < reliability(steady, min_fights=6).mean()


def test_style_axes_follow_their_stats() -> None:
    rng = np.random.default_rng(1)
    xs = rng.normal(size=(200, len(STYLE_FEATURES)))
    scores = style_axes(xs)
    assert scores.shape == (200, 3)
    np.testing.assert_allclose(scores.std(axis=0), 1)
    takedowns = xs[:, STYLE_FEATURES.index("average_takedowns_landed_per_15_minutes")]
    absorbed = xs[:, STYLE_FEATURES.index("significant_strikes_absorbed_per_minute")]
    assert np.corrcoef(scores[:, 0], takedowns)[0, 1] > 0.5  # grappling
    assert np.corrcoef(scores[:, 2], absorbed)[0, 1] < -0.3  # defence
