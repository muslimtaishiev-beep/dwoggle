# Bekem backend

FastAPI service: takes a lat/lon in Kyrgyzstan, looks at a 300 m circle around it, and returns five
A–D grades, Bekem's mood, 25-year series for the charts, and second opinions from other sources.

```
tap → GET /api/report?lat&lon&lang                       cached: ~70 ms · first time: ~2–10 s
        ├─ Earth Engine, one call        Landsat water · NASADEM · MODIS LST · MODIS NDVI   → grades
        ├─ NASA Giovanni (in parallel)   GPM IMERG rain · GLDAS runoff & soil ("Hydrology Time Series") → charts
        ├─ GEM active faults             local GeoJSON                                     → earthquake grade
        ├─ NOAA station (CDO archive)    summer air temperature trend                      → second opinion
        ├─ NASA AppEEARS (background)    MOD11A2 · MOD13Q1 · MOD44W, minutes to hours      → second opinion
        ├─ grading.py: fixed rules → A–D, mood   (extras never change a grade)
        └─ i18n.py: EN / RU / KY text
```

Setup for real data: [NASA_DATA_SETUP.md](NASA_DATA_SETUP.md). Hosting (Firebase + Cloud Run): [deploy/firebase/DEPLOY_FIREBASE.md](../deploy/firebase/DEPLOY_FIREBASE.md).

## Run it

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows; on mac/linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

**Frontend work, no Google account needed:** set `BEKEM_PROVIDER=mock` in `.env`. The satellite
numbers are fake (fault distances are still real), and every response says `"provider": "mock"`.

**Real data:** follow [NASA_DATA_SETUP.md](NASA_DATA_SETUP.md), then `python scripts/check_setup.py`.

```bash
uvicorn bekem.main:app --reload     # http://localhost:8000/docs
pytest                              # offline tests: stats, rules, parsing, API
```

## Before the demo

```bash
python scripts/prewarm.py --refresh
```

This computes the three plots in `data/demo_plots.json` and checks them against their expected grades.
The Kara-Suu point is a town-centre placeholder, since users can tap anywhere. On Cloud Run the
backend warms the demo plots by itself at startup.

AppEEARS for the demo plots: `scripts/appeears_demo.py submit` (the evening before), later `fetch`. The
result goes to `data/appeears_demo.json`, which the server loads at startup.

## API

| Endpoint | What it does |
|---|---|
| `GET /api/report?lat=42.815&lon=74.62&lang=ru` | The report card. `refresh=true` skips the cache. |
| `GET /api/report/verification?lat=..&lon=..` | Only the second opinions. Poll every ~30 s while AppEEARS says `pending`. |
| `GET /api/geocode?q=Кара-Суу&lang=ru` | Address search inside Kyrgyzstan (Nominatim, throttled + cached). |
| `GET /api/faults?bbox=74,42.5,75,43` | Active faults as GeoJSON, for a map layer. |
| `GET /api/demo?lang=ky` | The demo plots. |
| `GET /api/methodology?lang=en` | "How we grade": every rule and dataset. |
| `GET /api/i18n?lang=ky` | All backend strings (greeting, moods, check titles…). |
| `GET /api/health` | Provider status, cache size. |
| `GET /api/auth/options`, `GET/PUT/DELETE /api/me…` | Sign-in profile (country, phone, why they're here). See [AUTH.md](AUTH.md). |
| `GET /api/me/saved`, `PUT /api/me/saved` `{lat, lon, name}`, `DELETE /api/me/saved?lat=..&lon=..` | Places the signed-in user saved from the map, newest first (Firestore `saved/{uid}`, at most 50). Deleted with the account. |
| `POST /api/voice/speak` `{text, lang}` | Dwoggle's answer read aloud by ElevenLabs, as MP3 (cached in memory). No sign-in needed; 12 per minute per visitor. |
| `POST /api/voice/listen?lang=ky` (body: the recording, e.g. `audio/webm`) | What was said, by ElevenLabs speech-to-text: `{text}`. At most 1 MB. |
| `POST /api/reports` `{lat, lon, lang}` | Signed in only. Builds the full report for a point and keeps a copy under a number like `DW-2026-AB12CD` (Firestore `reports/{id}`), with a SHA-256 fingerprint of its data: `{id, created_at, lat, lon, place, grades, fingerprint, report}`. 10 a day per user (`BEKEM_REPORTS_PER_DAY`), then `429 {code: reports_daily_limit, limit}`. |
| `GET /api/reports/{id}` | Anyone: when, where and the grades of a numbered report, to check a printed copy. Its owner also gets `report`. Unknown number: 404. |
| `GET /api/me/reports` | The signed-in user's reports, newest first. |

Dwoggle's voice needs `BEKEM_ELEVENLABS_API_KEY` in `backend/.env` (and the `ELEVENLABS_API_KEY` secret for the live
site); `BEKEM_ELEVENLABS_VOICE_ID` picks the voice. Without a key both voice endpoints answer `503 {code: voice_disabled}`
and the app falls back to the browser's own voice.

Errors: `422` = point outside Kyrgyzstan or bad params, `429` = rate limit, `502` = Earth Engine failed
(show "Bekem couldn't dig, try again"), `503` = provider not configured.

### Report shape (trimmed)

