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
    CAREER_FEATURES,
    STYLE_FEATURES,
    StyleMap,
    axes_projection,
    build_feature_table,
    career_stats,
    fit_style_map,
    reliability,
    self_match,
    style_appearances,
)
from ufc_embedded.wikipedia import Photo, fighter_photos

SCHEMA_VERSION = 6
WEB_DATA_DIR = PROJECT_ROOT / "web" / "public" / "data"

ACTIVE_YEARS = 3
RECORD_COLS = ["wins", "losses", "draws"]
MIN_FIGHTS = 3
N_CLUSTERS = 5
N_NEIGHBOURS = 5
N_DIVISION_NEIGHBOURS = 5

# Label, unit and group of each style stat, in the order the fighter panel shows them.
FEATURE_INFO: dict[str, tuple[str, str, str]] = {
    "significant_strikes_landed_per_minute": ("Strikes landed / min", "per min", "Striking"),
    "significant_striking_accuracy": ("Striking accuracy", "%", "Striking"),
    "knockdowns_per_15_minutes": ("Knockdowns / 15 min", "per 15 min", "Striking"),
    "significant_strikes_absorbed_per_minute": ("Strikes absorbed / min", "per min", "Striking"),
    "significant_strike_defence": ("Strike defence", "%", "Striking"),
    "body_strikes": ("Body strikes", "% of strikes", "Shot selection"),
    "leg_strikes": ("Leg strikes", "% of strikes", "Shot selection"),
    "clinch_strikes": ("Strikes in the clinch", "% of strikes", "Shot selection"),
    "ground_strikes": ("Strikes on the ground", "% of strikes", "Shot selection"),
    "average_takedowns_landed_per_15_minutes": ("Takedowns / 15 min", "per 15 min", "Grappling"),
    "takedown_accuracy": ("Takedown accuracy", "%", "Grappling"),
    "control_time": ("Control time", "% of fight", "Grappling"),
    "average_submissions_attempted_per_15_minutes": (
        "Sub attempts / 15 min",
        "per 15 min",
        "Grappling",
    ),
    "takedown_defense": ("Takedown defence", "%", "Grappling"),
}

# Display text for style_map.AXIS_WEIGHTS, in the same order.
AXES = [
    {"label": "Grappling", "low": "Stays standing", "high": "Wrestling & submissions"},
    {"label": "Striking", "low": "Low output", "high": "High volume, accuracy & power"},
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
    "Dominant wrestlers": "Most takedowns and control time; do their damage on the ground.",
    "Kickboxers": "Kick-heavy strikers: lots of leg and body kicks, rarely shoot for takedowns.",
    "Clinch fighters": "Fight in the clinch and to the body, mix in takedowns.",
    "Volume boxers": "High-output strikers who head-hunt with their hands; the most knockdowns.",
    "Low-volume all-rounders": "Lower striking output; mix in takedowns and some control.",
}


