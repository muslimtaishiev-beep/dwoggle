"""Queue NASA AppEEARS tasks for the demo plots, check on them, download the results.

AppEEARS takes minutes to hours, so submit the evening before the demo:
    python scripts/appeears_demo.py submit     # one task per plot in data/demo_plots.json
    python scripts/appeears_demo.py status
    python scripts/appeears_demo.py fetch      # CSVs -> data/appeears/<plot_id>/, summary -> data/appeears_demo.json

The server reads data/appeears_demo.json at startup (also inside the Cloudflare container), and keeps
polling any demo task listed in data/appeears_tasks.json that isn't finished yet.

If a demo plot's coordinates change, run `submit` again (it re-submits changed plots only).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8")

from bekem.config import BASE_DIR, get_settings  # noqa: E402
from bekem.nasa.appeears import AppEEARS, AppEEARSError, parse_results  # noqa: E402

TASKS = BASE_DIR / "data" / "appeears_tasks.json"
OUT = BASE_DIR / "data" / "appeears"
SUMMARY = BASE_DIR / "data" / "appeears_demo.json"


def _load() -> dict:
    return json.loads(TASKS.read_text(encoding="utf-8")) if TASKS.exists() else {}


def _save(tasks: dict) -> None:
    TASKS.write_text(json.dumps(tasks, indent=2), encoding="utf-8")


def submit(api: AppEEARS) -> None:
    s = get_settings()
    tasks = _load()
    for plot in json.loads(s.demo_path.read_text(encoding="utf-8")):
        prev = tasks.get(plot["id"])
        if prev and (prev["lat"], prev["lon"]) == (plot["lat"], plot["lon"]) and prev.get("status") != "error":
            print(f"{plot['id']}: already submitted ({prev['task_id']}), skipping")
            continue
        task_id = api.submit_points(f"bekem-{plot['id']}", plot["lat"], plot["lon"])
        tasks[plot["id"]] = {"task_id": task_id, "lat": plot["lat"], "lon": plot["lon"], "status": "submitted"}
        _save(tasks)
        print(f"{plot['id']}: submitted {task_id}")


def status(api: AppEEARS) -> bool:
    tasks = _load()
    if not tasks:
        print("Nothing submitted yet. Run: python scripts/appeears_demo.py submit")
        return False
    all_done = True
    for pid, t in tasks.items():
        t["status"] = api.status(t["task_id"])
        all_done &= t["status"] == "done"
        print(f"{pid}: {t['status']}  ({t['task_id']})")
    _save(tasks)
    return all_done


def fetch(api: AppEEARS) -> None:
    summary = json.loads(SUMMARY.read_text(encoding="utf-8")) if SUMMARY.exists() else {}
    for pid, t in _load().items():
        if api.status(t["task_id"]) != "done":
            print(f"{pid}: not done yet")
            continue
        dest = OUT / pid
        dest.mkdir(parents=True, exist_ok=True)
        texts = []
        for f in api.files(t["task_id"]):
            if f["file_name"].endswith(".csv"):
                content = api.download(t["task_id"], f["file_id"])
                (dest / Path(f["file_name"]).name).write_bytes(content)
                texts.append(content.decode("utf-8"))
                print(f"{pid}: saved {f['file_name']}")
        result = parse_results(texts)
        summary[pid] = {"lat": t["lat"], "lon": t["lon"], "task_id": t["task_id"], "result": result}
        print(f"{pid}: LST {len(result['lst'])} years, NDVI {len(result['ndvi'])} years, water {len(result['water'])} years")
    SUMMARY.write_text(json.dumps(summary, indent=1), encoding="utf-8")


def main() -> int:
    action = {"submit": submit, "status": status, "fetch": fetch}.get(sys.argv[1] if len(sys.argv) > 1 else "status")
    if action is None:
        print(__doc__)
        return 2
    s = get_settings()
    try:
        action(AppEEARS(s.earthdata_username, s.earthdata_password))
    except AppEEARSError as e:
        print(f"✗ {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
