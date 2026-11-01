"""Export pipeline results as JSON for the web frontend.

The JSON written here is the contract between the Python side and ``web/``;
its TypeScript mirror is ``web/src/data/types.ts``. Bump ``SCHEMA_VERSION``
on breaking changes to its shape.

Run with ``uv run python -m ufc_embedded.export``.
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from ufc_embedded.champions import Champion, current_champions
from ufc_embedded.data import (
    FIGHTER_STATS_SNAPSHOT,
    PROJECT_ROOT,
    active_fighters,
    load_fighter_stats,
    load_fights,
    slugify,
)
from ufc_embedded.mma_math import mma_math_payload, win_edges
from ufc_embedded.style_map import (
    AXIS_WEIGHTS,
    STYLE_FEATURES,
    StyleMap,
    build_feature_table,
    fit_style_map,
)

SCHEMA_VERSION = 4
WEB_DATA_DIR = PROJECT_ROOT / "web" / "public" / "data"

ACTIVE_YEARS = 3
MIN_FIGHTS = 3
N_CLUSTERS = 5
N_NEIGHBOURS = 8

FEATURE_INFO: dict[str, tuple[str, str]] = {
    "significant_strikes_landed_per_minute": ("Strikes landed / min", "per min"),
    "significant_strikes_absorbed_per_minute": ("Strikes absorbed / min", "per min"),
    "average_takedowns_landed_per_15_minutes": ("Takedowns / 15 min", "per 15 min"),
    "average_submissions_attempted_per_15_minutes": ("Sub attempts / 15 min", "per 15 min"),
    "significant_striking_accuracy": ("Striking accuracy", "%"),
    "significant_strike_defence": ("Strike defence", "%"),
    "takedown_accuracy": ("Takedown accuracy", "%"),
    "takedown_defense": ("Takedown defence", "%"),
}

# Interpretations of the (sign-anchored) PCA axes; see style_map.AXIS_ANCHORS.
# Display text for style_map.AXIS_WEIGHTS, in the same order.
AXES = [
    {"label": "Grappling", "low": "Stays standing", "high": "Wrestling & submissions"},
    {"label": "Striking", "low": "Low output", "high": "High volume & accuracy"},
    {"label": "Defence", "low": "Hittable", "high": "Hard to hit / take down"},
]

LAYOUTS = [
    {
        "id": "axes",
        "label": "Style axes",
        "description": "Readable axes: grappling, striking and defence scores from the stats.",
        "interpretable": True,
    },
    {
        "id": "similarity",
        "label": "Similarity",
        "description": "t-SNE: keeps similar fighters together, but the axes have no meaning.",
        "interpretable": False,
    },
]

STYLE_DESCRIPTIONS = {
    "Dominant wrestlers": "Most takedowns, least damage taken. Control fights on the mat.",
    "Pure strikers": "High striking output and almost never shoot for takedowns.",
    "Scrambly grapplers": "Hunt submissions and scramble, but get taken down a lot themselves.",
    "Volume mixers": "High-volume strikers who mix in takedowns.",
    "Low-volume all-rounders": "Moderate at everything with lower output.",
}


def name_clusters(table: pd.DataFrame, labels: Any) -> dict[int, str]:
    """Name k=5 clusters from their median stats, so names don't depend on k-means ids."""
    med = table[STYLE_FEATURES].groupby(labels).median()
    if len(med) != len(STYLE_DESCRIPTIONS):
        return {int(c): f"Style {int(c) + 1}" for c in med.index}
    td = "average_takedowns_landed_per_15_minutes"
    names: dict[int, str] = {}
    remaining = med
    for name, col, pick in [
        ("Dominant wrestlers", td, "idxmax"),
        ("Pure strikers", td, "idxmin"),
        ("Scrambly grapplers", "takedown_defense", "idxmin"),
        ("Volume mixers", "significant_strikes_landed_per_minute", "idxmax"),
    ]:
        c = int(getattr(remaining[col], pick)())
        names[c] = name
        remaining = remaining.drop(index=c)
    names[int(remaining.index[0])] = "Low-volume all-rounders"
    return names


