import numpy as np
import pandas as pd

from ufc_embedded.export import SCHEMA_VERSION, slugify, style_map_payload
from ufc_embedded.style_map import STYLE_FEATURES, fit_style_map


def make_table(n: int = 40) -> pd.DataFrame:
    rng = np.random.default_rng(0)
    table = pd.DataFrame(
        rng.uniform(1, 50, size=(n, len(STYLE_FEATURES))),
        columns=STYLE_FEATURES,
        index=pd.Index([f"Fighter {i}" for i in range(n)], name="name"),
    )
    table["weight_class"] = "Lightweight"
    table["last_fight"] = pd.Timestamp("2025-01-01")
    table["n_fights"] = 5
    return table


def test_slugify_strips_accents_and_punctuation() -> None:
    assert slugify("Jiří Procházka") == "jiri-prochazka"
    assert slugify("Sean O'Malley") == "sean-o-malley"


def test_payload_matches_contract() -> None:
    table = make_table()
    sm = fit_style_map(table, n_clusters=5, n_components=3)
    image = {"url": "https://example.org/a.jpg", "credit_url": "https://example.org/a"}
    payload = style_map_payload(
        table,
        sm,
        pd.Timestamp("2026-03-28"),
        champions={"Lightweight": "Fighter 1", "Heavyweight": "Not On Map"},
        images={"Fighter 1": image},
    )

    assert payload["schema_version"] == SCHEMA_VERSION
    assert len(payload["axes"]) == 3
    assert sorted(c["name"] for c in payload["clusters"]) == sorted(
        {
            "Dominant wrestlers",
            "Pure strikers",
            "Scrambly grapplers",
            "Volume mixers",
            "Low-volume all-rounders",
        }
    )
    ids = {f["id"] for f in payload["fighters"]}
    fighter = payload["fighters"][0]
    assert len(fighter["coords"]) == 3
    assert set(fighter["stats"]) == set(STYLE_FEATURES)
    assert all(0 < p <= 1 for p in fighter["percentiles"].values())
    assert all(n["id"] in ids and n["id"] != fighter["id"] for n in fighter["neighbours"])

    champs = [f for f in payload["fighters"] if f["champion"]]
    assert [(f["name"], f["champion"], f["image"]) for f in champs] == [
        ("Fighter 1", "Lightweight", image)
    ]
