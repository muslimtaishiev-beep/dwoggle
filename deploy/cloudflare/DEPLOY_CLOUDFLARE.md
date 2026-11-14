# Putting Bekem on Cloudflare

One Cloudflare Worker serves **both** halves on one address:

```
https://bekem.<you>.workers.dev/          → frontend (static files)
https://bekem.<you>.workers.dev/api/...   → backend (our Python Docker image, running as a Cloudflare Container)
```

It costs **$5/month** (Workers Paid plan, container time included). Nothing needs installing on your laptop:
GitHub builds and deploys it when you press a button.

## 1. Cloudflare account (5 min)

1. Sign up at https://dash.cloudflare.com/sign-up
2. **Workers & Pages → Plans**, choose **Workers Paid** ($5/month). Containers need it.
3. Copy your **Account ID** (right sidebar on the Workers & Pages overview).
4. **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"** template. If the list shows a
   **Containers** permission, set it to *Edit* too. Create it and copy the token. It's shown only once.

## 2. A server key for Earth Engine (5 min)

Your personal Google login only works on this laptop. The server needs its own key.

1. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=bekem-514710
2. **Create service account**, name it `bekem-api`, then **Create and continue**.
3. Add the roles **Earth Engine Resource Viewer** and **Service Usage Consumer**, plus, for sign-in,
   **Cloud Datastore User** and **Firebase Authentication Admin** (see [AUTH.md](../../backend/AUTH.md)). Click **Done**.
4. Click the new account → **Keys → Add key → Create new key → JSON**. A file downloads.
5. Rename it to `bekem-sa-key.json` and put it in the `backend` folder. Git ignores this name, so it never gets pushed.
6. Add this line to `backend\.env`:
   ```
   BEKEM_EE_SERVICE_ACCOUNT_KEY=bekem-sa-key.json
   ```
7. Test it:
   ```powershell
   cd backend
   .\.venv\Scripts\python.exe scripts\check_setup.py --service-account
   ```
   You should see "Earth Engine login via service account ✓".

## 3. GitHub secrets (2 min)

On GitHub: **repo → Settings → Secrets and variables → Actions → New repository secret**, twice:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 1.4 |
| `CLOUDFLARE_ACCOUNT_ID` | the Account ID from step 1.3 |

## 4. Deploy

1. Push the code to GitHub.
2. **Actions → Deploy to Cloudflare → Run workflow**. It runs the tests, builds the Docker image and deploys
   (the first run takes about 5 min).
3. In Cloudflare: **Workers & Pages → bekem → Settings → Variables and Secrets → Add**, type **Secret**:

   | Name | Value |
   |---|---|
   | `BEKEM_EE_SERVICE_ACCOUNT_KEY_JSON` | the **whole contents** of `bekem-sa-key.json` (open it in VS Code, copy everything) |
   | `BEKEM_EARTHDATA_USERNAME` | your NASA Earthdata username |
   | `BEKEM_EARTHDATA_PASSWORD` | your NASA Earthdata password |

4. Run the workflow once more, so the container starts with the secrets.
5. Open `https://bekem.<you>.workers.dev/api/health`. You want `"status": "ok"` and `"provider": "earthengine"`.

## Frontend

The Worker serves whatever is in `deploy/cloudflare/public/` (a placeholder page for now). When the frontend
is built, point `assets.directory` in [wrangler.jsonc](wrangler.jsonc) at its build folder, e.g. `"../../frontend/dist"`.
The frontend then calls the API on the same address (`fetch("/api/report?lat=..&lon=..")`), so there's no CORS setup.

## Before the demo

The container sleeps after 30 min without requests. Waking it takes a few seconds, and then it computes the
3 demo plots by itself in the background (about 2 s each). **Open `/api/health` 2 minutes before you present.**

## Backup: run from the laptop (free, 5 min)

If Cloudflare acts up on demo day, the laptop can serve the API through a free Cloudflare Tunnel:

```powershell
winget install --id Cloudflare.cloudflared
cd backend
.\.venv\Scripts\python.exe -m uvicorn bekem.main:app --port 8000
# in a second terminal:
cloudflared tunnel --url http://localhost:8000
```

It prints a public `https://….trycloudflare.com` address. Point the frontend at it. It works while the laptop is on.

## Common problems

| You see | Do this |
|---|---|
| `/api/health` says `degraded` and the error mentions *permission* | Step 2.3: the service account is missing a role |
| Workflow fails with *Authentication error* | The API token is wrong or lacks Workers/Containers permission (step 1.4) |
| Workflow fails with *containers require a paid plan* | Step 1.2 |
| `/api/...` returns the placeholder page | `run_worker_first` was removed from `wrangler.jsonc`. Put it back |
