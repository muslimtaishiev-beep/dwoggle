from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Protocol

Series = dict[int, "float | None"]  # year -> value

# JRC GSW yearly water history ends here; later years are our own Landsat 8/9 classification.
JRC_LAST_YEAR = 2021

SERIES_FIELDS = (
    "water_fraction", "rain_season_mm", "rain_max_day_mm", "runoff_peak_mm", "soil_moisture_mm",
    "lst_summer_c", "ndvi_season",
)


@dataclass
class RawMetrics:
    """Everything the satellite side measures around one point. Grading turns this into A-D."""

    # Flood / mudflow
    water_fraction: Series = field(default_factory=dict)  # % of the circle seen as water, per year
    rain_season_mm: Series = field(default_factory=dict)  # GPM IMERG Mar-Sep total, mm
    rain_max_day_mm: Series = field(default_factory=dict)  # wettest Mar-Sep day, mm (GPM IMERG via Giovanni)
    runoff_peak_mm: Series = field(default_factory=dict)  # wettest Mar-Sep month of storm runoff, mm (GLDAS via Giovanni)
    soil_moisture_mm: Series = field(default_factory=dict)  # May-Sep topsoil moisture, mm (GLDAS via Giovanni)
    elev_point_m: float | None = None  # NASADEM at the plot
    elev_surround_m: float | None = None  # NASADEM median within 1 km
    # Landslide
    slope_p90_deg: float | None = None  # 90th percentile slope inside the circle
    slope_mean_deg: float | None = None
    upslope_p95_deg: float | None = None  # steepest terrain within 1.5 km (mudflow / run-out source)
    landslide_class: int | None = None  # NASA susceptibility 1 (very low) .. 5 (very high), if configured
    # Heat / green
    lst_summer_c: Series = field(default_factory=dict)  # MODIS daytime LST, Jun-Aug mean, deg C
    ndvi_season: Series = field(default_factory=dict)  # MODIS NDVI, May-Sep mean

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "RawMetrics":
        d = dict(d)
        for k in SERIES_FIELDS:
            d[k] = {int(y): v for y, v in (d.get(k) or {}).items()}
        return cls(**d)


class Provider(Protocol):
    name: str

    def fetch(self, lat: float, lon: float, radius_m: int) -> RawMetrics: ...
