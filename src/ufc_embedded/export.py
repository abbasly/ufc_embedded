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

from ufc_embedded.champions import Champion, current_champions, current_ranks
from ufc_embedded.data import (
    PROJECT_ROOT,
    active_fighters,
    attach_odds,
    fighter_summary,
    load_fights,
    load_odds,
    load_profiles,
    load_rankings,
    load_raw,
    public_ids,
)
from ufc_embedded.mma_math import mma_math_payload, win_edges
from ufc_embedded.style_map import (
    AXIS_WEIGHTS,
    STYLE_FEATURES,
    StyleMap,
    build_feature_table,
    fit_style_map,
)
from ufc_embedded.wikipedia import Photo, fighter_photos

SCHEMA_VERSION = 5
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
    ids: dict[str, str],
    fights_until: pd.Timestamp,
    champions: list[Champion] | None = None,
    ranks: dict[str, int] | None = None,
    rankings_date: str | None = None,
    photos: dict[str, Photo] | None = None,
) -> dict[str, Any]:
    """Build the JSON payload.

    ``table`` is indexed by UFCStats fighter id; ``ids`` maps those to public URL ids.
    ``ranks`` and ``photos`` are keyed by fighter id too.
    """
    champions, ranks, photos = champions or [], ranks or {}, photos or {}
    belt = {c["fighter"]: c["division"] for c in champions if c["fighter"]}
    cluster_names = name_clusters(table, sm.labels)

    rows = records(table)
    pct = records(table[STYLE_FEATURES].rank(pct=True))
    neighbours = sm.all_neighbours(N_NEIGHBOURS)
    labels = pd.Series(sm.labels, index=table.index)
    cluster_of = {str(k): int(v) for k, v in labels.items()}

    fighters = [
        {
            "id": ids[fid],
            "name": row["name"],
            "weight_class": row["weight_class"],
            "last_fight": row["last_fight"].date().isoformat(),
            "n_fights": int(row["n_fights"]),
            "record": {k: int(row[k]) for k in ("wins", "losses", "draws")},
            "cluster": cluster_of[fid],
            "rank": ranks.get(fid),
            "champion": belt.get(fid),
            "image": photos.get(fid),
            "coords": {
                "axes": [round(float(v), 3) for v in sm.axes.coords3[i]],
                "similarity": [round(float(v), 3) for v in sm.similarity.coords3[i]],
            },
            "coords_2d": {
                "axes": [round(float(v), 3) for v in sm.axes.coords2[i]],
                "similarity": [round(float(v), 3) for v in sm.similarity.coords2[i]],
            },
            "stats": {f: round(float(row[f]), 2) for f in STYLE_FEATURES},
            "percentiles": {f: round(float(pct[fid][f]), 3) for f in STYLE_FEATURES},
            "neighbours": [
                {"id": ids[str(n)], "distance": round(float(d), 3)}
                for n, d in neighbours[fid].items()
            ],
        }
        for i, (fid, row) in enumerate(rows.items())
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

    on_map = set(table.index)
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": {
            "fights_until": fights_until.date().isoformat(),
            "active_years": ACTIVE_YEARS,
            "min_fights": MIN_FIGHTS,
        },
        "champions_as_of": rankings_date,
        # All current champions, including ones without enough data to be on the map.
        "champions": [
            {
                "division": c["division"],
                "name": c["name"],
                "image": photos.get(fid) if (fid := c["fighter"]) else None,
                "fighter_id": ids[fid] if fid and fid in on_map else None,
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


def photos_by_id(
    profiles: pd.DataFrame, fighter_ids: list[str], search: bool = False
) -> dict[str, Photo]:
    """Wikipedia photos per fighter id; skipped for namesakes, since we can't tell whose it is."""
    names = profiles.loc[fighter_ids, "name"].astype(str)
    unique = names[~profiles["name"].duplicated(keep=False).loc[fighter_ids]]
    by_name = fighter_photos(sorted(set(unique)), search=search)
    return {str(i): by_name[n] for i, n in unique.items() if n in by_name}


def main() -> None:
    raw = load_raw()
    fights = attach_odds(load_fights(raw), load_odds())
    profiles = load_profiles(raw)
    summary = fighter_summary(fights)
    ids = public_ids(profiles, summary)
    rankings, rankings_date = load_rankings()
    champions = current_champions(rankings, profiles)
    ranks = current_ranks(rankings, profiles)

    table = build_feature_table(profiles, active_fighters(fights, ACTIVE_YEARS), MIN_FIGHTS)
    sm = fit_style_map(table, n_clusters=N_CLUSTERS)
    champ_ids = [c["fighter"] for c in champions if c["fighter"]]
    photos = photos_by_id(profiles, sorted(set(table.index) | set(champ_ids)), search=True)
    payload = style_map_payload(
        table, sm, ids, fights["date"].max(), champions, ranks, rankings_date, photos
    )
    out = WEB_DATA_DIR / "style_map.json"
    write_json(payload, out)
    print(
        f"wrote {len(table)} fighters to {out} (fights until {payload['source']['fights_until']})"
    )
    for c in payload["champions"]:
        if c["fighter_id"] is None:
            print(f"warning: {c['division']} champion {c['name']} is not on the map")

    edges = win_edges(fights)
    in_graph = sorted(set(edges["winner"]) | set(edges["loser"]))
    mma = mma_math_payload(edges, profiles, ids, champions, photos_by_id(profiles, in_graph))
    write_json(mma, WEB_DATA_DIR / "mma_math.json")
    print(f"wrote {len(mma['cycles'])} MMA math cycles (giant loop: {mma['giant_loop_size']})")


if __name__ == "__main__":
    main()
