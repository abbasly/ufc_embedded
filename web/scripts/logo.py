"""Draws the site's logo: the cage graph. The octagon is a graph of eight fighters, its fence the
edges, a few chords for the closest pairs across it, each node sized by how connected it is, and
the fighter in focus in red. Writes the SVGs (logo.svg on transparent for the header, favicon.svg
on a dark tile for browser tabs); scripts/icons.mjs turns them into the PNG app icons.

    python3 scripts/logo.py
"""

from math import cos, radians, sin
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"
INK, RED, TILE = "#eceef1", "#e03131", "#18191c"
SIZES = [4.6, 2.8, 3.2, 6, 2.6, 3.8, 3, 2.6]  # node radii; the red one (3) is the biggest
CHORDS = [(3, 0), (3, 5), (5, 0), (1, 5)]


def mark(scale: float = 1.0, cx: float = 32, cy: float = 32) -> str:
    r = 25 * scale
    v = [(cx + r * cos(radians(22.5 + 45 * k)), cy + r * sin(radians(22.5 + 45 * k))) for k in range(8)]
    pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in v)
    out = [f'<polygon points="{pts}" fill="none" stroke="{INK}" stroke-width="{2.6 * scale:.2f}" stroke-linejoin="round" opacity=".85"/>']
    for a, b in CHORDS:
        (x1, y1), (x2, y2) = v[a], v[b]
        out.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{INK}" stroke-width="{1.8 * scale:.2f}" stroke-linecap="round" opacity=".4"/>')
    for i, (x, y) in enumerate(v):
        out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{SIZES[i] * scale:.2f}" fill="{RED if i == 3 else INK}"/>')
    return "\n  ".join(out)


def svg(body: str) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  {body}\n</svg>\n'


# Header and anywhere on the dark site: the mark alone.
(PUBLIC / "logo.svg").write_text(svg(mark()))
# Browser tabs (light or dark): on a dark tile, the mark a little smaller to leave a margin.
(PUBLIC / "favicon.svg").write_text(svg(f'<rect width="64" height="64" rx="14" fill="{TILE}"/>\n  ' + mark(0.82)))
# App icons: a full square (the phone rounds it); maskable keeps the mark in the middle 60%.
(PUBLIC / "icon-source.svg").write_text(svg(f'<rect width="64" height="64" fill="{TILE}"/>\n  ' + mark(0.78)))
(PUBLIC / "icon-maskable-source.svg").write_text(svg(f'<rect width="64" height="64" fill="{TILE}"/>\n  ' + mark(0.6)))
print("logo.svg, favicon.svg, icon sources written")
