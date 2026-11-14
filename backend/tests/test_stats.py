import math

from bekem.stats import mann_kendall, sens_slope, trend


def test_sens_slope_on_a_line():
    x = list(range(2000, 2026))
    y = [2 * v + 1 for v in x]
    slope, intercept = sens_slope(x, y)
    assert slope == 2
    assert intercept == 1


def test_sens_slope_ignores_an_outlier():
    x = list(range(20))
    y = [0.5 * v for v in x]
    y[7] = 1000
    slope, _ = sens_slope(x, y)
    assert math.isclose(slope, 0.5)


def test_mann_kendall_monotonic_series():
    s, var_s, z, p = mann_kendall(list(range(10)))
    assert s == 45
    assert var_s == 125  # n(n-1)(2n+5)/18
    assert math.isclose(z, 44 / math.sqrt(125))
    assert p < 1e-4


def test_mann_kendall_tie_correction():
    _, var_s, _, _ = mann_kendall([1, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    assert var_s == (10 * 9 * 25 - 2 * 1 * 9) / 18


def test_flat_series_is_not_significant():
    tr = trend(list(range(2000, 2026)), [5.0] * 26)
    assert tr.slope == 0
    assert not tr.significant
    assert tr.direction == "none"


def test_noisy_no_trend_is_not_significant():
    vals = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6, 2, 6, 4, 3, 3]
    tr = trend(list(range(2000, 2026)), vals)
    assert not tr.significant


def test_trend_drops_missing_and_needs_eight_points():
    years = list(range(2000, 2010))
    assert trend(years, [1, None, None, 4, None, 6, None, 8, 9, None]) is None
    tr = trend(years, [1, 2, None, 4, 5, 6, 7, 8, 9, 10])
    assert tr.n == 9 and tr.significant and tr.direction == "increasing"
    assert math.isclose(tr.change, 9)  # slope 1/yr * (2009 - 2000)
