# Dwoggle

Tap a place on the map and Dwoggle reads 25 years of NASA satellite data for this area: five checks (greenery, heat, flood, landslide, earthquake), each a risk signal, never official permission. NASA Space Apps Challenge 2026.

- The frontend is this folder (Vite, React, TypeScript): everything below.
- [backend/](backend/): the API (FastAPI and Google Earth Engine), see [backend/README.md](backend/README.md).
- [deploy/firebase/](deploy/firebase/DEPLOY_FIREBASE.md): one address for both. Firebase Hosting serves the frontend's build (`dist/`) and forwards `/api/*` to the backend on Cloud Run; GitHub Actions → "Deploy to Firebase" builds and publishes both.

| Page | What it is |
| --- | --- |
| `/` | The main page: create an account or log in (Google, or email and password). A signed-in visitor goes straight on to the map, or to the dig while the backend still needs their profile. |
| `/welcome` | The dig: four questions after the first sign-in (language, why you came, what worries you, phone number), asked while Dwoggle digs one screen deeper per answer. |
| `/map` | The map. Tap any place on the 3D satellite map and Dwoggle digs into the ground there; the report opens beside the map: a short fact and a grade for each of the five checks (earthquake, flood, landslide, heat, greenery). "Layers" opens the round core with one layer per check and its 25-year chart. Dwoggle answers questions about the report from his hole below the map. |

The map and the report work without an account, at `/map`; signing in only adds a profile. Dwoggle covers Kyrgyzstan only (`KYRGYZSTAN` in [src/config.ts](src/config.ts), the box the backend checks): the map cannot leave the country, the search finds places only in it, and a tap or a shared link outside it gets a short notice instead of a report. The app is a single page with its own small router ([src/router.ts](src/router.ts)), so the host must serve `index.html` for every path; any other address leads to the main page.

## Run

```sh
npm install
npm run dev        # http://localhost:5173, /api goes to the backend on http://localhost:8000
npm run dev:mock   # the same, but the report comes from mock/report.json: no backend needed
npm test           # unit tests, including the wording rules
npm run art        # regenerate the placeholder pixel art
npm run build      # type check + production build
```

## The backend

