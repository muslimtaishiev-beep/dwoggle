"""Kyrgyzstan-only coverage: the real border, enclaves as holes, a small tolerance, a clear refusal."""

import pytest
from fastapi.testclient import TestClient

from bekem.config import get_settings
from bekem.coverage import covers, inside_country
from bekem.main import app

BORDER = get_settings().border_path


@pytest.mark.parametrize("name, lat, lon", [
    ("Bishkek", 42.875, 74.604), ("Osh", 40.53, 72.80), ("Karakol", 42.49, 78.39), ("Batken", 40.062, 70.819),
    ("Naryn", 41.43, 75.99), ("Kara-Suu demo point, on the border", 40.705, 72.873), ("Lenin Peak, on the border", 39.35, 72.88),
])
def test_kyrgyzstan_is_covered(name, lat, lon):
    assert covers(BORDER, lat, lon), name


@pytest.mark.parametrize("name, lat, lon", [
    ("Almaty", 43.236, 76.946), ("Andijan", 40.783, 72.344), ("Tashkent", 41.31, 69.28), ("Khujand", 40.28, 69.62),
    ("Kashgar", 39.47, 75.99), ("Sokh enclave (Uzbekistan)", 39.96, 71.13), ("Fergana District, Uzbekistan", 40.30, 71.80),
])
def test_neighbours_are_not(name, lat, lon):
    assert not covers(BORDER, lat, lon), name


def test_enclave_is_a_hole_in_the_country():
    assert inside_country(BORDER, 40.0, 71.35)          # Kyrgyz land around the Sokh enclave
    assert not inside_country(BORDER, 39.96, 71.13)     # Sokh itself


def test_outside_coverage_is_a_clear_localized_refusal():
    with TestClient(app) as c:
        r = c.get("/api/report", params={"lat": 43.236, "lon": 76.946, "lang": "ru"})
        assert r.status_code == 422
        assert r.json()["detail"] == {"code": "outside_coverage",
                                      "message": "Пока есть данные только по Кыргызстану. Выберите место внутри страны."}
        assert c.get("/api/report", params={"lat": 55.75, "lon": 37.6}).json()["detail"]["code"] == "outside_coverage"
