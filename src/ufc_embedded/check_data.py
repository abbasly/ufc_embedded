"""Compare freshly built site data with the current version, before it goes live.

The automatic data refresh (.github/workflows/data-refresh.yml) stops here if a dataset arrives
broken or cut short: new fights only ever add to these files, so a site that suddenly has far
fewer fighters, or older results than yesterday, means the input is wrong.

    python -m ufc_embedded.check_data <folder with the current JSON> <folder with the new JSON>
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

FILES = ("style_map.json", "predictor.json", "mma_math.json")
# Active fighters come and go a little (the 3-year window), so some drop is normal.
MIN_FIGHTERS_KEPT = 0.9
# Fights are only ever added, apart from the odd correction upstream.
MIN_FIGHTS_KEPT = 0.98


def _size(value: Any) -> int:
    """A count stored either as a number or as the list of things themselves."""
    return value if isinstance(value, int) else len(value)


def problems(file: str, old: dict[str, Any], new: dict[str, Any]) -> list[str]:
    """What's wrong with ``new`` compared with ``old`` (empty if it looks fine)."""
    found = []
    for key, keep in (("fighters", MIN_FIGHTERS_KEPT), ("fights", MIN_FIGHTS_KEPT)):
        if key in old:
            before, after = _size(old[key]), _size(new.get(key, []))
            if after < keep * before:
                found.append(f"{file}: {key} fell from {before} to {after}")
    # ISO dates compare correctly as text.
    if "fights_until" in old and str(new.get("fights_until", "")) < str(old["fights_until"]):
        found.append(
            f"{file}: data went back in time, {old['fights_until']} to {new.get('fights_until')}"
        )
    return found


def summary(old: dict[str, dict[str, Any]], new: dict[str, dict[str, Any]]) -> str:
    """One line for the change log: what this refresh brought."""
    mma, predictor = new["mma_math.json"], new["predictor.json"]
    return (
        f"fights until {mma['fights_until']} (was {old['mma_math.json']['fights_until']})"
        f" · {_size(mma['fights'])} fights"
        f" · {_size(new['style_map.json']['fighters'])} on the style map"
        f" · {_size(predictor['fighters'])} with predictions"
        f" · {len(predictor['upcoming'])} upcoming cards"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("old", type=Path)
    parser.add_argument("new", type=Path)
    args = parser.parse_args()
    old = {file: json.loads((args.old / file).read_text()) for file in FILES}
    new = {file: json.loads((args.new / file).read_text()) for file in FILES}
    found = [p for file in FILES for p in problems(file, old[file], new[file])]
    for p in found:
        print(p, file=sys.stderr)
    if found:
        sys.exit(1)
    print(summary(old, new))


if __name__ == "__main__":
    main()