The backend lives in [backend/](backend/) on `main` (FastAPI, see its README). The site calls it on its own domain, at `/api` (`API_BASE_URL` in [src/config.ts](src/config.ts)): Firebase Hosting serves the site and forwards `/api/*` to the backend on Cloud Run (backend's [deploy/firebase/DEPLOY_FIREBASE.md](deploy/firebase/DEPLOY_FIREBASE.md)). In development, the dev server forwards `/api` to `http://localhost:8000` ([vite.config.ts](vite.config.ts)); set `BACKEND_URL=…` to use another address. To run the backend without Earth Engine credentials, start it with `BEKEM_PROVIDER=mock`: the numbers are made up but the format is real.

```
GET /api/report?lat=42.8238&lon=74.6044&lang=en
```

`lang` is the app's language, any of its 11. The backend names the tapped place in it (`location.place`, from OpenStreetMap; the report header shows it with the "© OpenStreetMap contributors" credit the licence asks for). The backend's own sentences come in the nearest of `en`, `ru`, `ky`, but the app does not show them: it builds every sentence from the message keys. Each check lists the sources its grade is built from in `source_ids`; the resolution badge, the source and the "non-NASA data" label come from those.

## Accounts

Sign-in is done by Firebase Auth in the browser ([src/auth/firebase.ts](src/auth/firebase.ts)): Google, or email and password (with a reset link). The Firebase project settings are `FIREBASE_CONFIG` in [src/config.ts](src/config.ts); they are public by design. The SDK is loaded after the page has rendered, and if it cannot load the app simply stays signed out. Each sign-in method must be enabled in the Firebase console (Authentication → Sign-in method), and every domain the app is served from must be listed under Authorized domains (`localhost` is listed by default).

After the first sign-in, the dig asks four questions: language, why they came (eight choices; "something else" asks for a few words), which hazards worry them, and a phone number. The answers are sent to the backend when the last one is given ([src/auth/accountApi.ts](src/auth/accountApi.ts), following [backend/AUTH.md](backend/AUTH.md)):

| Call | What for |
|---|---|
| `GET /api/me` | after every sign-in: the saved profile and `profile_complete`. The dig is shown only while the backend answers `false`; if it cannot be reached, the user goes to the map and is not asked again |
| `PUT /api/me/profile` | `{country, phone, purpose, purpose_note, concerns, lang}` (the country is always `KG`); a `422 {field, code}` puts Dwoggle back at that question with the reason |
| `DELETE /api/me` | "Delete account" in the header: removes the profile, phone included, and the sign-in account |

Every call carries the user's Firebase ID token. The backend keeps the profile in Firestore with its own service account; the browser never touches Firestore, and its rules should deny everything (backend/AUTH.md, step 5).

The backend keeps every answer, language and concerns included. This browser keeps a copy without the phone number (`localStorage`), so the app opens in the right language at once and still works when the backend is out of reach; it is forgotten on sign-out. With `npm run dev:mock`, [mock/mockAccount.ts](mock/mockAccount.ts) answers the three calls in memory with the backend's own checks; signing in still goes to Firebase.

"Sign in with Google" works on the Firebase Hosting addresses (`bekem-514710.web.app`, `bekem-514710.firebaseapp.com`) as they are; any other domain must be added in the Firebase console: Authentication → Settings → Authorized domains.

The phone question starts with Kyrgyzstan's dialling code, +996.

## Languages

Dwoggle speaks three languages ([src/i18n/i18n.ts](src/i18n/i18n.ts)): Kyrgyz, Russian and English. A visitor first gets their browser's language (Russian when the browser speaks none of the three); a signed-in user gets the language they chose in the dig. The map's header has a quick switch (KY, RU, EN), and the settings under the gear repeat it for phones.

All texts are in [src/i18n/translations.json](src/i18n/translations.json). The translations were made by AI and should be checked by a native speaker before launch, especially the hazard wording. The tests fail if a language is missing a text, if a translation drops a `{placeholder}`, or if any text uses a forbidden word: "safe", "dangerous" or "plot" in English, and each language's own equivalents.

## API contract

[mock/report.json](mock/report.json) is a real response of the backend (run with its mock provider). [src/api/parseReport.ts](src/api/parseReport.ts) checks every response at runtime and maps it into the app's types ([src/api/types.ts](src/api/types.ts)); a response it cannot read shows the error state.

- `grade` is `"A" | "B" | "C" | "D" | null`. `null` shows "no data". The app never estimates a value.
- Each check sends `messages`: a list of `{key, params, text}`. The app builds every sentence itself from `api.<key>` in [src/i18n/translations.json](src/i18n/translations.json), in all three languages and under the app's wording rules; the backend's `text`, `summary`, `title`, mood `title`/`line` and `disclaimer` are never shown. A param starting with `@` is a key itself (`"@susc.3"` → "moderate"). If a key or a param is unknown, that sentence shows its raw params instead, so new backend messages appear (untranslated) rather than vanish. Add new keys under `api.` in every language.
- The chart of a check is its first entry in `series` (yearly `points`, gaps allowed, `unit`, and `trend` with `slope_per_year`, `p_value`, `significant` and a two-point `line`). A series without `trend` (water seen) is drawn without a trend line.
- The resolution badge, source and "non-NASA data" label come from the series' `resolution_m` and `source_id`, looked up in `sources`. Landslide and earthquake have no series; their sources are named in [src/report/sources.ts](src/report/sources.ts), which also holds the short source names.
- Read but not shown yet: `verification` (second opinions). Not read: `metrics`, `extras`, `provider`, `cached`, `computed_at`, the other series of flood.

## Trying other states with the mock

`npm run dev:mock` answers every report from the mock. With plain `npm run dev`, add `?mock` to the app URL to get the mock for that page (e.g. `http://localhost:5173/map?mock`), or `?mock=<scenario>` for another state, e.g. `http://localhost:5173/map?mock=error`. Only `/api/report` is mocked; the rest of `/api` still goes to the backend.

| Scenario  | Response                                                  |
| --------- | --------------------------------------------------------- |
| `slow`    | normal report after 3 s (loading state)                   |
| `error`   | HTTP 500                                                  |
| `invalid` | body that does not match the contract                     |
| `empty`   | report with no checks                                     |
| `nodata`  | every grade `null`                                        |
| `badkey`  | flood sends a message key missing from translations       |

## Translations and wording

All user-facing text is in [src/i18n/translations.json](src/i18n/translations.json). An empty `ru` or `ky` entry falls back to English. Tests fail if any string contains "safe", "dangerous" or "plot", or if a language is missing a key.

## Address search

The field over the map looks up an address when the form is submitted, lists the places found, and moves the map to the one you pick. Nothing is checked until you tap the map. It uses Nominatim, the free OpenStreetMap geocoder: no API key, at most one request per second, and no search-as-you-type, which is why the app does not search on every keystroke. Places in Kyrgyzstan are listed first. The geocoder is set in `GEOCODER` in [src/config.ts](src/config.ts) and read by [src/api/geocode.ts](src/api/geocode.ts). The typed address is sent to that service.

## Stepping through the layers

Next/back buttons, a horizontal swipe, the arrow keys, or a tap on a layer of the core. "Skip to report" is always visible. With `prefers-reduced-motion` there is no dig and no rising core: the figure opens straight away. `DIG_MIN_MS` in [src/config.ts](src/config.ts) sets the shortest time the dig is shown.

## Brand artwork

The sign-in page and the dig follow the designer's screens. Art lives in [public/brand/](public/brand/):

- `dwoggle-head.png`: the logo's head, traced from the design and made from the designer's file `Dwoggle mascot v3 helmet.png`.
- `dwoggle-body.webp`, `dwoggle-map-left.webp`, `dwoggle-map-back.webp`, `dwoggle-map-shadow.webp`, `dwoggle-paw-left.webp`, `dwoggle-paw-right.webp`: standing Dwoggle on the sign-in page, cut into layers so he can close his map like a book (his left paw brings the left half over onto the right) and open it again. Made from the same file with `python3 scripts/mascot-layers.py "Dwoggle mascot v3 helmet.png"` (needs pillow, numpy, scipy), which also writes the arm's motion to `src/brand/standingDwoggleRig.ts` and `src/brand/StandingDwoggleFold.css`. What the map hid (his chest, the side of his body) and the left arm are drawn in the drawing's own flat colours; with the map open the layers add up to the drawing itself.
- `dwoggle-digging.webp`: **temporary**, cut out of a screenshot of the onboarding design. Replace it with the original digging artwork (transparent PNG, same name, any size).
- In development, `/dev/dig` shows the dig without signing in (saving at the end fails on purpose).

## Restyling

- All colors, fonts, spacing and sizes are CSS variables in [src/styles/tokens.css](src/styles/tokens.css); components only use `var(--…)`.
- Text and headings use Golos Text, which covers English, Russian and Kyrgyz. The pixel face Press Start 2P is kept for the Dwoggle wordmark only.
- Placeholder art of Dwoggle is in [public/bekem/](public/bekem/), generated by [scripts/placeholder-art.mjs](scripts/placeholder-art.mjs). To use final artwork, replace the files and keep their names. `run.svg` is a sprite sheet with two square frames side by side.
- The map is one component, [MapView.tsx](src/components/MapView.tsx). It shows a free 3D satellite map (MapLibre: Esri World Imagery over open terrain tiles, with OpenStreetMap buildings standing up; no API key) and falls back to the flat OpenStreetMap map if the browser has no WebGL or the 3D map does not load. All providers are set in [src/config.ts](src/config.ts) (`MAP_3D`, `MAP_FLAT`).
- Product and design notes for the Impeccable skill: [PRODUCT.md](PRODUCT.md) and `.impeccable/`.