```jsonc
{
  "location": {"lat": 42.815, "lon": 74.62, "radius_m": 300},   // snapped to 3 decimals
  "mood": {"id": "alert", "title": "Bekem is alert", "line": "Some warning signs. Check before you buy."},
  "checks": [
    {
      "id": "heat",                       // flood | landslide | earthquake | heat | green (always this order)
      "title": "Heat",
      "grade": "C",                       // A–D, or null = not enough data (show "?")
      "summary": "2.3°C hotter in summer than in 2000. This trend is statistically real.",
      "messages": [{"key": "heat.up_sig", "params": {"change": 2.3, "start": 2000}, "text": "..."}],
      "metrics": {"change_c": 2.31, "p_value": 0.0004},
      "series": [{
        "id": "lst", "label": "Summer ground temperature (Jun-Aug, °C)", "unit": "°C",
        "points": [{"year": 2000, "value": 38.1}, ...],         // value may be null (gap)
        "trend": {
          "slope_per_year": 0.092, "change": 2.31, "p_value": 0.0004, "significant": true,
          "line": [{"year": 2000, "value": 37.9}, {"year": 2025, "value": 40.2}],   // draw this
          "label": "significant ✓"
        }
      }]
    }
    // earthquake.metrics also has nearest_point + fault_geometry: draw the fault on the map
    // every series has resolution_m + source_id: show it as a badge ("~28 km" means regional, not the plot)
    // every check has "verification": [{source, status, independent, text, ...}], shown under the row:
    //   noaa_station: agrees | differs | unavailable   (direction only: air vs ground surface)
    //   appeears mod11a2/mod13q1: same | differs | pending   ("independent": false, same MODIS data)
    //   appeears mod44w: agrees | differs | pending     ("independent": true, a separate sensor)
  ],
  "extras": {"giovanni": "ok", "noaa": "ok", "appeears": "pending"},
  // lang: as requested (11 app languages); text_lang: the en/ru/ky our texts are in (kk/uz → ru, others → en)
  // location.place: OpenStreetMap name in the requested language, e.g.
  //   {"name": "Кара-Суу", "locality": "Кара-Суу", "region": "Ошская область", "display": "Кара-Суу, Ошская область",
  //    "attribution": "© OpenStreetMap contributors"}  (null if the name service is busy; show the attribution)
  // every check has "source_ids": the sources its GRADE is built from; every id is listed in "sources"
  "disclaimer": "...", "sources": [...],
  "provider": "earthengine", "cached": true, "computed_at": "2026-11-14T10:00:00+00:00"
}
```

Charts per check: flood → water % per year (each point says `jrc` or `landsat_own`), season rain,
wettest day, runoff, topsoil moisture; heat → LST (+ station TMAX inside its verification); green → NDVI;
landslide and earthquake have no time series.

## Grading

All thresholds are constants at the top of [bekem/grading.py](bekem/grading.py), and `/api/methodology`
publishes them as-is. Summary:

- **Flood/mudflow:** years with water ≥1% of the circle: 0 A, 1–2 B, 3–5 C, 6+ D. One grade worse if the plot
  is ≥5 m below the 1 km median and water was seen. At least C if it's below its surroundings with ≥25° slopes within 1.5 km.
- **Landslide:** p90 slope <8° A, 8–15 B, 15–25 C, 25+ D; optional NASA susceptibility map; at least B under ≥30° terrain.
- **Earthquake:** nearest GEM fault <2 km D, 2–5 C, 5–10 B, >10 A.
- **Heat:** Sen's slope + Mann-Kendall (p<0.05) on Jun–Aug MODIS LST. Significant warming <1°C B, 1–3 C, 3+ D.
- **Green:** same test on May–Sep NDVI. Significant loss <10% B, 10–25% C, 25%+ D.
- **Mood:** whistling if flood or landslide is D, alert if anything is C/D, otherwise relaxed.

## Known limits (worth saying out loud)

- **Street-level mudflows are mostly invisible to the flood check.** Landsat passes every 8–16 days, often
  through cloud, so a flood that lasts a few hours rarely shows up. Expect a D only where water stays for
  weeks or keeps coming back, or where the mudflow-path rule applies (a low plot under steep slopes).
- **Water 2022+** is our own Landsat 8/9 MNDWI classification, because JRC's yearly history ends at 2021.
  On the Issyk-Kul shore the two agree (9–10% vs 8–9% of the circle). Mountain shadow is filtered by slope,
  but bright snow/ice edges can still slip through.
- **Giovanni** has a monthly compute quota (`/api/health` shows the share used). With caching we use almost none of it.
- **A permanent river within 300 m counts as water every year.** That's honest, but a house 250 m from the Chuy may get a harsh flood grade.
- **Fault lines** come from the HimaTibetMap compilation inside GEM, which is regional-scale. Distances are good to
  roughly ±1 km, so a 1.9 km vs 2.1 km D/C split is within the noise.
- **Landslide susceptibility** isn't in the Earth Engine catalog. Download the GeoTIFF from
  https://gpm.nasa.gov/landslides/data.html, upload it as an asset, and set `BEKEM_LANDSLIDE_ASSET`. Without it, slope alone decides.
- **Kyrgyz strings** in [bekem/i18n.py](bekem/i18n.py) need a native speaker's check before launch.
- Rate limiting and the cache live in one process, which is fine for one instance. If you scale out, move them to Redis.

## Refresh fault data

```bash
python scripts/fetch_faults.py    # GEM database → data/gem_faults_kg.geojson (clipped to Kyrgyzstan + 1°)
```
