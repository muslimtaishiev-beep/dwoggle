"""Is everything ready for real NASA data? Checks each step and says what to fix.

    python scripts/check_setup.py                    # your personal Earth Engine login (this laptop)
    python scripts/check_setup.py --service-account  # the bekem-api key (same identity Cloud Run uses)
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8")

from bekem.config import BASE_DIR, get_settings  # noqa: E402

OK, BAD, SKIP = "✓", "✗", "–"


def line(mark: str, text: str, fix: str = "") -> None:
    print(f" {mark} {text}")
    if fix:
        print(f"     → {fix}")


def check_env() -> bool:
    env = BASE_DIR / ".env"
    if not env.exists():
        line(BAD, "backend/.env is missing", "Copy backend/.env.example to backend/.env and fill it in.")
        return False
    tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", str(env)], cwd=BASE_DIR, capture_output=True
    ).returncode == 0
    if tracked:
        line(BAD, "backend/.env is tracked by git: your passwords would be published!", "Run: git rm --cached backend/.env")
        return False
    line(OK, "backend/.env exists and git ignores it")
    return True


def check_earth_engine(s, service_account: bool = False) -> bool:
    if service_account and not (s.ee_service_account_key or s.ee_service_account_key_json):
        line(BAD, "No service-account key set",
             "Put the path of the downloaded JSON key in BEKEM_EE_SERVICE_ACCOUNT_KEY in backend/.env "
             "(see backend/AUTH.md, the bekem-api service account).")
        return False
    if s.provider != "earthengine":
        line(BAD, f"BEKEM_PROVIDER is '{s.provider}'", "Set BEKEM_PROVIDER=earthengine in backend/.env for real data.")
        return False
    if not s.ee_project and not (s.ee_service_account_key or s.ee_service_account_key_json):
        line(BAD, "BEKEM_EE_PROJECT is empty", "Put your Earth Engine Cloud project id in backend/.env (see NASA_DATA_SETUP.md step 2).")
        return False
    from bekem.providers.earthengine import explain_ee_error, init_earth_engine

    try:
        init_earth_engine(s)
        import ee

        ee.Number(1).getInfo()
    except Exception as e:  # noqa: BLE001
        line(BAD, "Earth Engine login", explain_ee_error(e))
        return False
    who = "service account" if (s.ee_service_account_key or s.ee_service_account_key_json) else "your Google login"
    line(OK, f"Earth Engine login via {who} (project {s.ee_project or 'from the key'})")
    return True


def check_earthdata(s) -> bool:
    if not s.earthdata_username or not s.earthdata_password:
        line(SKIP, "NASA Earthdata login not set (needed for AppEEARS / Giovanni)",
             "Free account at https://urs.earthdata.nasa.gov/users/new, then set BEKEM_EARTHDATA_USERNAME/PASSWORD.")
        return False
    from bekem.nasa.appeears import AppEEARS, AppEEARSError

    try:
        AppEEARS(s.earthdata_username, s.earthdata_password).login()
    except AppEEARSError as e:
        line(BAD, "NASA Earthdata login", str(e))
        return False
    except Exception as e:  # noqa: BLE001
        line(BAD, "NASA Earthdata login", f"Could not reach AppEEARS: {e}")
        return False
    line(OK, "NASA Earthdata login (AppEEARS accepted it)")
    return True


def check_report(s) -> bool:
    from bekem.faults import nearest_fault
    from bekem.grading import FAULT_SEARCH_KM, grade_all
    from bekem.providers.earthengine import EarthEngineProvider, explain_ee_error

    lat, lon = 42.875, 74.604
    print(f"\n   Full test: Bishkek ({lat}, {lon}), this takes 5-60 s ...")
    started = time.perf_counter()
    try:
        m = EarthEngineProvider(s).fetch(lat, lon, s.radius_m)
    except Exception as e:  # noqa: BLE001
        line(BAD, "Satellite fetch for Bishkek", explain_ee_error(e))
        return False
    took = time.perf_counter() - started
    checks, mood = grade_all(m, nearest_fault(s.faults_path, lon, lat, FAULT_SEARCH_KM), s.radius_m)
    water_years = [y for y, v in m.water_fraction.items() if v is not None]
    line(OK, f"Satellite fetch for Bishkek in {took:.1f} s")
    print(f"     water years {min(water_years, default='-')}–{max(water_years, default='-')} ({len(water_years)}), "
          f"LST years {sum(v is not None for v in m.lst_summer_c.values())}, "
          f"NDVI years {sum(v is not None for v in m.ndvi_season.values())}, slope p90 {m.slope_p90_deg}")
    print("     grades: " + "  ".join(f"{c.id}={c.grade or '?'}" for c in checks) + f"  mood={mood}")
    return True


def main() -> int:
    s = get_settings()
    print("Bekem setup check\n")
    ok = check_env()
    ee_ok = check_earth_engine(s, service_account="--service-account" in sys.argv)
    check_earthdata(s)
    if ee_ok:
        ee_ok = check_report(s)
    print("\nReady for real data." if ok and ee_ok else "\nFix the ✗ lines above, then run this again.")
    return 0 if ok and ee_ok else 1


if __name__ == "__main__":
    sys.exit(main())
