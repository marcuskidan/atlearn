# CLAUDE.md — working on Waihona

## What this is
A roadmap.sh-style app for general human skills. Static app shell (`index.html`)
+ content as small JSON files under `roadmaps/<category>/topics/`. Full details
and schema: README.md. Surfaces are inventoried in CATALOG.md (the source of
truth for what exists and who sees it), flows are guarded by JOURNEYS.md
(intention-first walkable stories), and PRODUCTS.md is the product-manager
view (plain-language product map: promises, features, status marks — keep it
non-technical); see the Engineering-hygiene rules below.

## Golden rules
1. **Content edits happen in topic files only** (`roadmaps/<id>/topics/NN-slug.json`).
   Never edit `roadmaps/index.json`, `roadmaps/search.json`,
   `roadmaps/search-deep.json`, `roadmaps/*/changelog.json`, or `dist/` — all
   generated (changelogs are appended only by land.mjs/dev.py; health.json is
   deploy-time only and gitignored).
2. After ANY content change, run `python3 tools/build.py` and make it pass.
   It validates schema, ids, tiers, links, and regenerates the index.
3. **Every node needs a `do` action** — a specific real-world task doable this
   week ("Go outside at 9 PM and locate Polaris"), never "practice more".
   Summaries are 2–3 curated sentences, curriculum-grounded, zero filler.
   Nodes may also carry `reflect` (journal prompts, practice maps mostly) —
   reflect never substitutes for `do`.
