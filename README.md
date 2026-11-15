# Dwoggle

Tap a place on the map and Dwoggle reads 25 years of NASA satellite data for this area: five checks (greenery, heat, flood, landslide, earthquake), each a risk signal, never official permission. NASA Space Apps Challenge 2026.

- The frontend is this folder (Vite, React, TypeScript): everything below.
- [backend/](backend/): the API (FastAPI and Google Earth Engine), see [backend/README.md](backend/README.md).
- [RESOURCES.md](RESOURCES.md): the NASA data and resources (and the space agency partner resources) Dwoggle uses, and how.
- [deploy/firebase/](deploy/firebase/DEPLOY_FIREBASE.md): one address for both. Firebase Hosting serves the frontend's build (`dist/`) and forwards `/api/*` to the backend on Cloud Run; GitHub Actions → "Deploy to Firebase" builds and publishes both.

| Page | What it is |
| --- | --- |
| `/` | The main page: create an account or log in (Google, or email and password). A signed-in visitor goes straight on to the map, or to the dig while the backend still needs their profile. |
| `/welcome` | Four questions after the first sign-in (language, why you came, what worries you, phone number), one at a time, from Dwoggle standing with his map. |
| `/map` | The map. Tap any place on the 3D satellite map and Dwoggle digs into the ground there; the report opens beside the map: a short fact and a grade for each of the five checks (earthquake, flood, landslide, heat, greenery). "Layers" opens the round core with one layer per check and its 25-year chart. Pressing Dwoggle (or one of his ready questions) opens the chat with him. |

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

The white pill under the map opens the search as a sheet over most of the screen ([src/components/SearchSheet.tsx](src/components/SearchSheet.tsx)): a large field, the places looked up lately (kept on the device), the country's cities, and then what was found. A question can be typed or spoken. The place that is picked is checked at once: the map goes there and Dwoggle digs. It uses Nominatim, the free OpenStreetMap geocoder: no API key, at most one request per second, and no search-as-you-type, which is why a place is looked up when the form is sent and not on every keystroke. Only places in Kyrgyzstan are found. The geocoder is set in `GEOCODER` in [src/config.ts](src/config.ts) and read by [src/api/geocode.ts](src/api/geocode.ts). The typed address is sent to that service.

## Plain words

The report is written for people who are new to such apps, grandparents among them. Every sentence the backend sends as a key (`api.*` in [src/i18n/translations.json](src/i18n/translations.json)) is short, in everyday words, with the numbers kept. For flood, landslide, heat and greenery at grades B to D the app adds one line on what to do (`advice.<check>.<grade>`); for earthquakes the backend sends its own. Pressing a line of the report opens the chat, where Dwoggle says what was found and then what to do. The advice never promises an outcome and never gives permission to build; a native speaker should check the Kyrgyz before launch.

## Stepping through the layers

Next/back buttons, a horizontal swipe, the arrow keys, or a tap on a layer of the core. "Skip to report" is always visible. With `prefers-reduced-motion` there is no dig and no rising core: the figure opens straight away. `DIG_MIN_MS` in [src/config.ts](src/config.ts) sets the shortest time the dig is shown.

## Brand artwork

The sign-in page and the dig follow the designer's screens. Art lives in [public/brand/](public/brand/):

