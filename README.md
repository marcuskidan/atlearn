# Waihona

**Waihona is a free online library of learning roadmaps — step-by-step paths
for learning real-world skills — written and tended by a community of
volunteers, every map kept by a named maintainer.** The free curriculum, in
the sense that Wikipedia is the free encyclopedia.

*Waihona* (Hawaiian): a repository — a place where treasured things are kept.

Action-oriented maps for general human skills — observational astronomy,
applied compassion, home horticulture, first aid, and more. Inspired by
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
config.js                   deployment config (Firebase web config + repo name; edit by hand)
link-policy.json            paywalled-domain + affiliate-parameter lists (maintainer-editable)
roadmaps/
  index.json                GENERATED catalog — never edit by hand
  search.json               GENERATED search index (every node title)
  search-deep.json          GENERATED deep index (summaries + do-actions)
  wanted.json               the "maps we wish existed" list (hand-edited)
  astronomy/
    meta.json               {id, emoji, title, tagline, curricula, order, …}
    changelog.json          GENERATED per-map history (append-only, by the op engine)
    topics/
      01-getting-started.json   one core (spine) topic + its child subtopics
      02-celestial-sphere.json
      ...
  horticulture/ …           one folder per category, same shape
tools/build.py              validate all content + regenerate indexes (+ --health, --standalone)
tools/ops.mjs               THE op engine (edit/add/remove/spine/move/about) — one implementation
tools/apply.mjs             CLI over ops.mjs (used by tools/dev.py)
tools/dev.py                local dev server: in-app editor saves to real files
tools/land.mjs              GitHub Action script: lands in-app merges as repo commits
tools/succession.mjs        the Link Steward: drafts swap proposals for dead links
tools/extract.mjs           brace-matching extractor (tools + tests share app functions)
tools/backup.mjs            manual Firestore backup dump
tests/                      python (build/dev), js (client/ops), rules (emulator) suites
firestore.rules             the entire server-side security boundary (Firebase)
firestore.indexes.json      composite-index declarations deployed with the rules
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

then open http://localhost:8123. This is the **dev server**: it serves
the app *and* enables the in-app content editor to save straight to the topic
files (see "In-app editing" below). Plain `python3 -m http.server 8123` works
too (read-only). Opening `index.html` via `file://` shows a friendly error;
`dist/standalone.html` works anywhere.

## Deploying (once, ~30 minutes)

See **DEPLOY.md** — the short version: create a Firebase project (enable
Google sign-in, create Firestore, paste `firestore.rules`, hand-create the
`meta/roles` doc), push the repo public to GitHub with Pages set to "GitHub
Actions", add the service-account JSON as the one Actions secret, and run
`python3 tools/configure.py` to write the Firebase config into `config.js`.
Unconfigured checkouts run in demo mode, always — full reading plus
role-surface rendering, with nothing persisted and every write toasting
honestly.

## In-app editing (content tools)

Run `python3 tools/dev.py` and every node in the app grows a ✏️ button:
edit the title, tier, summary, links, and do-actions in a form; add, delete,
and reorder subtopics — or send one to a different core topic; add whole core
topics at any spine position ("＋ Add core topic"); delete core topics; and
reorder the whole spine ("⇅ Reorganize"). Every action is one of five
structural ops (`edit` / `add` / `remove` / `spine` / `move` / `about`)
validated with the build rules and written to `roadmaps/<id>/topics/` +
`meta.json` — ordinary git-diffable file changes. One engine applies them
everywhere: `tools/ops.mjs`, shared by the dev server and the landing Action. Without the dev server
(e.g. on the deployed site), the same editor merges, proposes, or exports
depending on who you are — same ops, different destination.

The review queue's **Accepted for curation** tab links the two systems: each
accepted community suggestion gets an "✏️ Edit this node now" button that
jumps straight into the editor.

**Link health**: a nightly GitHub Action (lychee) probes every content URL and
maintains a single "link rot" issue; 403/429 responses count as bot-blocking,
not rot. Trigger it on demand from the repo's Actions tab. The paywalled-domain
and affiliate-parameter lists live in `link-policy.json` (repo root) — extend
them without touching code.

## Finding things & sharing them

Every view has a shareable address: `#/astronomy` opens a category's version
picker, `#/astronomy/map` the official map, `#/astronomy/polaris` the map with
that node's drawer open — paste-able links, working back/forward, bookmarks.
Further routes: `#/atlas` (every map with search and criteria filters),
`#/collections` (community shelves), `#/journal` (your private journal, from
the account page), `#/health` (vital signs), `#/privacy`, `#/about`, and
`#/guild/<id>` (a guild's hall, reached from its maps' headers).

