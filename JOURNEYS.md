# JOURNEYS.md — the flows that must not break

Every tool in Atlearn exists to serve an intention written in GOVERNANCE.md
and the manifesto. This file is the checkable list of those intentions as
walkable journeys. Its partners are CATALOG.md — the inventory of every
surface and feature (what exists, who sees it) — and PRODUCTS.md, the
plain-language product map; GOVERNANCE holds *why*, the products hold *the
promise*, the catalog holds *what*, the journeys prove *it works*. A journey FAILS in two ways: a step doesn't behave as
written (**breakage**), or the steps still pass but no longer serve the
INTENTION line (**drift**). Check both, in that order — intention first.

**Stories are part of done.** An intentional change to a flow updates its
journey in the same commit, exactly like a behavior change without a test
change is incomplete. Full rules at the bottom.

## How to run a tier

Each story carries the CHEAPEST tier that can verify it.

| Tier | Meaning | Start it |
|---|---|---|
| A | Browser, plain server, signed out | Recipes below |
| B | Browser + dev server (writes real files) | Recipes |
| C | Browser, demo sign-in (google:demo-user = superadmin) | Recipes |
| D | Automated: Firestore emulator / CI — cite, don't walk | Recipes |
| E | Deployed production only — walk after deploy | Recipes |

E-tier stories are written now; walk them the day the app is connected.
Stories marked **DORMANT** describe surfaces with no live data yet — run
their steps as far as the data allows and stop without failing.

Conventions:
- EXPECT lines are observable facts only: DOM state, exact toast text, file
  diff, console. Quoted toast strings are contract copy — change the string,
  change the journey, same commit.
- Reset walker state between stories: sign out and reload — signed-in state
  lives on the server, per account, so stories that write need a throwaway
  account (or Account → 🗑 delete between runs). Signed-out visitors hold no
  persistent state; a reload is a fresh visit.
- Console must stay free of app errors throughout (browser-pane-blocked
  external resources and the expected `/dev/ping` 404 on the plain server
  are noise, not failures).
- `roadmaps/health.json` may exist locally (it's gitignored, deploy-time
  data) — `#/health` showing stale local numbers is expected, not a failure.
- Steps guarded by native `confirm()`/`prompt()` dialogs (delete account,
  delete fork/entry, reject reasons) need a HUMAN walker — automated browser
  panes auto-cancel native dialogs. An automated run verifies everything up
  to the dialog and notes the guarded step as "manual".

## Recipes

### Tier A — plain server, signed out
```bash
python3 -m http.server 8124
```
Open http://localhost:8124. devMode is OFF — the `/dev/ping` probe 404s,
which is the point of using 8124/http.server. Never plain-serve on 8123:
a tab that once saw dev.py there can carry a stale devMode impression.
Fresh visitor: reload (or a private window) — signed-out holds no state.

### Tier B — dev server (writes REAL files under roadmaps/)
```bash
cp -R roadmaps /tmp/journeys-baseline   # snapshot FIRST — never git checkout
python3 tools/dev.py                    # serves on :8123, devMode ON
```
Open http://localhost:8123 — every node grows ✏️, no sign-in needed.
After destructive journeys, restore the snapshot:
`rm -rf roadmaps && cp -R /tmp/journeys-baseline roadmaps && python3 tools/build.py`.
NEVER `git checkout -- roadmaps/` on a dirty tree — it reverts uncommitted
work along with your test edits. Verify content changes with
`python3 tools/build.py`. Needs `node` on PATH (the editor delegates to
tools/apply.mjs).

