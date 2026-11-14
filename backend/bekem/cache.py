"""Small SQLite cache for raw satellite metrics.

Satellite history barely changes week to week, and Earth Engine calls take seconds, so we cache
the language-independent raw metrics and re-grade on every request (grading is microseconds).
It also lets us pre-warm the demo plots so the live demo never waits on Earth Engine.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path


class Cache:
    def __init__(self, path: Path, ttl_s: int):
        self.path = path
        self.ttl_s = ttl_s
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS metrics (key TEXT PRIMARY KEY, value TEXT NOT NULL, created REAL NOT NULL)"
        )
        self._conn.commit()

    def get(self, key: str) -> tuple[dict, float] | None:
        with self._lock:
            row = self._conn.execute("SELECT value, created FROM metrics WHERE key = ?", (key,)).fetchone()
        if row is None or time.time() - row[1] > self.ttl_s:
            return None
        return json.loads(row[0]), row[1]

    def set(self, key: str, value: dict) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO metrics (key, value, created) VALUES (?, ?, ?)",
                (key, json.dumps(value), time.time()),
            )
            self._conn.commit()

    def execute(self, sql: str, params: tuple = ()) -> None:
        with self._lock:
            self._conn.execute(sql, params)
            self._conn.commit()

    def query_one(self, sql: str, params: tuple = ()):
        with self._lock:
            return self._conn.execute(sql, params).fetchone()

    def query_all(self, sql: str, params: tuple = ()) -> list:
        with self._lock:
            return self._conn.execute(sql, params).fetchall()

    def count(self) -> int:
        with self._lock:
            return self._conn.execute("SELECT COUNT(*) FROM metrics").fetchone()[0]
