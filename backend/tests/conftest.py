import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Must be set before bekem.config is imported anywhere.
os.environ["BEKEM_PROVIDER"] = "mock"
os.environ["BEKEM_CACHE_PATH"] = str(Path(tempfile.mkdtemp()) / "cache.sqlite3")
os.environ["BEKEM_RATE_LIMIT_PER_MIN"] = "0"
os.environ["BEKEM_CHAT_RATE_LIMIT_PER_MIN"] = "0"
os.environ["BEKEM_CHAT_DAILY_PER_IP"] = "0"
os.environ["BEKEM_CHAT_DAILY_TOTAL"] = "0"
os.environ["BEKEM_WARM_DEMO_ON_START"] = "0"
os.environ["BEKEM_NOAA_ENABLED"] = "0"  # tests never touch the network
os.environ["BEKEM_PLACE_NAMES"] = "0"
# Ignore any real keys in backend/.env: tests use dev tokens and an in-memory user store.
for key in ("EE_PROJECT", "EE_SERVICE_ACCOUNT_KEY", "EE_SERVICE_ACCOUNT_KEY_JSON", "FIREBASE_PROJECT",
            "FIREBASE_SERVICE_ACCOUNT_KEY", "FIREBASE_SERVICE_ACCOUNT_KEY_JSON", "EARTHDATA_USERNAME", "EARTHDATA_PASSWORD",
            "ANTHROPIC_API_KEY"):
    os.environ[f"BEKEM_{key}"] = ""
