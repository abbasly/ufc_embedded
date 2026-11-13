import numpy as np
import pandas as pd

from ufc_embedded.champions import Champion
from ufc_embedded.export import SCHEMA_VERSION, style_map_payload
from ufc_embedded.style_map import STYLE_FEATURES, fit_style_map
from ufc_embedded.wikipedia import Photo


def make_table(n: int = 40) -> pd.DataFrame:
    rng = np.random.default_rng(0)
    table = pd.DataFrame(
        rng.uniform(1, 50, size=(n, len(STYLE_FEATURES))),
        columns=STYLE_FEATURES,
        index=pd.Index([f"id{i}" for i in range(n)], name="id"),
    )
    table["name"] = [f"Fighter {i}" for i in range(n)]
    table[["wins", "losses", "draws"]] = [10, 2, 0]
    table["weight_class"] = ["Lightweight", "Welterweight"] * (n // 2)
    table["last_fight"] = pd.Timestamp("2025-01-01")
    table["n_fights"] = 5
    table["minutes"] = 60.0
    return table


def test_payload_matches_contract() -> None:
    table = make_table()
    sm = fit_style_map(table, n_clusters=5)
    photo: Photo = {"url": "https://example.org/b.jpg", "credit_url": "https://example.org/b"}
    champions: list[Champion] = [
        {"division": "Lightweight", "name": "Fighter 1", "fighter": "id1"},
        {"division": "Heavyweight", "name": "Not On Map", "fighter": None},
    ]
    ids = {i: f"fighter-{i}" for i in table.index}
    payload = style_map_payload(
        table,
        sm,
        ids,
        pd.Timestamp("2026-10-31"),
        champions,
        ranks={"id1": 0, "id2": 3},
        rankings_date="2026-10-29",
        photos={"id2": photo},
    )

    assert payload["schema_version"] == SCHEMA_VERSION
    assert len(payload["axes"]) == 3
    assert sorted(c["name"] for c in payload["clusters"]) == sorted(
        {
            "Dominant wrestlers",
            "Kickboxers",
            "Clinch fighters",
            "Volume boxers",
            "Low-volume all-rounders",
        }
    )
    public = {f["id"] for f in payload["fighters"]}
    fighter = payload["fighters"][0]
    # Lean: Style axes, percentiles and neighbours are worked out in the browser.
    assert (len(fighter["similarity3"]), len(fighter["similarity2"])) == (3, 2)
    assert not {"coords", "coords_2d", "percentiles", "neighbours"} & set(fighter)
    assert [la["id"] for la in payload["layouts"]] == ["axes", "similarity"]
    assert all(0 <= q["knn_kept"] <= 1 for la in payload["layouts"] for q in la["quality"].values())
    assert payload["math"]["keys"] == STYLE_FEATURES
    assert len(fighter["stats"]) == len(fighter["vec"]) == len(STYLE_FEATURES)
    assert len(public) == len(payload["fighters"])
    assert [f["key"] for f in payload["features"]] != []
    assert {f["key"] for f in payload["features"]} == set(STYLE_FEATURES)

    by_id = {f["id"]: f for f in payload["fighters"]}
    assert by_id["fighter-id1"]["champion"] == "Lightweight"
    assert by_id["fighter-id1"]["rank"] == 0
    assert by_id["fighter-id2"]["image"] == photo
    assert by_id["fighter-id3"]["image"] is None
    assert by_id["fighter-id3"]["record"] == {"wins": 10, "losses": 2, "draws": 0}
    assert [c["fighter_id"] for c in payload["champions"]] == ["fighter-id1", None]
