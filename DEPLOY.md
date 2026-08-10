# Going live

Two hosted services, zero servers: **GitHub** (public repo → Pages hosting,
Actions for CI + landing merges) and **Firebase** (accounts + database behind
`firestore.rules`). Budget ~30 minutes. Run
Open `config.js` anytime to see what's wired — it's two fields.

## Stage 1 — Firebase (~15 min, all in the console)

1. console.firebase.google.com → **Add project** (no Analytics needed).
2. **Build → Authentication → Get started** → enable **Google** provider.
   Also enable **Email/Password** (plain, no email-link sign-in needed).
   (Apple later if you join the Apple Developer Program — Sign in with Apple
   needs a Services ID + key from developer.apple.com.)
3. **Build → Firestore Database → Create database** (production mode).
4. **Rules tab** → paste the contents of `firestore.rules` → Publish.
5. **Bootstrap governance** (one-time, by hand — the rules deliberately never
   allow creating this doc): Firestore → Start collection → id `meta` →
   doc id `roles` → fields:
   - `superadmins` (array) — leave empty for now; you'll add your uid in Stage 3
   - `admins` (array) — the admin board — empty
   - `maintainers` (map) — empty
6. **Project settings → General → Public-facing name** → set it to
   `Atlearn`, and set the support email. Without this, Google's sign-in
   popup and its "you shared data with…" emails name the raw auth host
   (`atlearn-62281.firebaseapp.com`) instead of the product. (Same field,
   deeper: Cloud Console → APIs & Services → OAuth consent screen. A logo
   can be added there too, but a logo sends the app into Google's
   verification queue — the name alone applies immediately.)
7. **Project settings → Your apps → Web app** → register → copy the
   `firebaseConfig` object.
8. **Project settings → Service accounts → Generate new private key** —
   download the JSON. This is the ONLY secret: it goes into GitHub Actions
   (Stage 2) and stays on your machine for backups. Never in the repo.

## Stage 2 — GitHub (~10 min)

```bash
brew install gh && gh auth login
cd "/path/to/atlearn"
gh repo create atlearn --public --source=. --push
```

Then in the repo's web settings:
1. **Settings → Pages → Source: GitHub Actions.** The `Deploy Pages` workflow
   publishes on every push to main — your app URL becomes
   `https://<you>.github.io/atlearn/`.
2. **Settings → Secrets and variables → Actions → New repository secret**:
   name `FIREBASE_SERVICE_ACCOUNT`, value = the entire service-account JSON.
3. Authentication (Firebase console) → **Authorized domains** → add
   `<you>.github.io`.

## Stage 2b — The domain: atlearn.org (~10 min + DNS propagation)

The project's home is **https://atlearn.org**. Wiring it to Pages:

1. At the registrar, add DNS records: a `CNAME` for `www` →
   `<you>.github.io`, and the four Pages apex `A` records for `atlearn.org`
   (185.199.108.153 / .109. / .110. / .111. — current list in the GitHub
   Pages docs).
2. **Repo → Settings → Pages → Custom domain**: enter `atlearn.org`, save,
   and tick **Enforce HTTPS** once the certificate issues. (This commits a
   `CNAME` file into the Pages artifact — with our Actions deploy, add the
   file at repo root instead so every deploy carries it.)
3. Firebase console → Authentication → **Authorized domains** → add
   `atlearn.org` (and `www.atlearn.org`) — sign-in popups refuse unknown
   origins otherwise.
4. Smoke: open https://atlearn.org, sign in, confirm the sync dot greens.
   The `<you>.github.io/atlearn/` URL keeps working and redirects.

## Stage 3 — Wire and become superadmin (~5 min)

Edit `config.js` by hand — it has exactly two fields:
paste the `firebaseConfig` object (Firebase console → Project settings →
Your apps) into `FIREBASE_CONFIG`, and set `GITHUB_REPO` to `"owner/repo"`.

```bash
python3 tools/build.py --standalone
git add -A && git commit -m "Configure Firebase + repo" && git push
```

Open the live URL, **Sign in** with Google, click your name (top right) —
your account page shows your uid with a Copy button. In the Firebase console,
add that uid to `meta/roles → superadmins`. Reload: your account page grows a
**Governance** panel where you appoint per-map maintainers and the admin
board from now on — no more console visits. (This is the ONLY console-managed
role, by design: `firestore.rules` never lets any client — even you — edit
the `superadmins` list, so a compromised account can't mint new root.
See GOVERNANCE.md.)

## Stage 4 — Smoke test

- [ ] Sign in; sync dot turns green; progress survives reload and a second device
- [ ] Suggest from a node; it appears in 🛡️ Review; publish it as a tip
- [ ] Edit a node (✏️) as a maintainer → Save & publish → change is live
      immediately via the overlay; run the **Land content** Action from the
      Actions tab (or wait for its 6-hourly schedule) and confirm one run
      commits it with attribution, redeploys, and retires the overlay doc
      (check the Actions tab + 🕘)
- [ ] Signed out / unconfigured browsers still work fully in local mode

## Operations

- **Backups (monthly)**: `npm install --no-save firebase-admin && node tools/backup.mjs`
  with `GOOGLE_APPLICATION_CREDENTIALS` pointing at the service-account JSON.
  Backups land in gitignored `backups/` — they contain user data; keep private.
- **Bus factor**: add a second trusted uid to `meta/roles → admins`
  (the admin board); keep
  the service-account JSON and Firebase/GitHub account access in a password
  manager.
- **Quotas**: Firestore free tier = 50k reads / 20k writes per day — plenty
  for early community scale; the Blaze pay-as-you-go upgrade is the growth
  path (and enables `gcloud firestore export` managed backups).
- **Hardening, on first abuse** (deliberately not built yet): Firebase
  App Check (reCAPTCHA) to gate non-browser clients, and a rules-level
  per-user write throttle. The rules already enforce auth, shape, and size
  caps; worst-case spam is a human-reviewed queue plus quota consumption —
  an annoyance, not a bill.

## Updating content

```bash
python3 tools/dev.py           # edit in-app with the ✏️ buttons
git add -A && git commit -m "Content: ..." && git push    # Pages redeploys
```