def records(df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    """Rows of ``df`` as plain dicts, keyed by the stringified index."""
    return {str(k): {str(c): v for c, v in row.items()} for k, row in df.to_dict("index").items()}


def style_map_payload(
    table: pd.DataFrame,
    sm: StyleMap,
    fights_until: pd.Timestamp,
    champions: list[Champion] | None = None,
    champions_as_of: str | None = None,
) -> dict[str, Any]:
    """Build the JSON payload; ``champions`` are matched to fighters by slugified name."""
    champions = champions or []
    champ_by_id = {slugify(c["name"]): c for c in champions}
    cluster_names = name_clusters(table, sm.labels)
    ids = {str(name): slugify(str(name)) for name in table.index}
    id_set = set(ids.values())
    if len(id_set) != len(ids):
        raise ValueError("fighter slugs are not unique")

    rows = records(table)
    pct = records(table[STYLE_FEATURES].rank(pct=True))
    neighbours = sm.all_neighbours(N_NEIGHBOURS)
    labels = pd.Series(sm.labels, index=table.index)
    cluster_of = {str(k): int(v) for k, v in labels.items()}

    fighters = [
        {
            "id": ids[name],
            "name": name,
            "weight_class": row["weight_class"],
            "last_fight": row["last_fight"].date().isoformat(),
            "n_fights": int(row["n_fights"]),
            "cluster": cluster_of[name],
            "rank": None if pd.isna(row["rank"]) else int(row["rank"]),
            "champion": champ_by_id[ids[name]]["division"] if ids[name] in champ_by_id else None,
            "image": champ_by_id[ids[name]]["image"] if ids[name] in champ_by_id else None,
            "coords": {
                "axes": [round(float(v), 3) for v in sm.axes.coords3[i]],
                "similarity": [round(float(v), 3) for v in sm.similarity.coords3[i]],
            },
            "coords_2d": {
                "axes": [round(float(v), 3) for v in sm.axes.coords2[i]],
                "similarity": [round(float(v), 3) for v in sm.similarity.coords2[i]],
            },
            "stats": {f: round(float(row[f]), 2) for f in STYLE_FEATURES},
            "percentiles": {f: round(float(pct[name][f]), 3) for f in STYLE_FEATURES},
            "neighbours": [
                {"id": ids[str(n)], "distance": round(float(d), 3)}
                for n, d in neighbours[name].items()
            ],
        }
        for i, (name, row) in enumerate(rows.items())
    ]

    medians = records(table[STYLE_FEATURES].groupby(labels).median())
    clusters = [
        {
            "id": c,
            "name": cluster_names[c],
            "description": STYLE_DESCRIPTIONS.get(cluster_names[c], ""),
            "size": sum(v == c for v in cluster_of.values()),
            "median_stats": {f: round(float(medians[str(c)][f]), 2) for f in STYLE_FEATURES},
        }
        for c in sorted(cluster_names)
    ]

    axes = [
        {**meta, "weights": AXIS_WEIGHTS[key]} for key, meta in zip(AXIS_WEIGHTS, AXES, strict=True)
    ]
    layouts = [
        {
            **meta,
            # How well each layout keeps every fighter's 10 true nearest neighbours.
            "quality": {
                str(d): {
                    "trustworthiness": round(layout.trustworthiness[d], 3),
                    "knn_kept": round(layout.knn_kept[d], 3),
                }
                for d in (3, 2)
            },
        }
        for meta, layout in zip(LAYOUTS, [sm.axes, sm.similarity], strict=True)
    ]

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": {
            "fights_until": fights_until.date().isoformat(),
            "stats_snapshot": FIGHTER_STATS_SNAPSHOT.date().isoformat(),
            "active_years": ACTIVE_YEARS,
            "min_fights": MIN_FIGHTS,
        },
        "champions_as_of": champions_as_of,
        # All current champions, including ones without enough data to be on the map.
        "champions": [
            {
                "division": c["division"],
                "name": c["name"],
                "since": c["since"],
                "image": c["image"],
                "fighter_id": slugify(c["name"]) if slugify(c["name"]) in id_set else None,
            }
            for c in champions
        ],
        "features": [
            {"key": f, "label": FEATURE_INFO[f][0], "unit": FEATURE_INFO[f][1]}
            for f in STYLE_FEATURES
        ],
        "axes": axes,
        "layouts": layouts,
        "clusters": clusters,
        "fighters": fighters,
    }


def write_json(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def main() -> None:
    fights = load_fights()
    table = build_feature_table(
        load_fighter_stats(), active_fighters(fights, ACTIVE_YEARS), MIN_FIGHTS
    )
    sm = fit_style_map(table, n_clusters=N_CLUSTERS)
    out = WEB_DATA_DIR / "style_map.json"
    champions, fetched = current_champions()
    payload = style_map_payload(table, sm, fights["date"].max(), champions, fetched)
    write_json(payload, out)
    print(f"wrote {len(table)} fighters to {out} (champions fetched {fetched})")
    for c in payload["champions"]:
        if c["fighter_id"] is None:
            print(f"warning: {c['division']} champion {c['name']} is not on the map")

    edges = win_edges(fights)
    names = set(edges["winner"]) | set(edges["loser"])
    ids = {n: slugify(n) for n in names}
    if len(set(ids.values())) != len(ids):
        raise ValueError("fighter slugs are not unique")
    mma = mma_math_payload(edges, ids, champions)
    write_json(mma, WEB_DATA_DIR / "mma_math.json")
    print(f"wrote {len(mma['cycles'])} MMA math cycles (giant loop: {mma['giant_loop_size']})")


if __name__ == "__main__":
    main()