### Tier C — demo sign-in
Requires `FIREBASE_CONFIG: null` in config.js (this checkout's default).
On a Tier A or B server: Sign in → Continue with Google → you are
"Explorer" (google:demo-user), superadmin in demo mode. Demo renders every
role surface but NOTHING persists — connected writes, progress and notes
included, toast honestly. Expect render-without-write throughout.

### Tier D — emulator / CI (automated; cite, don't walk)
```bash
python3 -m unittest discover -s tests    # build + dev suites
node --test tests/                       # client + ops suites
```
tests/rules.test.mjs needs the Firestore emulator (JVM) — it runs in CI on
every push; locally without Java it self-skips ("no emulator"). Do not
re-implement rules assertions as journeys; cite them.

### Tier E — deployed production
Needs config.js filled in (DEPLOY.md) and the site live. Role stories need
real accounts bound via Account → Governance. Pipeline stories use the
repo's Actions tab (Land content / Link check, run-on-demand).

---

# Group I — Signed-out walker · *the free library*

*"Viewing is always free, for everyone, forever." The whole library, and
nothing asks anything of the visitor.*

### J1 · Signed-out walker · First visit: shelf → map → node, feel the loop   [Tier A]
INTENTION — A visitor with no account gets everything readable plus the
core loop itself — ticking a step and setting status work in session
memory, honestly nudged toward the account that would keep them — while
every contribution and editing affordance stays out of sight (GOVERNANCE
walker row; CLAUDE.md map-header rule).
COVERED ELSEWHERE — client.test.mjs "editorMode role matrix" (logic only);
only the walk catches the actual DOM gating (`ro` branch, `ownsSurface()`).
SETUP — Tier A, fresh visitor.
STEPS
1. Load `/` — library cards are spare (emoji + title + progress bar only);
   the hero shows no "Browse collections" link while no shelf exists.
2. Click a card → straight to `#/astronomy/map` (zero community branches =
   the picker collapses; no interstitial).
3. Click a spine node → drawer opens.
4. Tick the first Do step.
EXPECT
- Drawer: summary/links/do-list render (no restated title — the tapped
  card already said it); status segment AND step
  checkboxes are LIVE; NO notes box, NO 💡, NO ⚑ link flags, NO ✏️, and no
  💬 Community heading while the node has no tips.
- The first tick marks the step, auto-advances status to ⋯ (drawer and map
  node), and shows the one nudge toast: "✓ Marked for this visit — sign in
  (free) to keep your progress". Reloading the tab forgets the marks —
  nothing was stored.
- The 🔑 sign-in invite (`#dSignInSec`) is visible; clicking it opens the
  auth modal.
- Map header: no `[ edit ]`, no ＋ Add core topic, no ⇅ Reorganize.
- No 🕘 history button while `GITHUB_REPO` is `""`.
- No version numbers anywhere on the walking surface.

### J2 · Signed-out walker · Addresses are honest: deep links, back, brand   [Tier A]
INTENTION — Every view has a shareable address that lands exactly where it
says (README "Finding things & sharing them"); back goes UP a level, never
blindly home.
COVERED ELSEWHERE — none; routing is journey-only.
SETUP — Tier A.
STEPS
1. Paste `#/astronomy/getting-started` cold → map renders with the drawer
   open and the node scrolled into view.
2. Close drawer; backBtn → category picker; backBtn again → home.
3. From any view, click the brand mark → home.
4. Browser back/forward replays the trail correctly.
5. Paste `#/nonsense` → home, no error. Paste `#/review` → home (the review
   queue is deliberately un-addressable).
EXPECT
- Each hop matches the routing table comment in index.html ("URL routing").
- The address bar always reflects the visible view.

### J3 · Signed-out walker · Search: titles first, deep index when thin   [Tier A]
INTENTION — "A map orients" (charter): finding the right node fast is the
orientation function; search must reach summaries when titles run out.
COVERED ELSEWHERE — test_build.py `test_unpublished_maps_left_out_of_search`
(index generation). Journey-only: the two-stage fetch and result routing.
SETUP — Tier A, home.
STEPS
1. Search a node-title word (e.g. "polaris") → results are map/node links;
   map results are labeled "all versions" (they open the picker).
2. Click a node result → deep-linked drawer opens.
3. Search a phrase that lives only in a summary or do-action → deep-index
   results appear ("matches the summary or actions").
EXPECT
- Title matches list before deep matches; draft-state maps never appear.

### J4 · Signed-out walker · Atlas discovery   [Tier A]
INTENTION — Which maps exist is transparent, browsable by fixed criteria a
human can explain — never engagement (Atlas comment; GOVERNANCE anti-metric
stance).
COVERED ELSEWHERE — none.
SETUP — Tier A → `#/atlas` (via "Explore the atlas →" under the home
search bar).
STEPS
1. All published maps list; type in the atlas search → rows narrow on
   title/endpoint/maintainer.
2. Click each visible filter chip in turn → rows filter to maps carrying
   that criterion; click again to clear.
3. Click a row → that map's category picker.
4. Below the list: "Maps the library is looking for" chips — a chip
   opens the new-map proposal with its title prefilled.
EXPECT
- Filter chips are data-driven: every visible chip has ≥1 matching map and
  shows its count; criteria with zero maps (e.g. "✓ fresh" before any link
  carries `verified`) show no chip at all.
- Both sorts are the transparent criteria (curated order / recently
  verified); an empty result shows "No maps match — clear the search or
  filter."

### J5 · Signed-out walker · The category picker keeps machine facts out — and collapses at one version   [Tier A]
INTENTION — Machine facts (versions, citations, tallies) never reach walker
surfaces (CLAUDE.md); the picker is plain-text identity + branch list,
Wikipedia-style — and at zero community branches it isn't a stop at all.
COVERED ELSEWHERE — none.
SETUP — Tier A → `#/astronomy/map`, then click "⑂ all versions" (with zero
branches, pasting `#/astronomy` continues straight to the map — verify
that first).
STEPS
1. Paste `#/astronomy` → lands on the map, not the picker.
2. Click "⑂ all versions" → the picker opens (forced); backBtn from the
   map also opens it.
3. Inspect the page top to bottom.
EXPECT
- Exactly: title, byline, tagline, endpoint, disclaimer (gated maps only),
  official row pinned first, branch search + sort chips (only at 2+
  branches), a count line, and the "＋ Start your own branch" row.
- No version numbers, no "grounded in", no resource tallies, and no about
  prose — the about lead renders on `#/astronomy/map` only (confirm it does).

# Group II — Signed-in walker (demo) · *your progress is yours*

### J6 · retired 2026-08-09: persistence moved server-side. (Amended same
day: guests DO hold session-memory marks again — steps/status only, never
stored — and `finishSignIn` adopts them into the account via the LWW
merge, so the J1 nudge's promise is kept. The retired journey's
localStorage guest store stays gone.)

