# Human Knowledge Roadmaps

Curated, action-oriented learning roadmaps for general human skills — observational
astronomy, applied compassion, home horticulture, first aid, and more. Inspired by
[roadmap.sh](https://roadmap.sh), but for life instead of code.

**The mission** lives on the app's About page (ⓘ in the top bar) — the
manifesto: the internet democratized content but never curriculum, so we're
building the maps. All user-facing explanation belongs there, nowhere else.

**Curation model: a commons with gardeners.** Every map has a named maintainer
(`maintainer` in its `meta.json`) with final say; anyone can propose changes
through the in-app community pipeline. **The one hard rule:** every resource on
every map must be freely and legally accessible to everyone — no paywalls, no
region locks (`tools/build.py` warns on known-paywalled domains). Publishing a
change = editing a small JSON file and rebuilding.

## Repository layout

```
index.html                  app shell (renderer, drawer, auth, sync) — no content inside
roadmaps/
  index.json                GENERATED catalog — never edit by hand
  astronomy/
    meta.json               {id, emoji, title, tagline, curricula, order}
    topics/
      01-getting-started.json   one core (spine) topic + its child subtopics
      02-celestial-sphere.json
      ...
  horticulture/ …           one folder per category, same shape
tools/build.py              validate all content + regenerate index.json (+ standalone bundle)
server/worker.js            reference cloud-sync backend (Cloudflare Worker)
dist/standalone.html        GENERATED single-file build (all content inlined)
```

## Editing content (humans and AI)

The unit of editing is **one topic file** — a few KB of JSON holding one core topic
and its subtopics. To deepen a topic, open its file; nothing else needs to change.

Topic file shape:

```json
{
  "id": "polaris-navigation", "title": "Naked-Eye Navigation", "tier": "essential",
  "learn": {
    "summary": "2–3 tight, curated sentences.",
    "links": [{ "label": "Wikipedia — Polaris", "url": "https://…", "kind": "article" }]
  },
  "do": ["A real-world action doable this week."],
  "children": [ { …same shape, minus children… } ]
}
```

Rules the validator enforces:
- `tier` is `essential` | `recommended` | `extra`; link `kind` is `article` | `video` | `tool`
- every node has ≥1 `do` action (core philosophy: no read-only nodes)
- links are https; ids unique per roadmap; children nest exactly one level

**Add a topic**: create `roadmaps/<id>/topics/NN-slug.json` (the `NN-` prefix sets
spine order). **Add a category**: create a folder with `meta.json` + `topics/`,
set `order` in meta. Then:

```bash
python3 tools/build.py
```

This validates everything, fails loudly with file-and-node-level messages, and
regenerates `roadmaps/index.json`. Add `--standalone` to also emit
`dist/standalone.html` (single file, works without a server — good for quick
sharing or embedding in the iOS app as an offline fallback).

## Running locally

```bash
python3 tools/dev.py
```

then open http://localhost:8123. This is the **overseer dev server**: it serves
the app *and* enables the in-app content editor to save straight to the topic
files (see "Overseer editing" below). Plain `python3 -m http.server 8123` works
too (read-only). Opening `index.html` via `file://` shows a friendly error;
`dist/standalone.html` works anywhere.

## Deploying (once, ~30 minutes)

1. **API** — in `server/`: follow the numbered steps at the top of
   `wrangler.toml` (`wrangler login` → create KV → set `SESSION_SECRET` →
   `wrangler deploy`). Put the printed URL in `index.html` as `API_BASE`.
2. **App** — deploy the repo folder to any static host, e.g.
   `npx wrangler pages deploy . --project-name=hkr` (or Netlify/GitHub Pages).
3. **Sign-in** — create a Google OAuth Web client (console.cloud.google.com)
   and/or an Apple Services ID (developer.apple.com); put the ids in
   `AUTH_CONFIG` (index.html) and in the worker's `[vars]`, and register your
   app's URL as an authorized origin with each provider.
4. **Overseer** — sign in once, copy your user id from the user-chip tooltip,
   and put it in `OVERSEER_IDS` (worker vars, and index.html for the UI).

## Overseer editing (in-app content tools)

Run `python3 tools/dev.py` and every node in the app grows a ✏️ button:
edit the title, tier, summary, links, and do-actions in a form; add or delete
subtopics; add whole core topics ("＋ Add core topic" on the map). Saves are
validated with the build rules (schema, https links, mandatory do-action) and
written prettily to `roadmaps/<id>/topics/<file>` with the index regenerated —
every save is an ordinary git-diffable file change. Without the dev server
(e.g. on the deployed site), the same editor exports instead: Save downloads
the topic file and copies its JSON for you to drop into the repo.

The review queue's **Accepted for curation** tab links the two systems: each
accepted community suggestion gets an "✏️ Edit this node now" button that
jumps straight into the editor.

**Link health**: `python3 tools/build.py --check-links` probes every content
URL (politely: per-host serialization, retries) and writes
`tools/link-report.json` separating truly-dead links from bot-blocked ones.
Run it before releases or in CI.

## Notes & progress sync

The app is **local-first**: every status change, checked action, and note is
saved to `localStorage` instantly and works fully offline or signed out.

When a user signs in *and* `API_BASE` (top of `index.html`) points at a deployed
backend, a sync layer activates:

- every node record carries `updatedAt`; sync merges **last-write-wins per node**,
  so two devices editing different nodes never clobber each other
- edits push after a 1.5 s debounce, retry on failure, and flush when the
  tab/app backgrounds
- on sign-in the app pulls the remote copy, merges it with local (including any
  guest progress), and pushes the merged result

**Auth is real**: the app uses Google Identity Services (official rendered
button) and Sign in with Apple JS; `POST /auth` on the worker verifies the
provider's RS256 ID token against its JWKS (audience, issuer, expiry,
signature) and issues a 180-day HMAC session token. While `AUTH_CONFIG` ids
are empty the app falls back to local demo accounts — the worker only accepts
those when its `DEV_MODE=1` var is set, so production is never spoofable.
On iOS, a Capacitor auth plugin yields the same ID tokens → same `/auth`
exchange, so browser and app share one identity and one sync system.

