# Switching on real NASA data

Bekem reads NASA satellite data (MODIS, NASADEM, Landsat, GPM) in two ways:

- **Google Earth Engine** hosts these NASA datasets and computes the report in seconds. This is what makes a tap feel instant.
- **NASA's own tools** from the challenge list (AppEEARS, and later Giovanni) check the same places directly at NASA.

Both are free. Setup takes about 20 minutes, once.

## 1. NASA Earthdata account (5 min)

1. Sign up at https://urs.earthdata.nasa.gov/users/new
2. Log in, open **Applications → Authorized Apps → Approve More Applications**, and approve **NASA GESDISC DATA ARCHIVE**. Giovanni needs this.

## 2. Google Earth Engine project (10 min)

1. Open https://code.earthengine.google.com/register with a Google account.
2. Choose **Unpaid usage**, then a noncommercial type (student/academic/nonprofit).
3. Create a new Cloud project, e.g. `bekem-kg`. Copy its **project ID**.

## 3. Log in on this computer (1 min)

```powershell
cd backend
.\.venv\Scripts\earthengine.exe authenticate
```

A browser opens. Pick your Google account and click **Allow**.

(No need to "activate" the venv. On Windows that's often blocked by the script policy. Calling the `.exe` inside `.venv\Scripts` directly always works, and so does `.\.venv\Scripts\python.exe scripts\check_setup.py`.)

## 4. Fill in `backend/.env`

Copy `.env.example` to `.env`, then set these lines:

```
BEKEM_PROVIDER=earthengine
BEKEM_EE_PROJECT=bekem-kg
BEKEM_EARTHDATA_USERNAME=your-nasa-username
BEKEM_EARTHDATA_PASSWORD=your-nasa-password
```

`.env` is in `.gitignore`, so it is never pushed. Never paste passwords anywhere else in the repo.

## 5. Check everything

```powershell
.\.venv\Scripts\python.exe scripts/check_setup.py
```

Every line should show ✓. If a line shows ✗, the arrow under it says exactly what to do.

## 6. Before the demo

```powershell
.\.venv\Scripts\python.exe scripts/appeears_demo.py submit   # queue NASA AppEEARS for the 3 demo plots. Do this the evening before!
.\.venv\Scripts\python.exe scripts/prewarm.py --refresh      # compute and cache the 3 demo plots, check their grades
.\.venv\Scripts\python.exe scripts/appeears_demo.py status   # later: all 3 say "done"?
.\.venv\Scripts\python.exe scripts/appeears_demo.py fetch    # download the AppEEARS results
.\.venv\Scripts\python.exe -m uvicorn bekem.main:app --reload
```

## Common problems

| You see | Do this |
|---|---|
| `Not logged in to Earth Engine` | Run `earthengine authenticate` again |
| `project is not registered` | Step 2, then put the ID in `BEKEM_EE_PROJECT` |
| `Earth Engine API is not enabled` | Open the link it prints and click **Enable** |
| `Earthdata rejected the username/password` | Log in at urs.earthdata.nasa.gov to check them |
| AppEEARS status stays `queued` for hours | Normal on busy days. That's why we submit the night before |