### J7 · Signed-in walker · Progress, steps, notes save to the account — server-side   [Tier E, widgets render at C]
INTENTION — Every status change, checked action, and note is written to the
walker's own server record the moment they act; the UI reflects it
instantly and reports save state honestly. The ACCOUNT holds the data —
any device, same progress; the device holds nothing durable.
COVERED ELSEWHERE — mergeStores/migrateStore tests (merge logic);
rules.test.mjs owner-only user store (D). Journey-only: the drawer
widgets, the debounced push, cross-device reflection.
SETUP — Tier E, signed in.
STEPS
1. Open a node: status segment visible; tap ⋯ then ✓ → node badge updates
   on the map.
2. Check a do-step → auto-advances a not-started node to in-progress.
3. Type a note → "Saved ✓" hint appears once the debounced push lands; cut
   the network and change another node → the sync dot reports the pending/
   failed write honestly, and the retry lands it when the network returns.
4. Close drawer; the library card's progress bar reflects the change.
5. Reload → all state intact, pulled from the server. Sign in from a
   second browser → the same progress and note are there.
EXPECT
- State lives in the walker's own server record (owner-only per
  firestore.rules); nothing durable in browser storage; save state is
  never silently faked.

### J8 · Signed-in walker · The journal is tucked away but whole   [Tier E, entry points render at C]
INTENTION — The journal is deliberately TUCKED AWAY (CLAUDE.md): functional
and private, reachable only from the account page — no map-surface tentacles.
Entries live in the account's server record, owner-only.
COVERED ELSEWHERE — rules.test.mjs journal owner-only suite (D).
Journey-only: the entry-point discipline.
SETUP — Tier E, signed in (entry-point checks 1–2 also render at C).
STEPS
1. Confirm NO journal button on the map header or drawer.
2. Account page → 📓 Journal → `#/journal`.
3. Write an entry → save → "📓 Saved — yours alone".
4. Delete it (confirm dialog) → gone.
5. Deep-link `#/journal/astronomy` → composer preselects that map.
EXPECT
- Entries persist across reload; no reflect-prompt glyphs anywhere on maps.

### J9 · Signed-in walker · Privacy: export everything, delete everything   [Tier E]
INTENTION — "Always exportable" and self-service deletion — the right to
leave, without emailing anyone (Privacy page promise).
COVERED ELSEWHERE — rules.test.mjs owner-only access (D). Journey-only:
the whole flow.
SETUP — Tier E with some progress/notes/journal created.
STEPS
1. Account → 📦 Download my data → JSON downloads; open it: progress,
   notes, journal all present.
2. `#/privacy` reads correctly (signed-out visitors are read-only; data
   exists once signed in).
3. Account → 🗑 Delete my account → two confirms.
EXPECT
- Landed signed-out; the account's server records (progress, notes,
  journal, forks, shelves, pending contributions) are gone; the app is in
  fresh-visitor state (J1 assertions hold).

### J10 · Signed-in walker (demo) · Unconfigured mode degrades honestly, never lies   [Tier C]
INTENTION — Without a configured backend the app degrades gracefully and
HONESTLY: every unavailable capability says so; nothing fakes a submit
(README privacy guarantee).
COVERED ELSEWHERE — none; this story is the drift alarm for demo copy.
SETUP — Tier C, signed in as demo.
STEPS + EXPECT (exact toast strings are contract copy)
1. Node 💡 Suggest → fill → submit → toast **"Suggestions need the
   connected app — this copy isn't connected"**; modal stays open; nothing
   pretends to queue.
2. Category page "＋ Start your own branch" → toast **"Personal versions
   need the connected app"**; no fork created (no `#/fork/` navigation).
3. Collections → ＋ Create a collection… → toast **"Collections need the
   connected app"**.
