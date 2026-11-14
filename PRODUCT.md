# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People in Kyrgyzstan who are choosing where to build, buy or rent a home. They check a place on their phone before committing. They are not specialists in climate or hazard data. (Confirmed by the project owner.)

## Product Purpose

Dwoggle is a web app for the NASA Space Apps Challenge 2026. The user taps any place on a map and gets a report for the area within 300 m: five checks (heat, greenery, flood, landslide, earthquake), each with a grade from A to D, one sentence, and a 25-year chart where a time series exists. Success is that a non-specialist understands, in under a minute, which warning signs exist for that area and how strong the evidence is.

## Positioning

Risk signals for one exact place, built from open Earth-observation data (mostly NASA), with the data resolution, the source and the statistical significance of each trend shown beside every grade.

## Operating Context

- Used mostly on phones, down to 360 px wide, also on desktop.
- The backend returns keys and numbers only (see mock/report.json and src/api/types.ts). Every sentence is built on the client from src/i18n/translations.json.
- Languages: Kyrgyz, Russian, Kazakh, Uzbek, English, Chinese, Hindi, Spanish, Arabic, French, Portuguese (the most spoken languages and those of Central Asia). Asked as the first question after sign-in. Translations are AI-made and need a native-speaker check.
- A marmot mascot, Dwoggle, shows one of three moods sent by the backend: relaxed, alert, whistling.

## Capabilities and Constraints

- Wording rules, enforced by a test: never "safe" or "dangerous" (use "no warning signs found" / "warning signs found"); say "this area", never "plot".
- A null grade is shown as "no data". The app never invents a value.
- The footer always shows: "Dwoggle gives risk signals, not official permission."
- Every view has loading, error and no-data states.
- After a tap Dwoggle sinks into the ground at that point; then a round core rises out of it over the dimmed map. The core shows one layer per check, and every layer has a leader arrow to its explanation, like a figure in a scientific talk. The figure says plainly that it is a diagram, not a real soil profile.
- Checks are always ordered green, heat, flood, landslide, earthquake (trend checks first).
- All colors, fonts, spacing and radii live in src/styles/tokens.css; components hold no hard-coded colors or font names.
- Base map: a free 3D satellite map: imagery draped over terrain (elevation largely from NASA SRTM) with buildings standing up, drawn by MapLibre; no API key. A flat OpenStreetMap map takes over when the 3D map cannot load. 2GIS was rejected because it is paid. The map sits behind one component so providers can be swapped.
- Address search over the map (Nominatim, free, no key): it moves the map to a found place; the user still taps the exact spot to check it.
- Pages: the sign-up page (the main page), the dig with its questions after the first sign-in, and the map. The map and the report work without an account; signing in only adds features.
- Accounts (Firebase Auth): Google, or email and password. After the first sign-in, five questions are asked while Dwoggle digs: language, country (the map opens there), why they came, which hazards worry them, and a phone number. The backend keeps the answers; the device only keeps a copy, without the phone number. The account can be deleted, phone number included.
- Undecided: a privacy notice for the email, language and country it collects; per-check grading thresholds (owned by the science team); final mascot and layer artwork (placeholders ship in fixed-size boxes).

## Brand Commitments

- Name: Dwoggle (renamed from Bekem by the owner). Mascot: Dwoggle, an otter in a yellow hard hat with goggles; artwork by the team's designer.
- Two registers, set by the owner and the designer: the sign-in page and the dig are warm and cartoon-like (Dwoggle, brown earth, chunky buttons, Chewy lettering); the map, the core figure and the report stay in the sober register of a scientific presentation, because the results must be taken seriously by a NASA Space Apps jury.

## Evidence on Hand

- mock/report.json: a synthetic example report for Bishkek. The numbers are generated, not measured.
- No real artwork yet: mascot and ground-layer images are placeholders.

## Product Principles

1. Signals, not verdicts: show what the data says and how sure it is, never a promise.
2. Never invent a value: missing data is shown as missing.
3. Credibility first: Dwoggle makes it friendly, but nothing may look like a toy or hide a grade, a sentence or a number.
4. One exact place at a time: everything refers to "this area".

## Accessibility & Inclusion

- Works with keyboard, touch and swipe.
- Respects prefers-reduced-motion: no dig animation, straight to the layers.
- Must be usable on a 360 px phone screen.
