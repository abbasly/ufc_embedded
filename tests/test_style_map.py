import numpy as np
import pandas as pd

from ufc_embedded.style_map import STYLE_FEATURES, build_feature_table, fit_style_map


def make_stats(names: list[str], rng: np.random.Generator) -> pd.DataFrame:
    stats = pd.DataFrame(rng.uniform(1, 50, size=(len(names), len(STYLE_FEATURES))))
    stats.columns = STYLE_FEATURES
    stats.insert(0, "name", names)
    return stats


def test_feature_table_drops_duplicates_zeros_and_few_fights() -> None:
    rng = np.random.default_rng(0)
    stats = make_stats(["ok", "dup", "dup", "zero", "rookie"], rng)
    stats.loc[stats["name"] == "zero", STYLE_FEATURES] = 0
    active = pd.DataFrame({"n_fights_as_of": [5, 5, 5, 1]}, index=["ok", "dup", "zero", "rookie"])
    table = build_feature_table(stats, active, min_fights=3)
    assert list(table.index) == ["ok"]


def test_style_map_shapes_and_neighbours() -> None:
    rng = np.random.default_rng(0)
    names = [f"f{i}" for i in range(40)]
    table = make_stats(names, rng).set_index("name")
    sm = fit_style_map(table, n_clusters=3)
    assert sm.coords.shape == (40, 2)
    assert set(sm.labels) == {0, 1, 2}
    nb = sm.neighbours("f0", k=4)
    assert len(nb) == 4
    assert "f0" not in nb.index
    assert nb.is_monotonic_increasing