4. Node ✏️ opens the editor in **export** mode: Save offers download/copy
   JSON — never a fake proposal.
5. Status taps, do-step checks, and notes → toast **"Progress and notes
   need the connected app"** (notes box is read-only); a reload confirms
   nothing persisted.
6. Journal composer save (and the streak toggle) → toast **"The journal
   needs the connected app"**; the entry list stays empty.
7. 🕘 history absent (GITHUB_REPO "").
EXPECT — every toast exact; nothing silently no-ops.

# Group III — Contributor (connected) · *anyone improves the shared map*

### J11 · Contributor · 💡 Share a tip → tip lifecycle   [Tier E]
INTENTION — Community input publishes as a labeled tip beside the curated
content, never inside it; affiliation disclosure is the deal (GOVERNANCE
integrity; CLAUDE.md community layer). The 💡 door is TIP-ONLY — one door
per intent: changes to the lesson (fixes, resources, subtopics) go through
✏️ (J12), and the modal's context line points there.
COVERED ELSEWHERE — rules.test.mjs suggestion create/moderation + tips
write-scope + affiliate tripwire (D). Journey-only: the form UX and the
labeled rendering.
STEPS
1. Signed-in (no roles): the node's 💬 Community section → "💡 Share a
   field-tested tip…" (no type chips — the modal is the tip form), check
   "personally verified"; check "affiliated" → description becomes required.
2. Paste a URL with `?utm_source=x` → blur strips it (toast shows).
3. Submit → "🙏 Submitted — the maintainer will review it".
4. As that map's maintainer: review queue → Suggestions → 🌟 Publish as tip.
5. As anyone: the node's 💬 Community section shows the labeled tip with
   attribution and its own ⚑ flag; moderators also see a ✕ remove.
EXPECT — the underlying topic JSON is unchanged (tips are a separate doc);
the tip is visually separate from LEARN/DO.

### J12 · Contributor · ✏️ Propose — the wiki model   [Tier E]
INTENTION — Anyone signed in can propose a precise edit in the SAME editor
the maintainer uses; no resource enters a published map without a named
human clicking merge (GOVERNANCE).
COVERED ELSEWHERE — client.test.mjs classifyEditWeight/renderDiff/
contentHash; rules.test.mjs proposal lifecycle + contributor feedback loop
(D). Journey-only: ✏️ visibility for non-owners, propose-mode chrome, the
round trip to the queue.
STEPS
1. Signed-in non-owner opens any node → ✏️ IS visible → editor opens.
2. Edit the summary → the save button reads "Propose change"; the mode note
   says it goes to the maintainer for review, CC BY-SA.
3. Submit with a note → proposal appears in the map's 💬 Discussion list
   (public) and in the author's Account → "Your contributions" (pending,
   with Withdraw).
EXPECT — the proposal carries baseHash and a declared weight; withdrawing
works while pending; a decided proposal shows its status + any reason.

### J13 · Contributor · ⚑ Resource flags   [Tier E]
INTENTION — The cheapest contribution: one tap says a link is dead/stale/
unhelpful, aggregated for the maintainer (GOVERNANCE walker row).
COVERED ELSEWHERE — rules.test.mjs idempotent-flag suite (D).
STEPS
1. Signed-in: node → each resource shows ⚑ → flag one "💀 dead".
2. Flag it again → no double count (deterministic doc id).
3. As maintainer: review queue → 🔗 Flags shows the aggregate with reason
   breakdown → "✓ Clear flags (fixed)" empties it.
EXPECT — flags are invisible to other walkers (no public shaming surface).

### J14 · Contributor · ⚑ Report — the safety front door   [Tier E]
INTENTION — Dangerous content gets a 48-hour-norm red queue; reports reach
the named humans accountable for that map (GOVERNANCE safety).
COVERED ELSEWHERE — rules.test.mjs safety queue + report shape (D).
STEPS
1. Map header ⚑ Report → choose safety severity → describe → submit →
   "🚨 Red-flagged — safety reports get looked at within 48 hours".
2. As that map's maintainer: Reports tab shows it bordered red, sorted
   first, with the 48h badge. As a steward: the Reports tab is absent.
3. Resolve with a written resolution → report closes; the text of the
   report itself was never editable.

# Group IV — Fork owner · *the fork valve: disagreement without a governance fight*

### J15 · Fork owner · Branch lifecycle: create, edit, publish, share, delete   [Tier E]
INTENTION — A personal version is *changes over the living base* — born
UNLISTED, resettable; reaching the public listings is the owner's
deliberate act (GOVERNANCE fork valve: the commons is not fillable by
accident).
COVERED ELSEWHERE — rules.test.mjs fork guards incl. born-unlisted +
intro; client.test.mjs applyMergedDocs (D). Journey-only: the visible
lifecycle.
STEPS
1. Category page → "＋ Start your own branch" → fork created → `#/fork/<id>`;
   toast says it's private; the row now reads "Open your branch" (one per
   map per user). The picker does NOT list it for others yet.
