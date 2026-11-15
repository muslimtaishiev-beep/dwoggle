"""Is a point in Kyrgyzstan? The country's real border (Natural Earth 1:10m), not a rectangle.

The border includes the enclaves inside Kyrgyzstan as holes (Sokh and Shakhimardan: Uzbekistan;
Vorukh: Tajikistan). Points within TOLERANCE_KM of the border still count, because a 1:10m border can be
off by a few hundred metres and the 300 m analysis circle of a border-town plot crosses it anyway.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

TOLERANCE_KM = 3.0
_KM_PER_DEG = math.radians(1) * 6371.0088

Ring = list[tuple[float, float]]  # (lon, lat)


@lru_cache(maxsize=2)
def _polygons(path: str) -> tuple[tuple[Ring, ...], ...]:
    geom = json.loads(Path(path).read_text(encoding="utf-8"))["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return tuple(tuple([(float(x), float(y)) for x, y in ring] for ring in poly) for poly in polys)


def _in_ring(lon: float, lat: float, ring: Ring) -> bool:
    """Ray casting: count crossings of a ray going east from the point."""
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def _distance_to_ring_km(lon: float, lat: float, ring: Ring) -> float:
    kx = _KM_PER_DEG * math.cos(math.radians(lat))
    best = math.inf
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        ax, ay = (x1 - lon) * kx, (y1 - lat) * _KM_PER_DEG
        bx, by = (x2 - lon) * kx, (y2 - lat) * _KM_PER_DEG
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg2))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def inside_country(path: Path, lat: float, lon: float) -> bool:
    for outer, *holes in _polygons(str(path)):
        if _in_ring(lon, lat, outer) and not any(_in_ring(lon, lat, hole) for hole in holes):
            return True
    return False


def covers(path: Path, lat: float, lon: float, tolerance_km: float = TOLERANCE_KM) -> bool:
    """Inside Kyrgyzstan, or within tolerance_km of its border (on either side)."""
    if inside_country(path, lat, lon):
        return True
    return any(_distance_to_ring_km(lon, lat, ring) <= tolerance_km for poly in _polygons(str(path)) for ring in poly)