Search lives on the home screen and the Atlas. Titles come from
`roadmaps/search.json`; when title matches run thin, a deeper index
(`roadmaps/search-deep.json`, summaries + do-actions) fills in. Both are
generated at build time. Returning walkers also get a quiet "✦ changed since
your last visit" pill on maps that moved, backed by each map's changelog.

## Notes & progress

Signed-out visitors read — and can tick actions to feel the loop, though
those marks last only the visit (session memory, one honest nudge; signing
in brings them along). Durable tracking is an account feature, and the
account's server record is the system of record. Every status change, checked action,
and note is written to the user's own Firestore document (`users/{uid}`),
readable and writable only by them per `firestore.rules` — the UI reflects
the change instantly and reports the real save state (pending / saved /
failed) honestly; the device holds nothing durable:

- every node record carries `updatedAt`; concurrent edits merge
  **last-write-wins per node**, so two devices editing different nodes
  never clobber each other
- edits push after a 1.5 s debounce, retry on failure, and flush when the
  tab/app backgrounds — a write that can't reach the server is surfaced,
  never silently dropped
- on sign-in the app pulls the account's record from the server, so any
  device shows the same progress

**Auth is Firebase Auth** — Google (and optionally Apple) popup sign-in; the
SDK holds the session and Firestore verifies it server-side. There are no
custom tokens anywhere. While `FIREBASE_CONFIG` is null the app falls back to
demo accounts that never touch the network (and persist nothing — demo
renders role surfaces, writes toast honestly). On iOS, a Capacitor Firebase
auth plugin yields the same identity, so browser and app share one account.

## Editorial layer (the commons with gardeners)

The manifesto's governance, implemented (the full constitution — who decides
what, and why — is [GOVERNANCE.md](GOVERNANCE.md)). Three working roles, one
editor:

- **Contributors** (any signed-in user): every node's ✏️ editor is open to them,
  but Save becomes **Propose change** — the edited topic ships to the backend
  with a base-version hash and a note to the maintainer. No git, no JSON, just
  the same form the maintainer uses.
