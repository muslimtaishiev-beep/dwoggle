# Sign-in: email + password or Google, plus "why are you here"

**Who does what**

| | Frontend (Firebase JS SDK) | Backend (this repo) |
|---|---|---|
| Passwords, hashing, reset emails | ✓ Firebase | never sees a password |
| "Sign in with Google" | ✓ Firebase | – |
| Email verification | ✓ Firebase sends it | reports `email_verified` |
| Country, phone, why they're here | form | validates, stores in Firestore `users/{uid}` |
| Delete my account | button | deletes the profile **and** the Firebase account |

Signing in is **optional**: anyone can tap the map. After the first report, show `prompt` from
`/api/auth/options` ("Save this plot… sign up in 30 seconds").

## 1. Firebase setup (10 min, once)

1. https://console.firebase.google.com → **Add project** → pick the existing Google Cloud project **bekem-514710**
   (the same one Earth Engine uses, so one service account covers everything).
2. **Build → Authentication → Get started → Sign-in method**: enable **Email/Password** and **Google**.
3. **Authentication → Settings → Authorized domains**: `localhost` and `bekem-514710.web.app` are already there.
   Add any custom domain you connect later.
4. **Build → Firestore Database → Create database**, production mode, location `eur3` (Europe; closest multi-region to Kyrgyzstan).
5. **Firestore → Rules**: replace everything with the rule below, then **Publish**. The browser must never read
   phone numbers; only the backend writes, with its service account, which bypasses these rules.
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} { allow read, write: if false; }
     }
   }
   ```
6. The backend's service account `bekem-api` needs **Cloud Datastore User** (profiles) and
   **Firebase Authentication Admin** (so "delete my account" works). The deploy script
   [setup_gcp.sh](../deploy/firebase/setup_gcp.sh) grants both.
7. **Project settings → General → Your apps → Web app (</>)**. Register it and copy `firebaseConfig` into the frontend.
   That config is public by design; it is not a secret.

The backend needs nothing new. On this laptop it uses `backend/bekem-sa-key.json`; on Cloud Run it runs as
`bekem-api` with no key at all. Check with `GET /api/health` → `"auth": "firebase"`.

## 2. Frontend code

```js
import { initializeApp } from "firebase/app";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, signOut,
} from "firebase/auth";

const auth = getAuth(initializeApp(firebaseConfig));
auth.languageCode = lang;            // "ru" / "en": Firebase emails in that language

// Every call to our API: attach the token when signed in (Firebase refreshes it automatically).
async function api(path, options = {}) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
  });
}

// Email + password
const { user } = await createUserWithEmailAndPassword(auth, email, password);   // sign up
await sendEmailVerification(user);
await signInWithEmailAndPassword(auth, email, password);                         // sign in
await sendPasswordResetEmail(auth, email);                                       // forgot password

// Google
await signInWithPopup(auth, new GoogleAuthProvider());

// After any sign-in: does Bekem still need country / phone / purpose?
const me = await (await api(`/api/me?lang=${lang}`)).json();
if (!me.profile_complete) showProfileForm();     // choices from GET /api/auth/options?lang=ru

const r = await api("/api/me/profile", {
  method: "PUT",
  body: JSON.stringify({
    country: "KG", phone: "0555 12 34 56", purpose: "buy_land", purpose_note: null,
    concerns: ["flood", "earthquake"],   // any of flood, landslide, earthquake, heat; [] clears; omit = keep
    lang,                                 // any of the 11 app languages
  }),
});
if (r.status === 422) {
  const { detail } = await r.json();      // { field: "phone", code: "phone_invalid", message: "Введите правильный номер…" }
  showErrorUnder(detail.field, detail.message);
}

// Delete account (profile + sign-in account), then sign out locally
await api("/api/me", { method: "DELETE" });
await signOut(auth);
```

Country picker: store the ISO code (`KG`), show names with
`new Intl.DisplayNames([lang], { type: "region" }).of("KG")` → "Кыргызстан".

## 3. API

| Endpoint | Auth | What it does |
|---|---|---|
| `GET /api/auth/options?lang=ru` | – | The "why are you here" and `concerns` choices with labels, the 11 `languages`, the sign-up prompt, `enabled` |
| `GET /api/me` | token | `{user, profile, profile_complete}` |
| `PUT /api/me/profile` | token | Save `{country, phone, purpose, purpose_note?, concerns?, lang}`. Phone comes back as `+996…`. An empty phone keeps the saved one (or none yet): the app saves the first answers before asking for the phone, so a visitor who leaves there is asked only for the phone next time. `profile_complete` stays false until a phone is saved. |
| `DELETE /api/me` | token | Delete the profile and the Firebase account |

Phone numbers are checked with libphonenumber (Google's rules): `0555 12 34 56`, `+996 0555 123 456` (the local 0
typed after the code) and `00996…` all become `+996555123456`; numbers that cannot exist (`+1 0555…`) are refused.
The chosen country is only the default for numbers written without a code.

Errors: `401 {code: token_missing | token_invalid | token_expired | account_gone}` (sign in again; `account_gone`:
the account was deleted or disabled while its token was still valid), `422 {field, code, message}`
(show `message` under `field`, already in the user's language), `503 {code: auth_disabled}` (Firebase not set up yet).

Why they're here: `buy_land`, `build`, `own_home`, `realtor`, `government`, `research`, `curious`, `other`
(`other` needs a short note). These are the user groups from the pitch, so the answers show who Bekem is really for.

Concerns (optional, may be empty): `flood`, `landslide`, `earthquake`, `heat`.

Languages: `lang` accepts the 11 app languages `ky ru kk uz en zh hi es ar fr pt` and is stored as sent.
The backend's own texts (error messages, labels) come back in en/ru/ky: `kk`/`uz` → Russian, the rest → English.
`GET /api/languages` gives the exact mapping.

## Without Firebase (frontend development)

With `BEKEM_PROVIDER=mock` and no service account, the backend accepts fake tokens
`Authorization: Bearer dev:<uid>:<email>` and keeps profiles in memory. This never works with real data enabled.
