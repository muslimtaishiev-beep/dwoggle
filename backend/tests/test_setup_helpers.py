import pytest

from bekem.nasa.appeears import AppEEARS, AppEEARSError, ring_points
from bekem.providers.earthengine import explain_ee_error


@pytest.mark.parametrize(
    "raw, hint",
    [
        ("Please authorize access to your Earth Engine account by running earthengine authenticate", "earthengine authenticate"),
        ("Project 'bekem-kg' is not registered to use Earth Engine.", "code.earthengine.google.com/register"),
        ("Earth Engine API has not been used in project 123 before or it is disabled.", "Enable it"),
        ("Caller does not have required permission to use project bekem-1. Grant the caller...", "authenticate --force"),
        ("Something unexpected", "Something unexpected"),
    ],
)
def test_explain_ee_error(raw, hint):
    assert hint in explain_ee_error(Exception(raw))


def test_ring_points_are_250m_away():
    pts = ring_points(42.0, 74.0)
    assert [p["id"] for p in pts] == ["c", "n", "e", "s", "w"]
    assert abs((pts[1]["latitude"] - 42.0) * 111_320 - 250) < 1


def test_appeears_needs_credentials():
    with pytest.raises(AppEEARSError, match="BEKEM_EARTHDATA_USERNAME"):
        AppEEARS("", "")
