"""Download Kyrgyzstan's border (Natural Earth 1:10m, public domain) for the coverage check.

Usage:  python scripts/fetch_border.py
Writes: data/kg_border.geojson
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
    "ne_10m_admin_0_countries.geojson"
)
OUT = Path(__file__).resolve().parent.parent / "data" / "kg_border.geojson"


def main() -> int:
    print(f"Downloading {URL} ...")
    with urllib.request.urlopen(URL, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    kg = next(f for f in data["features"] if f["properties"].get("ADM0_A3") == "KGZ")
    geom = kg["geometry"]
    polygons = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    rounded = [[[[round(x, 5), round(y, 5)] for x, y, *_ in ring] for ring in poly] for poly in polygons]
    OUT.write_text(
        json.dumps(
            {
                "type": "Feature",
                "properties": {"name": "Kyrgyzstan", "source": "Natural Earth 1:10m admin 0 (public domain)"},
                "geometry": {"type": "MultiPolygon", "coordinates": rounded},
            }
        ),
        encoding="utf-8",
    )
    points = sum(len(ring) for poly in rounded for ring in poly)
    print(f"Wrote {len(rounded)} polygon(s), {points} points to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
