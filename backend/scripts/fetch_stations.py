"""Build data/noaa_stations_kg.json: Kyrgyz weather stations with long summer temperature records.

Source: NOAA NCEI (the archive behind Climate Data Online), GHCN station list + Global Summary of the Month.
No token needed. Usage:  python scripts/fetch_stations.py
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from bekem.nasa.noaa import DATA_URL, MIN_SUMMERS, STATIONS_PATH  # noqa: E402

STATIONS_URL = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-stations.txt"


def main() -> int:
    print("Downloading GHCN station list ...")
    text = httpx.get(STATIONS_URL, timeout=180).text
    kg = []
    for row in text.splitlines():
        if row.startswith("KG"):
            kg.append({
                "id": row[0:11],
                "lat": float(row[12:20]),
                "lon": float(row[21:30]),
                "elev_m": float(row[31:37]),
                "name": row[41:71].strip().title(),
            })
    print(f"{len(kg)} Kyrgyz stations; checking summer TMAX coverage since 2000 ...")

    summers: dict[str, set[str]] = defaultdict(set)
    for i in range(0, len(kg), 25):
        ids = ",".join(s["id"] for s in kg[i : i + 25])
        r = httpx.get(
            DATA_URL,
            params={"dataset": "global-summary-of-the-month", "stations": ids, "dataTypes": "TMAX",
                    "startDate": "2000-01-01", "endDate": "2026-12-31", "format": "json"},
            timeout=180,
        )
        r.raise_for_status()
        for rec in r.json():
            if rec.get("TMAX") not in (None, "") and rec["DATE"][5:7] in ("06", "07", "08"):
                summers[rec["STATION"]].add(rec["DATE"][:4])

    keep = []
    for s in kg:
        n = len(summers.get(s["id"], ()))
        if n >= MIN_SUMMERS:
            keep.append({**s, "summers": n})
            print(f"  ✓ {s['name']:<18} {n} summers")
    STATIONS_PATH.write_text(json.dumps(keep, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {len(keep)} stations to {STATIONS_PATH}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
