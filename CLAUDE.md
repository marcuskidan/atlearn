# CLAUDE.md — working on Waihona

## What this is
A roadmap.sh-style app for general human skills. Static app shell (`index.html`)
+ content as small JSON files under `roadmaps/<category>/topics/`. Full details
and schema: README.md.

## Golden rules
1. **Content edits happen in topic files only** (`roadmaps/<id>/topics/NN-slug.json`).
   Never edit `roadmaps/index.json`, `roadmaps/search.json`, or `dist/` — all
   generated.
2. After ANY content change, run `python3 tools/build.py` and make it pass.
   It validates schema, ids, tiers, links, and regenerates the index.
3. **Every node needs a `do` action** — a specific real-world task doable this
   week ("Go outside at 9 PM and locate Polaris"), never "practice more".
   Summaries are 2–3 curated sentences, curriculum-grounded, zero filler.
4. Links: 1–2 per node, https, stable sources only (Wikipedia / .gov / .edu /
   major orgs). No deep YouTube links, no blogs, no guessed URLs.
   **The one hard rule (manifesto): every resource must be freely and legally
   accessible to everyone** — no paywalls, sign-up walls, or region locks.
   The build warns on known-paywalled domains; treat those warnings as bugs.
5. Tiers: `essential` | `recommended` | `extra` (children roughly 50/30/20).
   Children nest exactly one level — the renderer draws spine topics down the
   center and children as left/right branches automatically; there is no layout
   data to maintain.
   Spine order: meta.json may carry `spine` (ordered list of topic file
   names) — when present it is the order authority and the NN- prefix is
   cosmetic; without it, sorted file names decide. Structural tools maintain
   `spine` automatically; when hand-inserting without one, renumber neighbors.
6. Explanatory/mission copy lives ONLY on the About page (the manifesto in
   index.html) — never scatter "what this app is" text into other UI surfaces.
7. Each roadmap's `meta.json` has a `maintainer` name shown on its map header
   ("· maintained by …"). Library cards are deliberately spare — emoji + title
   + progress bar only; never add copy to them. "The Admins" is a
   placeholder — real maps get real names.
8. Sensitive categories have standing constraints:
   - `personal-finance`: strictly conceptual education, no advice, no product
     or investment recommendations; link to consumerfinance.gov / investor.gov.
   - `first-aid`: awareness-level only; point to certified courses (Red Cross/
     AHA) and emergency services; never present the app as certification.
   - `mental-health`: educational self-care framing; keep the
     professional-help/988 pathways intact.

## Editorial layer (no servers)
Structured-edit pipeline (see README "Editorial layer"): contributors propose
via the in-app editor → per-map maintainers merge with diff review → the
merged edit becomes a public-read `merged/{id}` Firestore doc that serves
instantly as a content overlay AND queues for the **Land content** GitHub
Action, which validates it with build.py and commits it to main with
attribution (then Pages redeploys).
Every change is one of five structural ops — `edit`, `add` (new core topic at
a position), `remove`, `spine` (reorder core topics), `move` (subtopic between
core topics) — understood identically by the editor UI, firestore.rules,
tools/dev.py (`POST /dev/apply`), the client overlay (`applyMergedDocs`), and
tools/land.mjs. New capabilities should be expressed in this vocabulary (or
extend it in ALL five places at once). Rules:
- `firestore.rules` is the entire server-side security boundary — any change
  to it must extend tests/rules.test.mjs, and clients must only get abilities
  the rules actually enforce.
- The landing Action (tools/land.mjs) is the only writer of repo content from
  community data; it must always run build.py before committing.
- Maintainer bindings live in the public `meta/roles` Firestore doc (set
  in-app from the account page's Governance panel) — meta.json `maintainer`
  is display fallback only. Role ladder (GOVERNANCE.md): admins bind
  maintainers; the superadmin binds admins; `superadmins` itself is
  console-only — no rule may ever allow a client to write it.
- Collections (`collections/{id}` docs, `#/collections`) are pointers to maps,
  never content — keep them incapable of touching topic files. Owner-write
  with shape caps; admin moderation is exactly two flags (featured/hidden).
- Personal versions (`forks/{id}` docs, `#/fork/<id>`, the ✨ Personalize
  button) are ops-over-base, never copies: {base, title, ops[], owner},
  rendered through the same `applyMergedDocs` as the merged overlay. Untouched
  topics track the canonical map automatically; "reset to standard" = dropping
  that topic's ops. Forks never reach the repo pipeline. Owner-write, admin
  moderation = `hidden` flag only. Keep the Personalize button quiet —
  suggesting improvements to the shared map is the preferred path.

## Community layer
In-app suggestion → maintainer/admin review pipeline (see README "Community layer").
Rules when touching it:
- Curated content must never become writable via the API — approved community
  input either publishes as a separate, labeled tip or exports for manual curation.
- All user-generated text must go through `esc()` before touching innerHTML.
- A common maintainer task: take the review queue's "accepted for curation"
  JSON export and fold each item into the right topic file (respecting the
  content rules above), then run the build.

## Engineering hygiene
- **Run tests before committing**: `python3 -m unittest discover -s tests`
  and `node --test tests/`. Don't break the extraction harness: the client tests
  brace-match `mergeStores`/`contentHash`/`renderDiff`/`editorMode`/
  `migrateStore`/`esc`/`flatten`/`applyMergedDocs`/`isAdmin`/`maintains`/
  `forkOwned` out of index.html by name; renaming them requires updating
  tests/client.test.mjs.
- Stored-data schema changes go through `migrateStore()` (bump STORE_V, add an
  upgrade branch) — never change record shapes without a migration.
- Landing health: the **Land content** Action lands, deploys, and retires
  `merged` docs in a single run (scheduled every 6 h; trigger it from the
  Actions tab to land on demand — the overlay serves users instantly either
  way). A doc stuck with an `error` field needs admin attention
  (fix the content or clear the doc via the Firebase console).

## Common tasks
- **Deepen a topic**: edit its single topic file (add children, improve
  summaries/links/actions) → run build. Or run `python3 tools/dev.py` and use
  the in-app ✏️ editor — saves write the same files with validation built in.
- **Check link health**: the weekly **Link check** Action (lychee) maintains
  a single `link-rot` issue; run it on demand from the Actions tab. Fix dead
  links only with URLs you've verified resolve.
- **New core topic**: add `NN-slug.json` to the category's `topics/` (the `NN-`
  prefix is spine order; renumber neighbors if inserting) → run build.
- **New category**: folder + `meta.json` (id must equal folder name; set
  `order`) + `topics/` → run build.
- **Test in browser**: `python3 -m http.server 8123` (content fetch needs HTTP,
  not file://), or build `--standalone` and open `dist/standalone.html`.
