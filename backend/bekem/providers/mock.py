"""Synthetic data for frontend development without Earth Engine credentials.

Numbers are deterministic per location (same tap -> same answer) but NOT real.
Every report built from this provider carries provider="mock".
"""

from __future__ import annotations

import hashlib
import random
from datetime import date

from .base import RawMetrics


class MockProvider:
    name = "mock"

    def fetch(self, lat: float, lon: float, radius_m: int) -> RawMetrics:
        seed = int(hashlib.sha256(f"{lat:.3f},{lon:.3f}".encode()).hexdigest()[:12], 16)
        rnd = random.Random(seed)
        last = date.today().year - 1
        years = range(2000, last + 1)

        wet_p = rnd.choice([0.0, 0.05, 0.15, 0.35])
        lst0, lst_trend = rnd.uniform(28, 42), rnd.choice([0.0, 0.03, 0.09, 0.14])
        ndvi0, ndvi_trend = rnd.uniform(0.15, 0.6), rnd.choice([0.002, 0.0, -0.003, -0.008])
        elev = rnd.uniform(700, 2200)
        slope = rnd.choice([2.0, 6.0, 14.0, 24.0, 33.0])

        return RawMetrics(
            water_fraction={y: round(rnd.uniform(1, 12), 2) if rnd.random() < wet_p else 0.0 for y in years},
            rain_season_mm={y: round(rnd.uniform(150, 450), 1) for y in years if y > 2000},
            rain_max_day_mm={y: round(rnd.uniform(10, 45), 1) for y in years if y > 2000},
            runoff_peak_mm={y: round(rnd.uniform(0.1, 6), 2) for y in years},
            soil_moisture_mm={y: round(rnd.uniform(15, 30), 2) for y in years},
            elev_point_m=round(elev, 1),
            elev_surround_m=round(elev + rnd.uniform(-15, 15), 1),
            slope_p90_deg=slope,
            slope_mean_deg=round(slope * 0.6, 1),
            upslope_p95_deg=round(slope + rnd.uniform(0, 15), 1),
            landslide_class=None,
            lst_summer_c={y: round(lst0 + lst_trend * (y - 2000) + rnd.gauss(0, 0.8), 2) for y in years},
            ndvi_season={y: round(max(0.02, ndvi0 + ndvi_trend * (y - 2000) + rnd.gauss(0, 0.02)), 4) for y in years},
        )
