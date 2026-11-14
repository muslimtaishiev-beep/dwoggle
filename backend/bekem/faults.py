"""Distance to the nearest active fault (GEM Global Active Faults Database).

Runs locally on a clipped GeoJSON, no Earth Engine call. Distances use a local
equirectangular projection around the query point, which is accurate to well under 1%
at the tens-of-km scale that matters for grading.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

EARTH_R_KM = 6371.0088


@dataclass(frozen=True)
class FaultHit:
    distance_km: float
    name: str | None
    slip_type: str | None
    catalog_id: str | None
    nearest_point: tuple[float, float]  # lon, lat
    geometry: list[list[list[float]]]  # the fault's lines, for drawing on the map


@dataclass(frozen=True)
class _Fault:
    props: dict
    lines: list[list[tuple[float, float]]]
    bbox: tuple[float, float, float, float]


@lru_cache(maxsize=4)
def _load(path: str) -> tuple[_Fault, ...]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    faults = []
    for feat in data["features"]:
        geom = feat["geometry"]
        raw = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        lines = [[(float(c[0]), float(c[1])) for c in line] for line in raw if len(line) >= 2]
        if not lines:
            continue
        lons = [p[0] for line in lines for p in line]
        lats = [p[1] for line in lines for p in line]
        faults.append(_Fault(feat["properties"], lines, (min(lons), min(lats), max(lons), max(lats))))
    return tuple(faults)


def _project(lon: float, lat: float, lon0: float, lat0: float) -> tuple[float, float]:
    k = math.radians(1) * EARTH_R_KM
    return (lon - lon0) * k * math.cos(math.radians(lat0)), (lat - lat0) * k


def _closest_on_segment(px, py, ax, ay, bx, by) -> tuple[float, float]:
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
    return ax + t * dx, ay + t * dy


def nearest_fault(path: Path, lon: float, lat: float, search_km: float = 150.0) -> FaultHit | None:
    """Nearest fault within `search_km`, or None if there is none that close."""
    deg_lat = search_km / 111.0
    deg_lon = search_km / (111.0 * max(0.1, math.cos(math.radians(lat))))
    best: tuple[float, _Fault, tuple[float, float]] | None = None

    for fault in _load(str(path)):
        b = fault.bbox
        if b[2] < lon - deg_lon or b[0] > lon + deg_lon or b[3] < lat - deg_lat or b[1] > lat + deg_lat:
            continue
        for line in fault.lines:
            pts = [_project(x, y, lon, lat) for x, y in line]
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                cx, cy = _closest_on_segment(0.0, 0.0, ax, ay, bx, by)
                d = math.hypot(cx, cy)
                if best is None or d < best[0]:
                    best = (d, fault, (cx, cy))

    if best is None or best[0] > search_km:
        return None
    d, fault, (cx, cy) = best
    k = math.radians(1) * EARTH_R_KM
    near_lon = lon + cx / (k * math.cos(math.radians(lat)))
    near_lat = lat + cy / k
    return FaultHit(
        distance_km=d,
        name=fault.props.get("name") or fault.props.get("fs_name"),
        slip_type=fault.props.get("slip_type"),
        catalog_id=fault.props.get("catalog_id"),
        nearest_point=(round(near_lon, 5), round(near_lat, 5)),
        geometry=[[list(p) for p in line] for line in fault.lines],
    )


def faults_in_bbox(path: Path, bbox: tuple[float, float, float, float]) -> dict:
    """GeoJSON of faults touching the bbox, so the frontend can draw a fault layer."""
    feats = []
    for f in _load(str(path)):
        b = f.bbox
        if b[2] < bbox[0] or b[0] > bbox[2] or b[3] < bbox[1] or b[1] > bbox[3]:
            continue
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "name": f.props.get("name") or f.props.get("fs_name"),
                    "slip_type": f.props.get("slip_type"),
                    "catalog_id": f.props.get("catalog_id"),
                },
                "geometry": {"type": "MultiLineString", "coordinates": [[list(p) for p in ln] for ln in f.lines]},
            }
        )
    return {"type": "FeatureCollection", "features": feats}