- **Maintainers** (one per map, appointed by an admin in the account
  page's Governance panel and bound to a verified user id): they see a review queue
  for *their* maps with field-level **diffs** (− old / + new per summary, links,
  do-actions; added/removed subtopics), and one click **merges** — instantly
  live for every user, attributed, and logged in the map's public **history**
  (🕘 on the map view). Their own edits publish immediately ("Save & publish").
  Stale proposals (base changed since proposed) are flagged.
- **Admins** (platform-level): appoint maintainers in the account page's
  Governance panel (stored in the public `meta/roles` doc), moderate
  everywhere, and review new-map proposals. The **superadmin** (root role)
  appoints admins
  from the same panel; the superadmin list itself is only ever edited by hand
  in the Firebase console — no API path can mint root. **Repo custody is automated**:
  a merge instantly creates a public-read `merged` doc that the app renders
  as a live overlay, and the scheduled **Land content** Action turns it into
  an attributed commit on main — validated by `tools/build.py` first — then
  redeploys Pages and retires the overlay doc. Contributors never need a
  GitHub account; their name travels in the commit message.

Around those three roles, the full governance machinery of
[GOVERNANCE.md](GOVERNANCE.md) is implemented in the same zero-server style:

- **Stewards** (deputized per map by its maintainer) merge *trivial*
  proposals only — proposals carry a rules-enforced **weight class**
  (trivial / substantive / structural), and structural changes wait out a
  **7-day open comment period** (every proposal is public and commentable).
- **Lifecycle**: maps carry `state` (draft/published/archived) in meta.json
  and an **orphan flag + designated successor** in the public
  `mapstates/{map}` doc, with an in-app **adopt** flow. Maps are
  **semver-versioned** with append-only changelogs, and walkers see
  "changed since your last visit" — never a silent yank.
- **Safety**: canonical content can be reported (severity `safety` = the
  red-flag queue, 48-hour norm, visible to that map's maintainer), and every
  resource has a one-tap **flag** (dead / stale / didn't help) aggregated in
  the review queue.
- **Integrity**: affiliate/tracking parameters are build errors, every
  contribution declares **affiliation**, and resource-domain concentration is
  published per map on the vital-signs page (`#/health`) — machine facts stay
  off the reading surfaces.
- **Guilds** (subject-area communities with talk spaces), **guides**
  (janitorial coordinators), and **endorsements** (signed, dated,
  criteria-backed quality marks) — built and rules-tested, seeded from the
  Governance panel as the community grows.
- **The agent corps**: a nightly link check plus the **Link Steward**, which
  pre-drafts succession swaps for dead links as `agent:*` proposals. Agents
  file; only named humans merge — the AI line is enforced in
  `firestore.rules` and tested.
- **Vital signs** (`#/health`): resource freshness, maintainer coverage, and
  the landed-contribution tally — generated at deploy time from repo data
  and the public commit record only. Walker behavior is counted nowhere.

Governance is transparent by design: the roles doc and the merged-content
overlay are public reads, and the permanent edit record is the repository's
own public commit history (the 🕘 button on any map opens it directly).

## Community layer (GitHub-free contributions)

roadmap.sh runs its community through GitHub issues and PRs; this project serves
domain experts and everyday learners, so the same loop lives **inside the app**:

- **Share a tip** — from any node's Community section: a field-tested tip,
  published beside the lesson and clearly labeled (fixes, better resources,
  and missing subtopics go through the node's ✏️ editor instead — one door
  per intent). From the home screen: propose a whole new roadmap as a
  simple outline. Forms embed the quality bar (including an "I've personally
  tried/verified this" attestation, echoing roadmap.sh's contribution rules).
  Sign-in is required to submit — the equivalent of needing a GitHub account.
- **Review** — admins and per-map maintainers (bound in the public
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
  Without `FIREBASE_CONFIG`, submitting says plainly that suggestions need
  the connected app — the UX degrades honestly rather than shadow-queueing.
- **Collections** (`#/collections`) — owner-curated shelves of existing maps
  ("Learning the Natural World"). They're pointers, not content, so they need
  no review pipeline: any signed-in user creates and manages their own;
  admins have exactly two moderation switches (feature ★ / hide). This is
  GOVERNANCE.md's "fork valve" — disagreeing with how the library is organized
  has a productive answer that isn't a governance fight. Unconfigured,
  creating a shelf says plainly it needs the connected app.
- **Personal versions** (the category page's "＋ Start your own branch" row) —
  any signed-in user gets an editable copy of a map: the full editor, no
  role required, saves going only to their version. A fork is stored as
  *changes over the living base* (`forks/{id}`: base + the same five
  structural ops, rendered through `applyMergedDocs`), so untouched topics
  keep tracking the canonical map as it improves; per-topic "reset to
  standard" drops the divergence. Shareable via `#/fork/<id>` (viewing is
  free for anyone, always), listed with copy-link on the owner's account
  page, one per map per user, capped at 100 changes. Walking progress is
  shared with the base map thanks to stable node ids. Admin moderation is a
  single `hidden` flag; personal versions never touch the repo pipeline.

## Licensing

- **Code** (index.html, tools/, tests/, firestore.rules): [MIT](LICENSE).
- **Content** (everything under roadmaps/): [CC BY-SA 4.0](LICENSE-CONTENT.md) —
  Wikipedia's license; the maps are a commons and derivatives stay open.
  Linked external resources retain their own licenses.
- Contributions are accepted under the same terms — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Testing

- `python3 -m unittest discover -s tests` — validator tests, runs anywhere with python3.
- `node --test tests/` — the app's pure logic (merge/hash/diff/migration),
  extracted from index.html and run against `tests/cases.json`.
- CI (GitHub Actions) runs both, plus the **security-rules suite** against the
  Firestore emulator — `firestore.rules` is the entire server-side boundary,
  so it is tested like one — and content validation + index freshness on
  every push and PR. A nightly lychee workflow probes every content URL and
  maintains a single "link rot" issue.

## Privacy

Progress and notes exist once you sign in — saved to your own server record,
readable and writable by you alone. **Download my data** (on the
account page, and linked from every node's workspace panel) exports everything
as JSON. **Delete my account** on the account page removes identity, progress,
notes, journal, personal versions, shelves, and pending contributions —
self-service, no email needed. (Contributions already merged into maps remain
in the public record under their license.)
Sign-in scripts load from Google/Apple CDNs at runtime; if they fail or are
blocked, the app degrades gracefully to signed-out reading — every map stays
fully readable — and says so honestly; that behavior is a guarantee, not an
accident.

## iOS app (Capacitor)

```bash
npm init @capacitor/app && npx cap add ios
```

Copy `index.html` + `roadmaps/` into `www/`, then `npx cap open ios` and build.
The app already handles safe-area insets and phone-width layouts. Because the
bundle is served from the app's own origin, `fetch("roadmaps/…")` works as-is.
