"""Compute and cache the demo plots, then print their grades.

Run before a demo so the judges never wait on Earth Engine:
    python scripts/prewarm.py            # use cache if fresh
    python scripts/prewarm.py --refresh  # force recompute
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8")

from bekem.cache import Cache  # noqa: E402
from bekem.config import get_settings  # noqa: E402
from bekem.providers import make_provider  # noqa: E402
from bekem.report import ReportService  # noqa: E402


def main() -> int:
    s = get_settings()
    svc = ReportService(s, make_provider(s), Cache(s.cache_path, s.cache_ttl_days * 86400))
    refresh = "--refresh" in sys.argv
    ok = True
    for plot in json.loads(s.demo_path.read_text(encoding="utf-8")):
        r = svc.build(plot["lat"], plot["lon"], "en", refresh=refresh)
        grades = {c["id"]: c["grade"] for c in r["checks"]}
        got = {**grades, "mood": r["mood"]["id"]}
        misses = {k: (v, got.get(k)) for k, v in plot.get("expect", {}).items() if got.get(k) != v}
        ok &= not misses
        print(f"\n{plot['id']} ({plot['lat']}, {plot['lon']})  provider={r['provider']} cached={r['cached']}")
        print(f"  mood: {r['mood']['id']}")
        for c in r["checks"]:
            print(f"  {c['grade'] or '?'}  {c['title']:<14} {c['summary']}")
        if misses:
            print(f"  !! expected vs got: {misses}")
    print("\nAll demo expectations met." if ok else "\nSome demo plots do not match expectations (see !! lines).")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