2. Edit one topic in the fork → save → base map unchanged (open
   `#/<cat>/map` in another tab to confirm).
3. Untouched topics still track the base; "↩ Reset this topic to the
   standard version" drops the divergence.
4. ✨ button (bottom-left) opens the branch panel: ✎ subtitle ("the
   beginner version") → Enter; it renders on the panel and, once listed,
   on the picker's branch row. "[ write an intro for your branch ]" on
   the map header saves prose to the fork doc — rendered to every
   visitor, exactly like the official about but owner-held.
5. Panel: 🌍 Publish to the category page → the picker lists the branch
   with attribution and subtitle; Atlas shows "⑂ 1 version". Make
   private → both revert; the direct link still works.
6. 🔗 Share → open the link in a private window → renders read-only
   (listed or not — a link is a door, the listing is the shelf).
7. 🗑 Delete → picker and Atlas revert.
EXPECT — the 100-op cap message appears rather than silent truncation if
ever hit; walking progress on the fork shares the base map's records.

### J16 · Walker · Someone else's branch is walkable, never editable   [Tier E]
INTENTION — Viewing is free for anyone, always — including community
branches; but only the owner shapes their version.
COVERED ELSEWHERE — client.test.mjs editorMode (fork only when owned).
STEPS
1. Open a shared `#/fork/<id>` signed out, then signed in as a non-owner.
EXPECT
- Map renders through the overlay; NO ✏️/structural tools, NO 🕘, NO 💡
  (suggestions serve the shared map). The owner's intro prose (if any)
  renders read-only; the ✨ panel offers Share/⚑ only.
- The banner offers 🔗 Share and ⚑ Report (non-owners); "⑂ all versions"
  and backBtn both return to the base's category picker.
- Admins additionally see 🙈 Hide/👁 Unhide (report recourse short of
  deletion).

### J28 · Map maker · Personal map lifecycle: create, edit, share, delete   [Tier E]
INTENTION — Creation without permission, a commons with a bar (Marcus,
2026-08-10): a personal map exists the moment its owner names it — free,
uncapped, absent from every library surface; the shelf is the repo and
is reached only through review. The link is the door.
COVERED ELSEWHERE — rules.test.mjs usermap guards (create/spoof/oversize/
stranger/admin-hidden-only); client.test.mjs applyMergedDocs +
drawer-escape (D — usermap content renders through the same escaped
builders). Journey-only: the visible lifecycle.
STEPS
1. Home, signed in + connected → "🗺 Start a personal map…" → name it →
   Create → `#/umap/<id>` opens with the starter topic's editor;
   toast states the fact: private, link-shareable.
2. Edit the starter topic, add a topic, reorganize, set a child's side —
   the full editor; every save toast says "your map". The library shelf,
   Atlas, and search show nothing new (in another tab).
3. 🗺 corner button → panel: ✎ rename (emoji + title), ✎ tagline,
   "[ write an intro for your map ]" on the header — all owner-held
   facts, no publish control anywhere (nothing to list into).
4. 🔗 Share → open the link in a private window → renders read-only:
   no ✏️/structural tools, no ⑂ all versions, no 🕘, no 💡; panel
   offers Share/⚑ only; back goes home. Guest ticks are session-memory,
   sign-in adopts them (J1's loop, unchanged on a personal map).
5. Account page → "Your maps" lists it: Open / 🔗 Copy link / 🗑 Delete.
6. Signed in as a SECOND user with the link → panel → "⑂ Branch" → a
   full copy opens as their own map, panel reads "⑂ branched from
   <title> by <owner>"; edits to the copy never touch the source, and
   deleting the source leaves the copy (and its attribution line)
   standing.
7. Owner → panel → "🌱 Offer to the library" → the suggest modal opens
   in roadmap mode with the outline and the map link prefilled; submit
   → it appears in the admins' queue like any proposed map (J17's desk;
   GOVERNANCE "What the library shelves" is the bar). Nothing about the
   personal map itself changes.
8. 🗑 Delete (panel or account) → the link stops working; nothing else
   in the library moved at any point.
EXPECT — the 40-topic cap speaks in the editor rather than truncating;
progress on a personal map is keyed `u:<id>` and never collides with a
category; admins see 🙈 Hide/👁 Unhide on reported maps.

### J29 · Map maker · A name worth sharing: handle, page, listed work   [Tier E]
INTENTION — The champion persona's first ask (LATER.md §4b): a bio link
can't be `#/umap/x8Ttq2`. A handle is a first-come claim; the page it
opens is the creator's own shelf — listing there is the owner's act and
never touches the library.
COVERED ELSEWHERE — rules.test.mjs handle guards (claim/collide/spoof/
release) + usermap slug/listed guards (born unlisted on the page too).
STEPS
1. Account page → "Your page" → type a name → Claim → the section shows
   @name with copy-link and release. A second account claiming the same
   name is told it's taken.
2. On a personal map's panel → "🌍 Put on your page" → the map gains its
   slug (from the title) and the state line reads "Listed on your page".
   Home shelf, Atlas, and search still show nothing.
3. Open `#/@name` in a private window → the page lists the map (and any
   published branches); rows open them. `#/@name/<slug>` opens the map
   directly.
4. "Take off your page" → the page no longer lists it; the direct link
   still works (a link is a door, the page is a shelf).
5. Release the handle (confirm) → `#/@name` says no one holds it;
   listed flags remain on the docs, meaningless until a new claim.
EXPECT — handles are 3–30 chars of a-z 0-9 dashes, lowercased on entry;
one handle per person is the norm the UI assumes (the first claim wins
if data ever says otherwise).

### J30 · Branch owner + walker · Suggestions by invitation, decided by the owner   [Tier E]
INTENTION — Feedback on a personal surface is opt-IN (champion persona's
second ask; brigading stays off by default), and the owner holds full
authority over their own branch: same review tools as maintainers, no
weight classes, no comment clock.
COVERED ELSEWHERE — rules.test.mjs branch-proposal guards (open door
only, spoofed owner, owner-alone decides, structural merges without the
clock); client.test.mjs editorMode branch matrix (D).
STEPS
1. Owner, on a branch or personal map → panel → "🌱 Accept suggestions"
   → the panel gains "🛡️ Review suggestions".
2. A second signed-in user opens the branch → ✏️ now shows; the editor
   banner names the OWNER as reviewer; save files the proposal ("the
   owner of this branch decides").
3. Owner → panel → 🛡️ → the proposals tab shows the card badged
   "✨/🗺 branch suggestion", diffed against the branch as rendered;
   Merge applies it to the branch (ops for a fork, topics for a personal
   map) and the map shows the change on next open; Reject asks for the
   written reason the author will read.
4. The author's account page shows the decision either way (J9's
   contributions list, unchanged).
5. Owner → "Close suggestions" → the stranger's ✏️ disappears again;
   their pending proposals stay decidable.
EXPECT — a maintainer or admin sees branch suggestions in their queue
only as read-only cards ("the branch's owner decides this one"); the
door being open never lets anyone write to the branch directly.

# Group V — Gardeners · *scoped authority, publicly recorded*

### J17 · Maintainer · Review: diff, merge-to-overlay, reject-with-reason   [Tier E]
INTENTION — One accountable voice per map; rejection reasons are the map's
public pedagogical record; merges serve instantly (GOVERNANCE; README
editorial layer).
COVERED ELSEWHERE — client.test.mjs renderDiff; rules.test.mjs moderation
scope + merged attribution (D). Journey-only: queue UI, scoping, the live
overlay.
STEPS
1. As a bound maintainer: 🛡️ Review appears (top bar AND account page);
   the queue shows only their maps' items, with age chips.
2. Open a pending edit → field-level diff (− old / + new); a stale-base
   warning if the map moved since proposing.
3. Merge → "🛡️ … live now; lands in the public record within the hour" →
   reload the map as any user: the change is visible (overlay).
4. Reject another → a written reason is REQUIRED → the author sees it in
   their contributions panel.

### J18 · Maintainer · Structure waits seven days; rejection never waits   [Tier E]
INTENTION — Structural changes sit through an open comment period so the
maintainer decides informed; "a fast no beats a slow one" (GOVERNANCE
weight classes).
COVERED ELSEWHERE — rules.test.mjs 7-day enforcement + comments (D).
STEPS
1. Open a fresh structural proposal → the card shows "🕐 comment period —
   Nd left" and merge is blocked (toast names the period if forced).
2. Reject works immediately, reason required.
3. The comment thread: public read, signed-in immutable posts, moderator
   delete.
4. A proposal declared trivial whose diff recomputes substantive carries
   the "⚠ declared trivial, looks substantive" flag.

### J19 · Steward · Trivial-only, and the queue never misleads   [Tier E]
INTENTION — Stewards merge trivial edits only — never structure, never
suggestions/reports; and the UI hides what they cannot use rather than
showing empty tabs (the code's own honesty rule).
COVERED ELSEWHERE — rules.test.mjs steward suite incl. "stewards cannot
read others' suggestions" (D — the strongest automated coverage in this
file). Journey-only: the hidden-tabs assertion and button-level gating.
STEPS
1. Sign in as a steward (bound via J20) → 🛡️ Review appears (top bar and
   account page).
2. The queue shows ONLY "Proposed edits"; Suggestions / Accepted / Reports
   / Flags tabs are ABSENT.
3. Merge a `weight:trivial` edit → succeeds. A structural or substantive
   proposal offers no merge affordance. An `about` proposal is not
   steward-decidable.

### J20 · Admin / Superadmin / Maintainer · Governance panel: every binding public, in-app   [Tier E, renders at C]
INTENTION — Bindings live in one public document; succession is a one-line
change; no client path mints root (GOVERNANCE roles ladder).
COVERED ELSEWHERE — rules.test.mjs escalation ladder + steward binding +
mapstates (D).
STEPS
1. Account → Governance: admin binds a maintainer uid to a map → the new
   maintainer's account shows the 🧑‍🌾 chip and 🛡️ appears for them.
2. Maintainer: steward editor (own maps only) binds a steward; names a
   designated successor (public record; the panel says admins confirm the
   handover via the Maintainers panel).
3. Superadmin: binds an admin. Nothing anywhere in the UI can write
   `superadmins` (console-only, by design).
DEMO NOTE (tier C): panels render for google:demo-user; every write toasts
— expect render-without-write.

### J21 · Admin + candidate · Orphaning and adoption   [Tier E]
INTENTION — "No maintainer, no map" resolves as a graceful public handoff:
the map stays live, seeking; the successor holds right of first refusal
(GOVERNANCE lifecycle).
COVERED ELSEWHERE — rules.test.mjs mapstates + adopt-type suggestion (D).
STEPS
1. Admin flags a map orphaned → header shows the 🍂 seeking-maintainer
   banner (+ designated successor line if recorded) + "🙋 Apply to adopt
   this map"; the Atlas and picker show 🍂 chips.
2. A candidate applies → reviewer's queue shows the "🙋 adoption
   application" card with the candidate's uid and the literal instruction
   to bind it in Account → Governance → Maintainers.
3. Buttons are "✓ Mark handled" / "✕ Decline" (no tip publishing).
4. Admin binds the new maintainer; clears the orphan flag → banner gone.

# Group VI — Dev-mode author · *one engine, git-diffable files*

### J22 · Author · Dev-server round trip: all six ops, then rollback   [Tier B]
INTENTION — Every mutation flows through ONE op engine (tools/ops.mjs);
content is ordinary git-diffable files; a failed apply restores the tree
byte-identical (CLAUDE.md editorial layer).
COVERED ELSEWHERE — tests/ops.test.mjs (all six ops, versioning, changelog),
tests/test_dev.py (apply + byte-identical rollback), tests/test_build.py.
Journey-only: the editor UI reaching the engine per op; the dev-detected
copy; the visible git diff.
SETUP — Tier B recipe; take the roadmaps/ snapshot FIRST.
STEPS
1. **edit** — change a node summary → Save → `git diff` shows that topic
   file + meta.json patch-bump + changelog.json append.
2. **add** — ＋ Add core topic at a chosen position → new `NN-slug.json`,
   spine updated, minor-bump.
3. **move** — send a subtopic to another core topic → both files touched.
4. **spine** — ⇅ Reorganize → meta.json spine order changes.
5. **remove** — delete the added topic → file gone, spine drops it.
6. **about** — `[ edit ]` on the official map lead → the modal says
   "💾 Saves directly to roadmaps/<id>/meta.json — dev server detected".
7. `python3 tools/build.py` → passes.
8. **rollback** — attempt an invalid edit (e.g. delete all do-actions) →
   rejected with a readable error; `git diff` shows the tree unchanged by
   the failed attempt.
CLEANUP — restore the snapshot (recipe) unless the edits were real.

### J23 · Returning walker · What's-new after a change   [Tier B mechanics, pill at E]
INTENTION — Never a silent yank forward: a walker mid-path sees what moved,
in dates and plain language — never semver (GOVERNANCE versioning;
CLAUDE.md machine-facts rule). Seen-version records ride in the account's
server store, so "since your last visit" means the account's last visit,
on any device.
COVERED ELSEWHERE — ops.test.mjs changelog suite. Journey-only: the pill,
the modal, the no-semver rule, first-visit silence.
STEPS
1. Tier B: make one dev-mode edit → patch-bump + changelog entry land in
   the files; `python3 tools/build.py` passes.
2. Tier E, signed in: visit the map (the account records the seen
   version); after a later landed change, reopen it → "✦ changed since
   your last visit" pill.
3. Click → the modal lists the change in plain language with dates; NO
   version numbers anywhere in it.
4. "Got it" → pill gone on the next visit — including from another
   browser, since the seen record is server-side.
EXPECT — a first-time visitor (fresh account) and a signed-out visitor get
NO pill; if the version moved but no changelog exists, the modal shows the
honest "details weren't recorded" line.

# Group VII — Pipeline & agent corps · *automation files, humans merge*

### J24 · Maintainer + Action · Landing: merged → land → retire   [Tier E]
INTENTION — Repo custody is automated but gated by the same validator as
CI; the contributor's name travels into the public commit record
(GOVERNANCE attribution; README editorial layer).
COVERED ELSEWHERE — ops.test.mjs missing-attribution regression;
rules.test.mjs merged-doc shape + required by/mergedBy (D).
STEPS
1. After a J17 merge: the `merged/{id}` doc exists (public read) and the
   overlay already serves everyone.
2. Actions tab → run **Land content** → the run validates with build.py,
   commits with "Proposed by X … merged in-app by Y", pushes, deploys,
   then retires the doc.
3. Confirm: commit message attribution; doc gone; content now file-borne.
4. Error path: a doc that fails validation gets an `error` stamp and is
   skipped — the run continues for the rest of the queue.

### J25 · Agent corps · The Link Steward files; only humans merge   [Tier E · DORMANT until links carry `succession`]
INTENTION — Agents are staff, never editors: automation drafts, a named
human clicks merge (GOVERNANCE AI line).
COVERED ELSEWHERE — rules.test.mjs agent-namespace lockout (D);
test_build.py succession checks.
STEPS (once ≥1 link carries a succession list)
1. Nightly Link check (or run-on-demand) finds the URL dead.
2. tools/succession.mjs files a `weight:trivial` swap proposal as
   `agent:link-steward` — the queue card carries the 🤖 badge and the
   pre-drafted swap (url → successor, succession shifted, verified stamped).
3. A steward or maintainer merges it; there is no agent merge path anywhere.

### J26 · Guild member / guide · Guild hall and endorsements   [Tier E · DORMANT until a guild doc exists]
INTENTION — Community without authority: guides tend talk and sign
endorsements — the system's only comparative judgment — while pedagogy
stays with maintainers (GOVERNANCE guilds).
COVERED ELSEWHERE — rules.test.mjs guild/endorsement/guide suites (D).
STEPS (once a `guilds/{gid}` doc is seeded)
1. A map in the guild shows the 🏛 door → `#/guild/<id>`: blurb, guides,
   member maps, endorsements, talk.
2. Signed-in users post to talk; a guide deletes a post in their own guild
   only.
3. A guide endorses a member map (audience + criteria + signature + date);
   the endorsement shows on the guild page, the map header 🏅, and the
   Atlas chip; it is withdrawable.
4. A guide can flag a guild map as seeking-maintainer; guides have no merge
   path anywhere.
5. backBtn from the hall returns to the map whose door was used.

### J27 · Contributors + admins · Stewardship review: the crown moves by two keys   [Tier E · PLANNED — ships with the stewardship-review build]
INTENTION — When an active maintainer's map is outgrown by its community,
succession is formal, earned, and dual-keyed: contributors nominate by
signed positive endorsement, admins confirm against the charter, and the
review moves bindings, never content (GOVERNANCE "The stewardship review").
COVERED ELSEWHERE — to be written with the build (rules tests for the
review doc, franchise gate, one-per-year cooldown).
STEPS (spec-level until built)
1. An admin opens a review on a map, citing the trigger evidence (rejection
   record / branch tending) and the challenger.
2. The map's category picker shows the review notice: candidates, records,
   comment thread, ballot.
3. A contributor with a merged contribution (≥30 days) endorses a candidate
   — signed, dated, reasoned; a walker with no merged work sees the notice
   but no ballot.
4. The nomination resolves; admins confirm (or overrule with written public
   reasons); the roles doc changes by one line.
5. The map's content is untouched by the election; the departing
   maintainer's attribution and the map history survive intact; a failed
   challenge starts the doubled cooldown.

---

## Maintenance rules

1. **Same-commit rule**: a journey is updated in the same commit as the
   intentional change to its flow — a change to a surface without its story
   is incomplete, exactly like behavior without tests.
2. **Stable ids forever**: never renumber. A retired journey keeps its id
   with a one-line tombstone ("J<N> retired <date>: <reason>").
3. **New surface, new journey**: shipped together, next free id; the
   INTENTION line must cite the governance clause that justifies the
   surface — if no clause fits, that is a design smell to raise before
   merging.
4. **DORMANT comes off the day the data exists** (first guild doc, first
   succession list, first landed op) — and the journey is walked that day.
5. **Contract copy**: toast strings quoted here are load-bearing; change
   the string, change the journey, same commit.
