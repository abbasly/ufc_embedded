import numpy as np
import pandas as pd

from ufc_embedded.champions import Champion
from ufc_embedded.data import slugify
from ufc_embedded.export import SCHEMA_VERSION, style_map_payload
from ufc_embedded.style_map import STYLE_FEATURES, fit_style_map
from ufc_embedded.wikipedia import Photo


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
    table["minutes_as_of"] = 60.0
    table["rank"] = [float(i) if i < 15 else float("nan") for i in range(n)]
    return table


def test_slugify_strips_accents_and_punctuation() -> None:
    assert slugify("Jiří Procházka") == "jiri-prochazka"
    assert slugify("Sean O'Malley") == "sean-o-malley"


def test_payload_matches_contract() -> None:
    table = make_table()
    sm = fit_style_map(table, n_clusters=5)
    image: Photo = {"url": "https://example.org/a.jpg", "credit_url": "https://example.org/a"}
    champions: list[Champion] = [
        {
            "division": "Lightweight",
            "name": "Fighter 1",
            "since": "",
            "wiki_page": "",
            "image": image,
        },
        {
            "division": "Heavyweight",
            "name": "Not On Map",
            "since": "",
            "wiki_page": "",
            "image": None,
        },
    ]
    photo: Photo = {"url": "https://example.org/b.jpg", "credit_url": "https://example.org/b"}
    payload = style_map_payload(
        table,
        sm,
        pd.Timestamp("2026-03-28"),
        champions,
        "2026-11-01",
        photos={"Fighter 1": photo, "Fighter 2": photo},
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
    assert {k: len(v) for k, v in fighter["coords"].items()} == {"axes": 3, "similarity": 3}
    assert {k: len(v) for k, v in fighter["coords_2d"].items()} == {"axes": 2, "similarity": 2}
    assert [la["id"] for la in payload["layouts"]] == ["axes", "similarity"]
    assert all(0 <= q["knn_kept"] <= 1 for la in payload["layouts"] for q in la["quality"].values())
    assert set(fighter["stats"]) == set(STYLE_FEATURES)
    assert all(0 < p <= 1 for p in fighter["percentiles"].values())
    assert all(n["id"] in ids and n["id"] != fighter["id"] for n in fighter["neighbours"])

    champs = [f for f in payload["fighters"] if f["champion"]]
    assert [(f["name"], f["champion"], f["image"]) for f in champs] == [
        ("Fighter 1", "Lightweight", image)
    ]
    assert [c["fighter_id"] for c in payload["champions"]] == ["fighter-1", None]
    assert fighter["rank"] is None or isinstance(fighter["rank"], int)
    # Champions keep their champion photo; other fighters get theirs from ``photos``.
    by_name = {f["name"]: f for f in payload["fighters"]}
    assert by_name["Fighter 1"]["image"] == image
    assert by_name["Fighter 2"]["image"] == photo
    assert by_name["Fighter 3"]["image"] is None
