# Putting Bekem on Google (Firebase Hosting + Cloud Run)

Everything lives in the Google project **bekem-514710**, under one address:

```
https://bekem-514710.web.app/          → frontend (Firebase Hosting)
https://bekem-514710.web.app/api/...   → backend (our Docker image on Cloud Run, region europe-west1)
```

On Cloud Run the backend runs **as the `bekem-api` service account**, so production has no key file at all.
GitHub builds and deploys it when you press a button, and nothing needs installing on your laptop.

## 1. Turn on billing: the Blaze plan (3 min)

Cloud Run and Cloud Build need a billing account, even when you stay inside the free tier.

1. https://console.firebase.google.com/project/bekem-514710/usage/details → **Modify plan → Blaze**, then add a card.
2. Set a safety limit at https://console.cloud.google.com/billing/budgets → **Create budget** → $5, with alerts at 50/90/100%.

Expected cost for a hackathon: **$0**. The free tier covers 2 million requests and 180,000 vCPU-seconds a month on
Cloud Run, plus 10 GB of hosting. Cloud Run sleeps (costs nothing) when nobody uses it.

## 2. One script in Cloud Shell (3 min)

1. Open https://console.cloud.google.com/?project=bekem-514710 and click the **>_** icon (top right, "Activate Cloud Shell").
2. In the terminal that opens, paste:
   ```bash
   curl -sLO https://raw.githubusercontent.com/muslimtaishiev-beep/dwoggle/main/deploy/firebase/setup_gcp.sh && bash setup_gcp.sh
   ```
   (If the repo is private: click **⋮ → Upload** in Cloud Shell, upload `deploy/firebase/setup_gcp.sh`, then run `bash setup_gcp.sh`.)
3. It turns on the services, sets the roles, and lets **only this GitHub repository** deploy, with no key.
   There's nothing to copy: the last line says "All set".

## 3. GitHub secrets (1 min)

https://github.com/muslimtaishiev-beep/dwoggle/settings/secrets/actions → **New repository secret**, one for each:

| Name | Value |
|---|---|
| `EARTHDATA_USERNAME` | your NASA Earthdata username (same as in `backend/.env`) |
| `EARTHDATA_PASSWORD` | your NASA Earthdata password |
| `ELEVENLABS_API_KEY` | ElevenLabs API key, for Dwoggle's voice (optional: without it the app uses the browser's voice) |

## 4. Deploy

**Actions → Deploy to Firebase → Run workflow.** It runs the tests, builds the backend on Cloud Build,
starts it on Cloud Run, publishes the frontend, and finally checks `https://bekem-514710.web.app/api/health`.
The first run takes about 5–8 minutes. A green ✓ means the site is live.

Open https://bekem-514710.web.app/api/health. You want `"status": "ok"`, `"provider": "earthengine"`, `"auth": "firebase"`.

## Frontend

The frontend lives at the root of the repo (Vite, React, TypeScript; see the main [README](../../README.md)).
The workflow checks it (types, lint, tests), builds it with `npm ci && npm run build` into `dist/`, and Firebase
Hosting publishes `dist/` ([firebase.json](../../firebase.json)); every path that is not a file gets `index.html`,
so the app's own routes work. The frontend calls the API on the same address: `fetch("/api/report?lat=..&lon=..")`.


## Before the demo

Cloud Run sleeps after about 15 minutes without requests. The first request then takes 5–10 s to wake it, and it
computes the 3 demo plots by itself in the background. **Open `/api/health` a couple of minutes before you present.**
To keep it awake all day, set `--min-instances 1` in the workflow (costs roughly $1–2 a day; set it back afterwards).

## Common problems

| You see | Do this |
|---|---|
| Script: `Billing account ... not found` / `FAILED_PRECONDITION` | Step 1: the Blaze plan isn't on yet |
| Workflow: `Permission denied` / `iam.serviceAccounts.actAs` | Run `setup_gcp.sh` again; it is safe to repeat |
| Workflow: `unauthorized_client` / `Permission 'iam.serviceAccounts.getAccessToken' denied` | Run `setup_gcp.sh` again (step 5/6 links the repo) |
| `/api/health` says `degraded` with an Earth Engine permission error | The `bekem-api` roles: run the script again |
| The site shows the placeholder instead of the API | You opened `/`, not `/api/health`. That's correct |

## Backup: run from the laptop

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn bekem.main:app --port 8000
```

It's reachable on the same Wi-Fi at `http://<laptop-ip>:8000`.
