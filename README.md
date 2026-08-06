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
tools/land.mjs              GitHub Action script: lands in-app merges as repo commits
firestore.rules             the entire server-side security boundary (Firebase)
dist/standalone.html        GENERATED single-file build (all content inlined)
```

**There are no servers.** Hosting is GitHub Pages; accounts and dynamic data
are Firebase Auth + Firestore behind `firestore.rules`; content lands in the
repo via GitHub Actions. See DEPLOY.md — going live is two console setups and
one secret.

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

See **DEPLOY.md** — the short version: create a Firebase project (enable
Google sign-in, create Firestore, paste `firestore.rules`, hand-create the
`meta/roles` doc), push the repo public to GitHub with Pages set to "GitHub
Actions", add the service-account JSON as the one Actions secret, and run
`python3 tools/configure.py` to paste the Firebase config into index.html.
Unconfigured checkouts run in full local/demo mode, always.

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

When a user signs in *and* `FIREBASE_CONFIG` (top of `index.html`) is set,
sync activates — the user's store lives in their own Firestore document
(`users/{uid}`), readable and writable only by them per `firestore.rules`:

- every node record carries `updatedAt`; sync merges **last-write-wins per node**,
  so two devices editing different nodes never clobber each other
- edits push after a 1.5 s debounce, retry on failure, and flush when the
  tab/app backgrounds
- on sign-in the app pulls the remote copy, merges it with local (including any
  guest progress), and pushes the merged result

**Auth is Firebase Auth** — Google (and optionally Apple) popup sign-in; the
SDK holds the session and Firestore verifies it server-side. There are no
custom tokens anywhere. While `FIREBASE_CONFIG` is null the app falls back to
local demo accounts that never touch the network. On iOS, a Capacitor Firebase
auth plugin yields the same identity, so browser and app share one account.

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
- **The overseer** (platform-level): appoints gardeners in the in-app
  "Gardeners" panel (stored in the public `meta/roles` doc), moderates
  everywhere, and reviews new-map proposals. **Repo custody is automated**:
  a merge instantly creates a public-read `merged` doc that the app renders
  as a live overlay, and the scheduled **Land content** Action turns it into
  an attributed commit on main — validated by `tools/build.py` first — then
  redeploys Pages and retires the overlay doc. Contributors never need a
  GitHub account; their name travels in the commit message.

Governance is transparent by design: the roles doc and the merged-content
overlay are public reads, and the permanent edit record is the repository's
own public commit history (the 🕘 button on any map shows it).

## Community layer (GitHub-free contributions)

roadmap.sh runs its community through GitHub issues and PRs; this project serves
domain experts and everyday learners, so the same loop lives **inside the app**:

- **Suggest** — from any node: fix/correction, better resource, field-tested tip,
  or missing subtopic. From the home screen: propose a whole new roadmap as a
  simple outline. Forms embed the quality bar (including an "I've personally
  tried/verified this" attestation, echoing roadmap.sh's contribution rules).
  Sign-in is required to submit — the equivalent of needing a GitHub account.
- **Review** — overseers and per-map maintainers (bound in the public
  `meta/roles` doc, enforced by `firestore.rules`) get an in-app 🛡️ Review
  queue with three decisions per suggestion:
  - **Publish as tip** → instantly visible to all users under that node, in a
    clearly-labeled 💬 Community section. Curated LEARN/DO content is never
    modified by this path — BDFL curation stays intact.
  - **Accept for curation** → lands on an exportable list ("Copy all as JSON")
    for the maintainer to fold into the topic files by hand (or with AI help),
    then `python3 tools/build.py`.
  - **Reject** → archived.
- All community text is HTML-escaped on render; `firestore.rules` enforces
  auth, shapes, lengths, and https-only URLs at the database boundary.
  Without `FIREBASE_CONFIG`, suggestions queue locally on-device so the UX
  stays honest offline.

## Licensing

- **Code** (index.html, tools/, tests/, firestore.rules): [MIT](LICENSE).
- **Content** (everything under roadmaps/): [CC BY-SA 4.0](LICENSE-CONTENT.md) —
  Wikipedia's license; the maps are a commons and derivatives stay open.
  Linked external resources retain their own licenses.
- Contributions are accepted under the same terms — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Testing

- `python3 -m unittest discover -s tests` — validator tests, runs anywhere with python3.
- `tests/test.html` via `python3 tools/dev.py` — browser runner for the app's pure
  logic (merge/hash/diff/migration), sharing `tests/cases.json` with CI.
- CI (GitHub Actions) additionally runs `node --test tests/` (client logic
  extracted from index.html) and the **security-rules suite** against the
  Firestore emulator — `firestore.rules` is the entire server-side boundary,
  so it is tested like one — plus content validation + index freshness on
  every push and PR. A weekly workflow probes every content URL and maintains
  a single "link rot" issue.

## Privacy

Progress and notes are local-first (your device), synced to your account only
when signed in with a configured backend. **Download my data** in any node's
workspace panel exports everything as JSON. Deletion: sign out and clear
browser data; email the maintainer (SECURITY.md) for server-side removal.
Sign-in scripts load from Google/Apple CDNs at runtime; if they fail or are
blocked, the app degrades gracefully to local-only mode — that behavior is a
guarantee, not an accident.

## iOS app (Capacitor)

```bash
npm init @capacitor/app && npx cap add ios
```

Copy `index.html` + `roadmaps/` into `www/`, then `npx cap open ios` and build.
The app already handles safe-area insets and phone-width layouts. Because the
bundle is served from the app's own origin, `fetch("roadmaps/…")` works as-is.
