"""Trend statistics: Sen's slope and the Mann-Kendall test.

Pure Python on purpose: these run on ~27 numbers per check, and keeping them dependency-free
means anyone can read exactly how "significant ✓" is decided.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import median


@dataclass(frozen=True)
class Trend:
    n: int
    slope: float  # units per year (Sen's slope)
    intercept: float  # value at year 0 of the series' own x axis, so y = intercept + slope * x
    change: float  # slope * (last_year - first_year): total change over the record
    tau: float  # Kendall's tau
    z: float
    p_value: float  # two-sided
    significant: bool  # p < alpha
    direction: str  # "increasing" | "decreasing" | "none"

    def as_dict(self) -> dict:
        return {
            "n": self.n,
            "slope_per_year": round(self.slope, 5),
            "intercept": round(self.intercept, 5),
            "change": round(self.change, 4),
            "tau": round(self.tau, 4),
            "z": round(self.z, 4),
            "p_value": round(self.p_value, 5),
            "significant": self.significant,
            "direction": self.direction,
        }


def sens_slope(x: list[float], y: list[float]) -> tuple[float, float]:
    """Sen (1968) slope estimator and the Conover intercept."""
    slopes = [
        (y[j] - y[i]) / (x[j] - x[i])
        for i in range(len(x))
        for j in range(i + 1, len(x))
        if x[j] != x[i]
    ]
    if not slopes:
        return 0.0, median(y) if y else 0.0
    slope = median(slopes)
    intercept = median(y) - slope * median(x)
    return slope, intercept


def mann_kendall(y: list[float]) -> tuple[float, float, float, float]:
    """Original Mann-Kendall test with tie correction.

    Returns (S, var_S, z, two-sided p). Uses the normal approximation, which is standard for n >= 10.
    """
    n = len(y)
    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            d = y[j] - y[i]
            s += (d > 0) - (d < 0)

    counts: dict[float, int] = {}
    for v in y:
        counts[v] = counts.get(v, 0) + 1
    tie_term = sum(t * (t - 1) * (2 * t + 5) for t in counts.values() if t > 1)
    var_s = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0

    if var_s <= 0:
        return float(s), var_s, 0.0, 1.0
    if s > 0:
        z = (s - 1) / math.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / math.sqrt(var_s)
    else:
        z = 0.0
    p = math.erfc(abs(z) / math.sqrt(2))
    return float(s), var_s, z, p


def trend(years: list[float], values: list[float], alpha: float = 0.05) -> Trend | None:
    """Sen's slope + Mann-Kendall on a yearly series. Missing values (None/NaN) are dropped."""
    pairs = [(x, v) for x, v in zip(years, values) if v is not None and not math.isnan(v)]
    if len(pairs) < 8:
        return None
    xs = [float(p[0]) for p in pairs]
    ys = [float(p[1]) for p in pairs]
    n = len(ys)

    slope, intercept = sens_slope(xs, ys)
    s, _, z, p = mann_kendall(ys)
    tau = s / (n * (n - 1) / 2)
    significant = p < alpha
    direction = "none" if not significant else ("increasing" if s > 0 else "decreasing")
    return Trend(
        n=n,
        slope=slope,
        intercept=intercept,
        change=slope * (xs[-1] - xs[0]),
        tau=tau,
        z=z,
        p_value=p,
        significant=significant,
        direction=direction,
    )