4. Links: 1–2 per node, https, stable sources only (Wikipedia / .gov / .edu /
   major orgs). No deep YouTube links, no blogs, no guessed URLs.
   **The one hard rule (manifesto): every resource must be freely and legally
   accessible to everyone** — no paywalls, sign-up walls, or region locks.
   The build warns on known-paywalled domains (list: `link-policy.json`,
   maintainer-editable); treat those warnings as bugs.
   Affiliate/tracking query params are build ERRORS (the message shows the
   clean URL). Optional link metadata: `lang` (absent=en), `minutes`,
   `verified` (YYYY-MM-DD, stamp when a human confirms the URL), and
   `succession` (≤5 pre-vetted replacement URLs, best first — the nightly
   Link Steward drafts the swap proposal when the live URL dies).
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
   placeholder — real maps get real names. meta.json also carries the map's
   identity fields, all rendered ONLY on the map header (renderMapHeader) or
   the Atlas (#/atlas): `type` (skill default | practice | gated — gated
   REQUIRES `disclaimer`), `state` (published default | draft | archived —
   draft/archived leave search; drafts leave the shelf), `endpoint` (the
   promise), `cadence`, `version` (semver — bumped by land.mjs/dev.py per
   merge: edit→patch, structure→minor; major is a deliberate hand edit).
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
Every change is one of six ops — `edit`, `add` (new core topic at a
position), `remove`, `spine` (reorder core topics), `move` (subtopic between
core topics), `about` (the official map page's lead prose, stored in meta.json).
File mutations have ONE implementation — `tools/ops.mjs` — consumed by
tools/land.mjs (landing) and tools/dev.py (`POST /dev/apply`, via
tools/apply.mjs). The vocabulary is also understood by the editor UI,
firestore.rules (`validStructOp`), and the client overlay (`applyMergedDocs`;
`about` no-ops there and is applied by `renderMapAbout`/`aboutOf()`). New
capabilities should be expressed in this vocabulary (or extend it in ALL
four places at once: ops.mjs, rules, editor UI, overlay). Rules:
- `firestore.rules` is the entire server-side security boundary — any change
  to it must extend tests/rules.test.mjs, and clients must only get abilities
  the rules actually enforce.
- The landing Action (tools/land.mjs) is the only writer of repo content from
  community data; it must always run build.py before committing. It also
  bumps meta.json `version` and appends `changelog.json` per landed op.
- Maintainer bindings live in the public `meta/roles` Firestore doc (set
  in-app from the account page's Governance panel) — meta.json `maintainer`
  is display fallback only. Role ladder (GOVERNANCE.md): admins bind
  maintainers; the superadmin binds admins; `superadmins` itself is
  console-only — no rule may ever allow a client to write it. Further public
  role docs: `stewards/{rm}` (maintainer-appointed, trivial-merge only —
  note: the rules make a true document DELETE impossible; "remove all
  stewards" = write an empty `members` map), `guilds/{gid}` (admin-written;
  carries guides), `mapstates/{rm}` (orphan flag + designated successor),
  `endorsements` (guide-signed marks).
- Proposal weight classes are rules-enforced: stewards may decide only
  `kind:edit` proposals declared `weight:trivial`; structural kinds
  (add/remove/spine/move) merge only after 7 days from createdAt (reject
  anytime). Proposals and their `comments` subcollection are public-read.
- The AI line: automation writes via the Admin SDK under `by.uid` in the
  reserved `agent:*` namespace (tools/succession.mjs); no client can wear
  that identity (rules-tested), and nothing anywhere lets an agent merge.
  Agent-filed proposals show a 🤖 badge in the review queue.
- Collections (`collections/{id}` docs, `#/collections`) are pointers to maps,
  never content — keep them incapable of touching topic files. Owner-write
  with shape caps; admin moderation is exactly two flags (featured/hidden).
- Personal versions (`forks/{id}` docs, `#/fork/<id>`, the ✨ Personalize
  button) are ops-over-base, never copies: {base, title, ops[], owner},
  rendered through the same `applyMergedDocs` as the merged overlay. Untouched
  topics track the canonical map automatically; "reset to standard" = dropping
  that topic's ops. Forks never reach the repo pipeline. Owner-write, admin
  moderation = `hidden` flag only. Keep the Personalize button quiet —
  suggesting improvements to the shared map is the preferred path. Discovery:
  `#/<category>` is the CATEGORY PAGE (openCategory) — the version picker:
  plain-text identity (title, byline, tagline, endpoint; Wikipedia-style, no
  toggles), then the official branch row pinned first, every public branch
  below with search (title/maintainer) and transparent sort chips (recently
  tended / most changed / newest — never engagement; controls appear at 2+
  branches), a count line, and a start-your-own row. **Machine facts never
  reach walker surfaces**: versions, curricula citations, and domain stats
  are data (meta.json / generated index) that power the pipeline, review
  tooling, and #/health — no version numbers, "grounded in", or resource
  tallies anywhere a walker walks (the what's-new flow speaks in dates and
  plain language, not semver). The official map itself lives at
  the reserved route `#/<category>/map` (node id "map" is a build error);
  `#/<category>/<node>` deep-links straight into the map as always. Every
  map/fork page carries a small "⑂ all versions" button back to the picker.
  Atlas shows a "⑂ N versions" chip (forkCounts, cached; invalidate
  FORK_COUNTS on fork create/delete). Hidden forks stay owner/admin-only.
- Map header stays MINIMAL: title · one byline · small button row (⑂ all
  versions + discussion/report/guild extras) · the wiki-editable `about`
  lead ([ edit ] → dev save / instant merge / proposal by role). The about
  renders on the OFFICIAL map page only — never on branches, never on the
  category picker (that page stays tagline + endpoint + branch list). Gated disclaimers and orphan banners
  are the only always-visible blocks. No explanatory copy on screen (rule 6).
  The reading surface is consumption-first: STRUCTURAL affordances (about
  [edit], Reorganize, Add core topic) render only for devMode or the map's
  moderators (fork tools: fork owner) — see `ownsSurface()`. The node ✏️
  shows for ANY signed-in walker (wiki model): owners' saves merge
  instantly, everyone else's file a proposal into the review queue.
  Signed-out = reading plus SESSION-MEMORY marks (steps/reflect/status
  tick in memory, one "sign in to keep it" nudge per visit, adopted into
  the account on sign-in via mergeStores; notes and every contribution
  affordance stay signed-in). Contributor doors follow ONE DOOR PER
  INTENT: ✏️ is the only path for changes to the lesson (fixes, resources,
  subtopics — propose/merge by role); 💡 (in the drawer's Community
  section) is TIP-ONLY, community text beside the lesson, never in it.
  Both signed-in only. The category picker COLLAPSES at zero visible
  branches (cards/atlas/search go straight to the map; ⑂ and backBtn
  force it open — openCategory(id, forcePicker)).
- The journal is TUCKED AWAY (not core right now): #/journal and sync remain
  functional, but its only entry point is the account page's 📓 button —
  no map-header button, no drawer link, no reflect-prompt glyphs.

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
- **PRODUCTS.md is the product map** — when a feature ships, changes its
  user-facing promise, or gets decided (○ planned) or woken (◐ dormant),
  its product line updates in the same commit. It stays non-technical:
  no element ids, no schema, no code names — those live in CATALOG.md.
- **CATALOG.md is the surface source of truth**, in both directions:
  outline new surface work there first (a `PLANNED` line where the feature
  will live) and remove the marker in the shipping commit — or, when dev
  work changes a surface, update its catalog line in the same commit. A
  surface change without its catalog change is incomplete. Stale catalog
  lines are bugs.
- **Journeys are part of done**: after changing a user-facing surface, walk
  that surface's journeys in JOURNEYS.md (at their listed tier) before
  declaring the change complete — and when a change intentionally alters a
  flow, update its journey in the same change, checking the INTENTION line
  still holds. Surface → journeys: home/search → J1,J3 · routing/back/deep
  links → J2 · atlas → J4 · category picker → J5,J15 · drawer (status/steps/
  notes/links) → J1,J7,J13 · auth/sign-in → J10 · journal → J8 · account/
  privacy → J9,J20 · suggest/tips → J11 · node editor → J12,J22 · report/
  flags → J13,J14 · forks → J15,J16 · review queue → J17,J18,J19 ·
  governance panel/roles → J20,J21 · dev.py/ops.mjs/build.py → J22,J23 ·
  land.mjs/Actions → J24 · succession/link policy → J25 · guilds → J26 ·
  stewardship review → J27 ·
  firestore.rules → cite the tier-D tests + the affected role journeys.
- **Run tests before committing**: `python3 -m unittest discover -s tests`
  and `node --test tests/`. Don't break the extraction harness: the client tests
  brace-match `mergeStores`/`contentHash`/`renderDiff`/`editorMode`/
  `migrateStore`/`esc`/`flatten`/`applyMergedDocs`/`isAdmin`/`maintains`/
  `forkOwned`/`textDelta`/`classifyEditWeight` out of index.html by name;
  renaming them requires updating tests/client.test.mjs. The one extractor
  is tools/extract.mjs — the client tests import it, and tools/succession.mjs
  uses it to pull `contentHash` from index.html so proposal baseHashes never
  drift.
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
- **Check link health**: the nightly **Link check** Action (lychee) maintains
  a single `link-rot` issue and, for dead links with `succession` lists,
  files pre-drafted trivial swap proposals (tools/succession.mjs) into the
  in-app review queue as `agent:link-steward`. Run it on demand from the
  Actions tab. Fix dead links only with URLs you've verified resolve.
- **New core topic**: add `NN-slug.json` to the category's `topics/` (the `NN-`
  prefix is spine order; renumber neighbors if inserting) → run build.
- **New category**: folder + `meta.json` (id must equal folder name; set
  `order`) + `topics/` → run build.
- **Test in browser**: `python3 -m http.server 8123` (content fetch needs HTTP,
  not file://), or build `--standalone` and open `dist/standalone.html`.