def name_clusters(table: pd.DataFrame, labels: Any) -> dict[int, str]:
    """Name k=5 clusters from their median stats, so names don't depend on k-means ids.
    Each rule picks from the clusters not yet named."""
    med = table[STYLE_FEATURES].groupby(labels).median()
    if len(med) != len(STYLE_DESCRIPTIONS):
        return {int(c): f"Style {int(c) + 1}" for c in med.index}
    names: dict[int, str] = {}
    remaining = med
    for name, col in [
        ("Dominant wrestlers", "control_time"),
        ("Kickboxers", "leg_strikes"),
        ("Clinch fighters", "clinch_strikes"),
        ("Volume boxers", "significant_strikes_landed_per_minute"),
    ]:
        c = int(remaining.index.to_numpy()[remaining[col].to_numpy().argmax()])
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
    weights: pd.Series | None = None,
    check: dict[str, dict[str, float]] | None = None,
) -> dict[str, Any]:
    """Build the JSON payload.

    ``table`` is indexed by UFCStats fighter id; ``ids`` maps those to public URL ids.
    ``ranks`` and ``photos`` are keyed by fighter id too. ``weights`` are the embedding's
    stat weights, and ``check`` the self-match test of each embedding version.
    """
    champions, ranks, photos = champions or [], ranks or {}, photos or {}
    belt = {c["fighter"]: c["division"] for c in champions if c["fighter"]}
    cluster_names = name_clusters(table, sm.labels)

    rows = records(table)
    pct = records(table[STYLE_FEATURES].rank(pct=True))
    neighbours = sm.all_neighbours(N_NEIGHBOURS)
    division = sm.all_neighbours(N_DIVISION_NEIGHBOURS, among=table["weight_class"])

    def similar(nb: pd.Series) -> list[dict[str, Any]]:
        score = sm.similarity_score(nb.to_numpy())
        return [
            {"id": ids[str(n)], "distance": round(float(d), 3), "similarity": round(float(s))}
            for (n, d), s in zip(nb.items(), score, strict=True)
        ]

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
            # The standardised stats the map is fitted on, for fighter arithmetic ("math").
            "vec": [round(float(v), 4) for v in sm.xs[i]],
            "percentiles": {f: round(float(pct[fid][f]), 3) for f in STYLE_FEATURES},
            "neighbours": similar(neighbours[fid]),
            "division_neighbours": similar(division[fid]),
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
            {
                "key": f,
                "label": label,
                "unit": unit,
                "group": group,
                "weight": round(float(weights[f]), 3) if weights is not None else 1.0,
            }
            for f, (label, unit, group) in FEATURE_INFO.items()
        ],
        # How well the embedding recognises a fighter from half their fights (see
        # style_map.self_match), for the old 8-stat embedding and the one on the map.
        "embedding_check": check or {},
        "axes": axes,
        "layouts": layouts,
        "clusters": clusters,
        # Fighter arithmetic (A - B + C) in the browser: the fighters' "vec" times these
        # weights is the embedding similarity is measured in, "typical_distance" turns a
        # distance into the 0-100 score, and "projection" places any vector on Style axes.
        # Added after schema 6 without a bump: the page only offers the feature when present.
        # "keys" is the order of the numbers in "vec" and "weights" (not the "features" order).
        "math": {
            "keys": STYLE_FEATURES,
            "weights": _rounded(
                list(weights[STYLE_FEATURES])
                if weights is not None
                else [1.0] * len(STYLE_FEATURES)
            ),
            "typical_distance": round(sm.typical_distance, 4),
            "projection": _rounded(axes_projection(sm.xs), 6),
        },
        "fighters": fighters,
    }


def _rounded(value: Any, digits: int = 4) -> Any:
    """Numbers rounded for the JSON, however deep in lists and dicts."""
    if isinstance(value, dict):
        return {k: _rounded(v, digits) for k, v in value.items()}
    if isinstance(value, list):
        return [_rounded(v, digits) for v in value]
    return round(float(value), digits)


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

    active = active_fighters(fights, ACTIVE_YEARS)
    app = style_appearances(raw)
    app = app[app["id"].isin(active.index)]
    table = build_feature_table(app, active, MIN_FIGHTS).join(profiles[["name", *RECORD_COLS]])
    weights = reliability(app)
    sm = fit_style_map(career_stats(app).loc[table.index], N_CLUSTERS, weights=weights)
    check = {
        "career_stats": self_match(app, CAREER_FEATURES),
        "style_stats": self_match(app, STYLE_FEATURES, weights),
    }
    print(f"embedding self-match: {check}")
    champ_ids = [c["fighter"] for c in champions if c["fighter"]]
    photos = photos_by_id(profiles, sorted(set(table.index) | set(champ_ids)), search=True)
    payload = style_map_payload(
        table, sm, ids, fights["date"].max(), champions, ranks, rankings_date, photos,
        weights, check,
    )  # fmt: skip
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
    mma = mma_math_payload(edges, profiles, ids, champions, photos_by_id(profiles, in_graph), ranks)
    write_json(mma, WEB_DATA_DIR / "mma_math.json")
    print(f"wrote {len(mma['cycles'])} MMA math cycles (giant loop: {mma['giant_loop_size']})")


if __name__ == "__main__":
    main()
