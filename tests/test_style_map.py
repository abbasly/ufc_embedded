import numpy as np
import pandas as pd

from ufc_embedded.style_map import (
    STYLE_FEATURES,
    build_feature_table,
    fit_style_map,
    shrink,
    style_axes,
)


def make_stats(names: list[str], rng: np.random.Generator) -> pd.DataFrame:
    stats = pd.DataFrame(rng.uniform(1, 50, size=(len(names), len(STYLE_FEATURES))))
    stats.columns = STYLE_FEATURES
    stats.insert(0, "name", names)
    return stats


def test_feature_table_drops_zeros_missing_and_few_fights() -> None:
    rng = np.random.default_rng(0)
    profiles = make_stats(["ok", "zero", "missing", "rookie"], rng).set_index("name")
    profiles.loc["zero", STYLE_FEATURES] = 0
    profiles.loc["missing", STYLE_FEATURES[0]] = np.nan
    active = pd.DataFrame({"n_fights": [5, 5, 5, 1]}, index=["ok", "zero", "missing", "rookie"])
    assert list(build_feature_table(profiles, active, min_fights=3).index) == ["ok"]


def test_style_map_shapes_and_neighbours() -> None:
    rng = np.random.default_rng(0)
    names = [f"f{i}" for i in range(40)]
    table = make_stats(names, rng).set_index("name").assign(minutes=60.0)
    sm = fit_style_map(table, n_clusters=3)
    for layout in (sm.axes, sm.similarity):
        assert layout.coords3.shape == (40, 3)
        assert layout.coords2.shape == (40, 2)
        assert 0 <= layout.knn_kept[3] <= 1
    assert set(sm.labels) == {0, 1, 2}
    nb = sm.neighbours("f0", k=4)
    assert len(nb) == 4
    assert "f0" not in nb.index
    assert nb.is_monotonic_increasing


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


def test_shrink_pulls_low_evidence_fighters_harder() -> None:
    table = pd.DataFrame(
        {f: [10.0, 10.0, 0.0, 0.0] for f in STYLE_FEATURES} | {"minutes": [5, 500, 5, 500]}
    )
    td = "average_takedowns_landed_per_15_minutes"
    shrunk = shrink(table)[td]
    assert shrunk[0] < shrunk[1]  # same raw value, less cage time -> closer to the mean (5)
    assert shrunk[2] > shrunk[3]