- `dwoggle-head.png`: the logo's head (header, the map's chat button on phones, the PDF report, the browser tab), from the designer's clean drawing [scripts/art/dwoggle-logo-clean.jpg](scripts/art/dwoggle-logo-clean.jpg) by `python3 scripts/logo-clean.py scripts/art/dwoggle-logo-clean.jpg`: it cuts the drawing off its black background and draws its outer line back on.
- `dwoggle-standing.webp`: Dwoggle standing with his map, on the sign-up page, the map and in the chat: the designer's standing Dwoggle ([scripts/art/dwoggle-standing-original.webp](scripts/art/dwoggle-standing-original.webp), 669 x 1000) wearing the logo's clean head, made by `python3 scripts/mascot-standing.py`, which also writes where his lids and mouth go on the new head ([src/brand/standingDwoggleRig.ts](src/brand/standingDwoggleRig.ts)). They are drawn over the picture ([src/brand/StandingDwoggle.tsx](src/brand/StandingDwoggle.tsx)): he blinks, and his mouth moves when he speaks.
- `dwoggle-dig-*.webp` (body, both front paws, tail, head and chest, earth, and his head: the logo's clean head, set on his eyes, so he is the same Dwoggle as in the logo): Dwoggle digging in the dig and in the full report's wait, cut into layers so his paws really scrape, his tail wags and he rocks ([src/brand/DiggingDwoggle.tsx](src/brand/DiggingDwoggle.tsx)). Made with `python3 scripts/mascot-dig.py scripts/art/dwoggle-digging.webp`. That source is still a cut-out from a screenshot of the design: when the designer's own file arrives (same drawing, transparent background), run the script on it for sharper layers.
- In development, `/dev/dig` shows the dig without signing in (saving at the end fails on purpose).

## Saved areas

"Save this area" keeps the place in this browser for a visitor without an account. Once signed in, the list lives with the account on the backend (`GET/PUT/DELETE /api/me/saved`, Firestore `saved/{uid}`), so it is the same on every device; the places saved on this device before signing in are added to it once ([src/hooks/useSavedAreas.ts](src/hooks/useSavedAreas.ts)). A change shows at once and is undone, with a short notice, if the backend refuses it.

## Voice

Dwoggle's voice is ElevenLabs, through the backend, so the key never reaches the browser ([src/api/voiceApi.ts](src/api/voiceApi.ts)): `POST /api/voice/speak` reads an answer aloud (he does so by himself when the question was spoken; a typed one gets a "Listen" button), and `POST /api/voice/listen` turns a recorded question into words, Kyrgyz included. A recording stops on a second press of the microphone or after a moment of quiet. Without a key on the backend both answer 503 and the app falls back to the browser's own voice and recognizer. Put the key in `backend/.env` as `BEKEM_ELEVENLABS_API_KEY` and, for the live site, in the GitHub secret `ELEVENLABS_API_KEY`.

## The chat with Dwoggle

Dwoggle answers live with Claude, through the backend, so the key never reaches the browser ([src/api/chatApi.ts](src/api/chatApi.ts), [backend/bekem/chat.py](backend/bekem/chat.py)). A typed or spoken question goes to `POST /api/chat` with the conversation so far and the open place's report, written out in the visitor's language ([src/report/chatReport.ts](src/report/chatReport.ts)); he thinks while Claude answers, in 2 to 4 plain sentences, only from that report, and reads the answer aloud when the question was spoken. The wording rules hold for him too (no "safe" or "dangerous", no "plot", never permission to build, decisions go to engineers, geologists and the local authority), and an answer that breaks them anyway is not shown. A line at the bottom of the chat says that Dwoggle's answers and voice are made by AI and that AI can make mistakes. The ready questions under the field keep the app's prepared answers, which are also what he says when the backend has no key (503), is busy or fails, and in `npm run dev:mock`. Put the key in `backend/.env` as `BEKEM_ANTHROPIC_API_KEY` and, for the live site, in the GitHub secret `ANTHROPIC_API_KEY`; `BEKEM_ANTHROPIC_MODEL` picks the model (default `claude-sonnet-5-5`).

## Full report (PDF)

Under a place's checks, "Full report (PDF)" asks the backend for everything it knows about the point (`POST /api/reports`, signed-in users only, 10 a day) while Dwoggle digs, then writes a numbered PDF in the reader's language in the browser ([src/report/pdf/buildReportPdf.ts](src/report/pdf/buildReportPdf.ts), pdfmake, Noto Sans from `public/fonts`, loaded only when needed): the place and a satellite picture of the circle checked, the grades, every check with what was found, what to do, a chart per yearly series, the second opinions and the sources, and how grades work. It is a business report, not an official document, and says so. Its QR code opens `/r/<number>` ([src/pages/VerifyPage.tsx](src/pages/VerifyPage.tsx)), where anyone can compare the paper with what Dwoggle keeps under that number (date, place, grades, data fingerprint); the owner can download it again there. In `npm run dev:mock` the reports are made from `mock/report.json` and kept in memory.

## The chat with Dwoggle

[src/components/DwoggleChat.tsx](src/components/DwoggleChat.tsx): a white screen between two bands of earth, Dwoggle in the middle. A question is typed, spoken (where the browser can listen) or picked from the ready ones; he answers in a speech bubble, his mouth moving, and reads the answer aloud when the question was spoken or "Listen" is pressed (where the browser has a voice for the language; most have none for Kyrgyz).

The answers do not come from an AI. [src/report/answers.ts](src/report/answers.ts) matches the question to a topic by the words in it (one of the five checks, building, a summary, the grades, where the data comes from) and puts the answer together from the open report and the app's own texts, so the wording rules hold: asked "is it safe?", Dwoggle lists the warning signs and never uses the word. A test checks every answer in every language. When the backend gets a chat endpoint, this is the place to call it.

## Motion

- Changes of screen are view transitions ([src/motion/pageTransition.ts](src/motion/pageTransition.ts), rules in [pageTransition.css](src/motion/pageTransition.css)): after signing in the form gives way to the dig and Dwoggle drops to all fours; each question of the dig gives way to the next; at the end the map opens in a circle from where he stands. Browsers without view transitions change screen at once.
- In the dig he digs calmly while a question is read and about 2.6 times faster on the way down a layer; the same animations change speed in place.
- With `prefers-reduced-motion` the changes of screen are a short cross-fade, and Dwoggle keeps still and only blinks.

## Restyling

- All colors, fonts, spacing and sizes are CSS variables in [src/styles/tokens.css](src/styles/tokens.css); components only use `var(--…)`.
- Text and headings use Golos Text, which covers English, Russian and Kyrgyz. The pixel face Press Start 2P is kept for the Dwoggle wordmark only.
- Dwoggle is the same everywhere: the logo's head ([public/brand/dwoggle-head.png](public/brand/dwoggle-head.png)) on the map where he digs at the tapped point and beside the layers and the summary card; the standing and digging Dwoggle wear it too.
- The map is one component, [MapView.tsx](src/components/MapView.tsx). It shows a free 3D satellite map (MapLibre: Esri World Imagery over open terrain tiles, with OpenStreetMap buildings standing up; no API key) and falls back to the flat OpenStreetMap map if the browser has no WebGL or the 3D map does not load. All providers are set in [src/config.ts](src/config.ts) (`MAP_3D`, `MAP_FLAT`).
- Product and design notes for the Impeccable skill: [PRODUCT.md](PRODUCT.md) and `.impeccable/`.
