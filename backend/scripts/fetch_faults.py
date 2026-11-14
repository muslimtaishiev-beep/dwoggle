"""Download the GEM Global Active Faults database and clip it to Kyrgyzstan.

Source: Styron, R., and Pagani, M. (2020). The GEM Global Active Faults Database.
Earthquake Spectra, 36(1_suppl), 160-180. https://doi.org/10.1177/8755293020944182
Licence: CC BY-SA 4.0. https://github.com/GEMScienceTools/gem-global-active-faults

Usage:  python scripts/fetch_faults.py
Writes: data/gem_faults_kg.geojson
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

URL = (
    "https://raw.githubusercontent.com/GEMScienceTools/gem-global-active-faults/"
    "master/geojson/gem_active_faults_harmonized.geojson"
)
# Kyrgyzstan bbox padded by ~1 degree so plots near the border still see faults across it.
BBOX = (68.0, 38.0, 81.5, 44.5)  # min_lon, min_lat, max_lon, max_lat
OUT = Path(__file__).resolve().parent.parent / "data" / "gem_faults_kg.geojson"
KEEP_PROPS = ("catalog_id", "catalog_name", "name", "fs_name", "slip_type", "net_slip_rate", "reference")


def _lines(geom: dict) -> list[list[list[float]]]:
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def _in_bbox(lon: float, lat: float) -> bool:
    return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def main() -> int:
    print(f"Downloading {URL} ...")
    with urllib.request.urlopen(URL, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    kept = []
    for feat in data["features"]:
        lines = _lines(feat["geometry"])
        if not any(_in_bbox(lon, lat) for line in lines for lon, lat, *_ in line):
            continue
        props = {k: v for k, v in feat["properties"].items() if k in KEEP_PROPS}
        coords = [[[round(lon, 5), round(lat, 5)] for lon, lat, *_ in line] for line in lines]
        kept.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": {"type": "MultiLineString", "coordinates": coords},
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "source": "GEM Global Active Faults Database (Styron & Pagani 2020), CC BY-SA 4.0",
                "bbox": BBOX,
                "features": kept,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {len(kept)} faults to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