## Editorial layer (the commons with gardeners)

The manifesto's governance, implemented — three roles, one editor:

- **Contributors** (any signed-in user): every node's ✏️ editor is open to them,
  but Save becomes **Propose change** — the edited topic ships to the backend
  with a base-version hash and a note to the maintainer. No git, no JSON, just
  the same form the maintainer uses.
- **Maintainers** (one per map, appointed by the overseer in the in-app
  "Gardeners" panel and bound to a verified user id): they see a review queue
  for *their* maps with field-level **diffs** (− old / + new per summary, links,
  do-actions; added/removed subtopics), and one click **merges** — instantly
  live for every user, attributed, and logged in the map's public **history**
  (🕘 on the map view). Their own edits publish immediately ("Save & publish").
  Stale proposals (base changed since proposed) are flagged.
- **The overseer** (platform-level): appoints gardeners, moderates everywhere,
  reviews new-map proposals, and keeps **repo custody** via the overlay model:
  merged edits live in a server-side content overlay that renders on top of the
  static base files, and `python3 tools/sync.py --api <url>` pulls them down
  into the topic files for an ordinary git commit (then `--clear` empties the
  overlay). Git stays the canonical ledger; merges never wait for a deploy.

Governance is transparent by design: `GET /maintainers`, `GET /history/<map>`,
and `GET /content/<map>` are all public endpoints.

## Community layer (GitHub-free contributions)

roadmap.sh runs its community through GitHub issues and PRs; this project serves
domain experts and everyday learners, so the same loop lives **inside the app**:

- **Suggest** — from any node: fix/correction, better resource, field-tested tip,
  or missing subtopic. From the home screen: propose a whole new roadmap as a
  simple outline. Forms embed the quality bar (including an "I've personally
  tried/verified this" attestation, echoing roadmap.sh's contribution rules).
  Sign-in is required to submit — the equivalent of needing a GitHub account.
- **Review** — users listed in `OVERSEER_IDS` (in `index.html` for UI, in the
  worker's env for enforcement) get an in-app 🛡️ Review queue with three
  decisions per suggestion:
  - **Publish as tip** → instantly visible to all users under that node, in a
    clearly-labeled 💬 Community section. Curated LEARN/DO content is never
    modified by this path — BDFL curation stays intact.
  - **Accept for curation** → lands on an exportable list ("Copy all as JSON")
    for the maintainer to fold into the topic files by hand (or with AI help),
    then `python3 tools/build.py`.
  - **Reject** → archived.
- All community text is HTML-escaped on render; the server validates types,
  lengths, and https-only URLs. Without a configured `API_BASE`, suggestions
  queue locally on-device so the UX stays honest offline.

Endpoints (all in `server/worker.js`): `POST /suggestions`, `GET /suggestions?status=`
(overseer), `POST /decide` (overseer), `GET /tips/<roadmap>` (public).

## iOS app (Capacitor)

```bash
npm init @capacitor/app && npx cap add ios
```

Copy `index.html` + `roadmaps/` into `www/`, then `npx cap open ios` and build.
The app already handles safe-area insets and phone-width layouts. Because the
bundle is served from the app's own origin, `fetch("roadmaps/…")` works as-is.
