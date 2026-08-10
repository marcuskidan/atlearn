# CATALOG.md — every surface, every feature, one source of truth

This is the complete inventory of what exists in Atlearn's interface: every
page a user can land on, every element on it, what each does, and who sees
it. It is the **source of truth for surfaces** — development flows through
it in both directions:

- **Spec-down**: new work is outlined HERE first — add the feature line
  where it will live, marked `PLANNED`, then build it; the marker comes off
  in the commit that ships it.
- **Code-up**: when dev work changes a surface, the catalog line changes in
  the same commit. A surface change without its catalog change is
  incomplete, exactly like a flow change without its JOURNEYS.md story.

The documents divide the labor: **GOVERNANCE.md** holds *why* a surface
may exist · **PRODUCTS.md** holds the *product view* (plain-language
promises and feature status, for product management) · **CATALOG.md**
(this file) holds *what* exists and *who sees it* · **JOURNEYS.md** holds
*proof the flows work*. Each catalog section links its journeys.

Conventions:
- `#elementId` names are the literal DOM ids in index.html — greppable
  anchors from doc to code.
- Gates are the literal client functions: **everyone** · **signed-in**
  (`user.provider`) · **connected** (`canSync()` — real Firebase, real
  account) · **canEdit** (signed-in, or devMode; fork → owner only) ·
  **owner** (`ownsSurface()` — devMode ∥ admin ∥ that map's maintainer ∥
  fork owner) · **maintainer(rm)** / **steward(rm)** / **admin** /
  **superadmin** (role docs) · **devMode** (tools/dev.py detected).
  Client gates are UX only — firestore.rules is the real boundary.
- Signed-out visitors are read-only everywhere: interactive affordances
  below implicitly require at least signed-in unless marked everyone.

Routes at a glance (the full dispatcher lives in index.html, "URL routing"):
`#/` home · `#/about` · `#/privacy` · `#/account` · `#/collections` ·
`#/atlas` · `#/journal[/rm]` · `#/guild/<id>` · `#/health` ·
`#/<cat>` picker · `#/<cat>/map` official map · `#/<cat>/<node>` drawer ·
`#/fork/<id>[/<node>]` personal version. The review queue is deliberately
NOT routed (role surface, shield buttons only).

---

## 0 · Global chrome (every view)

Journeys: J2.

- `#backBtn` ← — goes UP one level (`goUp()`): map → its category picker ·
  fork → its base's picker · guild → the map whose door was used · all
  other views → home. (everyone)
- `#brand` 🗺️ + `#brandText` — clickable, goes home; text is overwritten
  per view with the current context. (everyone)
- `#themeBtn` ☾/☀ — flips light/dark. The choice sticks to the device
  (`atlearn-theme` in localStorage, applied before first paint) and, when
  signed in, to the account (`store.settings.theme`, LWW), so it follows
  the walker onto their next device. Light is the default. (everyone)
- `#aboutBtn` ⓘ — opens `#/about`. (everyone)
- `#reviewBtn` 🛡️ Review — opens the review queue. (moderator of any map
  OR steward of any map)
- `#signInBtn` — opens the auth modal. (signed-out)
- `#userChip` avatar/name — opens `#/account`; carries `#syncDot` (5 sync
  states, title-labeled) and a gold `.hasNews` dot when contributions were
  decided since last look. Tooltip says only "Your account" — uid and role
  plumbing live on the account page. (signed-in)
- `#signOutBtn` — sign out, stay on page. (signed-in)
- `#toast` — single-slot transient message, 2.6 s. `#loading` — spinner
  overlay during map/fork loads.

## 1 · Home — `#/`

Purpose: the front page of your own life — active paths first, the library
below; no feed, no engagement ranking. Reached: app root, brand, backBtn.
Journeys: J1, J3.

- `#heroTitle` — "Pick a path…" / "Welcome back." once any map has
  progress. (everyone)
- Hero links — "Why this exists →" (`#/about`), "Explore the atlas →", and
  "Browse collections →" (`#heroCollLink`, hidden until a shelf exists to
  browse — one `limit(1)` probe per session; a dormant surface stays off
  the front page). The hero is the sole entry to collections and the atlas.
  (everyone)
- `#searchBox` + `#searchResults` — global search: title index first
  (`search.json`), deep index (`search-deep.json`, summaries + do-actions)
  when title hits run thin; map results labeled "all versions" (they open
  the picker); node results deep-link into drawers; Enter opens the first
  result. (everyone)
- `#continueRow` — "Continue your paths": one card per in-progress map with
  the next node and its do-action; click jumps straight into that node's
  drawer. Renders only with progress. (everyone with progress)
- `#grid` — the library shelf: deliberately spare cards (emoji + title +
  progress bar only — CLAUDE.md rule 7 forbids more); click → category
  picker. (everyone)
- `#wantedRow` — "Maps the library is looking for" chips from
  `roadmaps/wanted.json`; click prefills the new-roadmap proposal.
  (everyone; submitting needs signed-in + connected)
- `#proposeBtn` 🌱 Propose a new roadmap… — opens the suggest modal in
  roadmap mode. (everyone; gated at submit)
- `#loadErr` — friendly serve-over-HTTP instructions when content fetch
  fails (file:// case). (everyone, on error)

## 2 · Category picker — `#/<cat>`

Purpose: the version picker — plain-text identity, the official branch
pinned first, every public community branch below; Wikipedia-style, no
machine facts. **At zero visible branches the picker collapses**: library
cards, atlas rows, search results, and collection chips continue straight
to the official map (one version = nothing to pick); the map's
"⑂ all versions" and the backBtn force the picker open regardless — the
deliberate doors to branch discovery and "start your own". Journeys: J5,
J15.

- `#catHead` — title · byline (rendered only when a real maintainer is
  named — placeholders are not facts, so pre-adoption maps show no byline)
  · tagline · disclaimer (gated maps). The endpoint lives on the Atlas,
  where comparison is the point. (everyone)
- `#catSearch` — filters branches by title or tender. (everyone; renders at
  2+ branches)
- `#catSorts` — transparent sort chips: recently tended / most changed /
  newest — never engagement. (everyone; renders at 2+ branches)
- Official row — pinned first; opens `#/<cat>/map`; carries orphan/archived
  suffixes when applicable. (everyone)
- Branch rows — every public personal version: title, the owner's
  one-line **subtitle** ("the beginner version" — how this branch is
  different, in the owner's words), "tended by", date, "(hidden)" label
  for owner/admin viewers; click opens the fork. Op counts are sort data,
  never display copy. (everyone on a configured app — `forksOfMap` is a
  public read, no sign-in required; hidden forks visible to owner +
  admins only)
- Branch count line — "N community branches". (everyone, at 1+)
- "＋ Start your own branch" row — creates the visitor's personal version
  (one per map per user; re-click opens the existing one) — the ONLY
  branch-creation affordance in the app. Reads "Open your branch" when you
  have one. (signed-in + connected; degrades to an honest toast)
- `PLANNED` Stewardship-review notice — when a review is open for this map
  (GOVERNANCE "The stewardship review"): a banner naming the candidates,
  linking their public records and the open comment thread, with a signed
  positive-endorsement ballot for the earned franchise (≥1 merged
  contribution anywhere, ≥30 days old). Reviews move bindings, never
  content. Decision 2026-08-09. (ballot: franchised contributors; visible:
  everyone)

## 3 · Official map — `#/<cat>/map`

Purpose: the reading surface — consumption-first; structural editing chrome
is owner-only, contribution flows are quiet. Reached: picker official row,
continue cards, deep links, search results. Journeys: J1, J12, J14, J17,
J21, J23.

Header (`#mapHeader`, kept minimal by rule):
- Title + badges — `⚕ scope-limited` (gated), state badge (draft/archived).
  (everyone)
- Byline — the maintainer's name; absent until a real name exists (the
  "The Admins" placeholder never renders). (everyone)
- `⑂ all versions` — back to the picker (forced open). (everyone)
- `#histBtn` 🕘 history — opens the map's GitHub commit log; meta altitude,
  so it lives in this header row, never on the map itself. Official
  map only; absent while `GITHUB_REPO` is unset. (everyone when configured)
- `#mhAboutLead` — the wiki-editable about prose (meta.json `about`,
  overlay-aware); renders on the official map only, never on forks.
  `[ edit ]` / "write the about section" affordance. (prose: everyone;
  edit link: owner)
- `✦ changed since your last visit` pill — opens the what's-new modal;
  appears when the map's version moved past the walker's seen record.
  (returning walkers)
- 🍂 orphan banner — "seeking a maintainer" + designated-successor line +
  `🙋 Apply to adopt this map` (opens suggest in adopt mode). (everyone
  when orphaned; apply needs signed-in + connected)
- `💬 Discussion` — the map's open floor: pending proposals + their public
  comment threads. (connected)
- `🏅 endorsed` chip — endorsement criteria in a styled in-place popover
  (`.endPop`) on click; never a native dialog on the reading surface.
  (everyone, when endorsements exist)
- `🏛 <guild>` door — opens the guild hall. (everyone, when a guild claims
  the map)
- 🍂 flag/clear seeking-maintainer — writes `mapstates`. (guild guides)
- `⚑ Report` — report map content; safety severity = 48-hour red queue.
  (connected)
- `.mhDisclaimer` ⚠️ — gated-map scope disclaimer. (everyone, gated maps)

The map itself (`#mapFlow` — a document, not a canvas):
- The map reflows to the screen and scrolls like a page — no zoom, no pan,
  no controls to learn. Wide screens: core topics down a center spine
  rule, children branching left/right joined by dotted curves drawn per
  row (`drawBranchEdges`). A child's side is the maintainer's call
  (`children[].side` via the ✏️ editor, `childSide()`), alternating by
  position when unstated. Narrow screens: an outline — each core topic
  followed by its children in true order, indented on a dotted rule.
  Breakpoint and resize re-render live (`MAP_STACK`, debounced resize).
- Nodes (spine + branches) — click opens the drawer; each carries a status
  glyph ○/⋯/✓, and branches state their tier in words (no separate key).
  (everyone)
- `#addTopicBtn` ＋ Add core topic · `#reorgBtn` ⇅ Reorganize — structural
  tools. (owner)

## 4 · Node drawer — `#/<cat>/<node>` (also `#/fork/<id>/<node>`)

Purpose: one node's learn/do/reflect content plus the walker's workspace;
read-only for signed-out visitors. Journeys: J1, J7, J11, J12, J13.

- The head is quiet: the walker just tapped the titled card, so the sheet
  doesn't restate it — one row of `#statusSeg` plus the corner buttons.
  `#closeBtn` ✕ (also backdrop click, Esc). (everyone)
- 📖 Learn — `#dSummary` prose + `#dLinks` resource rows: kind chip
  (article/video/tool), minutes, language tag, stale-verification dot.
  (everyone)
- Per-link `⚑` flag → 💀 dead / 🍂 stale / 🤷 didn't help; idempotent per
  user per link; aggregates in the maintainer's queue. (connected)
- 🛠️ Do — `#dSteps` checkable real-world actions; first check auto-advances
  status. (everyone — guests' marks live in session memory only, with one
  quiet nudge per visit ("sign in to keep your progress"); signing in
  adopts them into the account via the LWW merge. Demo/dev identities
  still get the honest `NEEDS_APP` toast — never a fake save.)
- 🪞 Reflect — `#dReflect` checkable prompts (practice maps). (everyone;
  same session-memory rule as Do)
- `#statusSeg` ○ ⋯ ✓ — node status. (everyone; same session-memory rule)
- 📝 Personal Workspace `#dWorkSec` — `#notes` autosaving textarea (saves
  to the walker's own server record, debounced), `#saveHint`, `#syncNote`
  (server save state only — the data-export link lives at account
  altitude, not in every drawer). (signed-in)
- `#dSignInSec` 🔑 — "Sign in to track your progress and keep notes" — the
  one signed-out affordance; opens the auth modal. (signed-out)
- 💬 Community `#dTipsSec` — the section renders only when it has content:
  tips to read, or the tip door to offer (no empty headings). `#dTips`
  labeled community tips (attribution + per-tip ⚑ report; ✕ remove for
  that map's moderators) + `#suggestBtn` 💡 Share a field-tested tip — the
  node's ONE community-text door; changes to the lesson itself go through
  ✏️ (one door per intent). (tips: everyone; 💡: signed-in, hidden on
  forks)
- `#editBtn` ✏️ — opens the node editor; ANY signed-in walker may edit —
  what Save does is role-decided (owners merge, others propose). This is
  the wiki door. (canEdit)

## 5 · Personal version — `#/fork/<id>`

Purpose: a community branch — ops-over-base, walkable by all, editable by
its owner alone. Reached: picker branch rows, account page, shared links.
Journeys: J15, J16.

- `#forkBanner` — "✨ <title> — a personal version by <owner> of <base>"
  with base link · the branch **subtitle** (`#forkSub`, one line ≤90 chars,
  italic; `✎` inline edit for the owner — the same line renders on the
  picker's branch row) · `🔗 Share` (copies the URL) · `🗑` delete (owner) ·
  `⚑` report (non-owners) · `🙈 Hide / 👁 Unhide` from public listings
  (admin — the rules' one fork-moderation switch). (everyone sees the
  banner)
- Full map + drawer render through the overlay engine; walking progress is
  shared with the base map (stable node ids). (everyone)
- ✏️ / ＋ Add topic / ⇅ Reorganize — fork editing, saves go only to the
  fork's ops; per-topic "↩ Reset to the standard version" drops divergence.
  (fork owner)
- `PLANNED` "Offer this to the trunk" — converts a branch's ops[] into a
  batch of proposals against the base map (same op grammar both sides), so
  GOVERNANCE's "forks are reviewable proposals in waiting" becomes one
  click instead of hand re-entry. Decision 2026-08-09. (fork owner)
- Suppressed on forks by design: about lead, [ edit ], 💡 suggest, per-link
  ⚑ flags, 💬 Discussion, 🏅/🏛/orphan extras, 🕘 history, ⚑ report-map
  (report-the-fork lives in the banner instead).

## 6 · Atlas — `#/atlas`

Purpose: browse every map by transparent, fixed criteria — richer metadata
is legitimate here because you came to it. Reached: home hero link.
Journeys: J4.

- `#atlasSearch` — filters by title/endpoint/tagline/maintainer. (everyone)
- Sort chips — curated order / recently verified. (everyone)
- `#atlasFilters` — data-driven criteria chips with counts (🌀 practice ·
  ⚕ scope-limited · 🗄 archived · 🍂 seeking maintainer · 🏅 endorsed ·
  ⑂ community versions · ✓ fresh · ⏱ tended on a cadence); a criterion
  with zero maps shows no chip; click toggles the filter. (everyone —
  `forkCounts` is a public read on a configured app, so the ⑂ criterion is
  data-driven for signed-out viewers too)
- Rows — emoji, title, endpoint/tagline, maintainer, criteria chips;
  click → category picker. Draft maps excluded. (everyone)
- Empty state — "No maps match — clear the search or filter." Footer
  caption states the no-engagement stance. (everyone)

## 7 · Collections — `#/collections`

Purpose: owner-curated shelves of existing maps — pointers, never content;
the fork valve's first rung. Reached: home hero link. Journeys: —
(covered by rules tests; shelf browsing is read-only).

- `#collSearch` — filters by title/blurb/curator/shelved map titles.
  (everyone)
- Shelf cards — ★ Featured / Hidden badges, title, "a shelf by X", blurb,
  map chips (click → that map's picker). (everyone; hidden shelves visible
  to owner + admins)
- `✎ Edit` (owner) · `★ Feature/Unfeature` + `Hide/Unhide` (admin — the
  exactly-two moderation switches) · `⚑` report (rendered for all
  non-owners; tap gates on sign-in, submit on connected).
- `#collNew` ＋ Create a collection… — opens the collection modal.
  (signed-in + connected; honest toast otherwise)

## 8 · Journal — `#/journal[/<rm>]`

Purpose: the walker's private record — deliberately tucked away; sole entry
point is the account page's 📓 button. (The URL is reachable signed-out —
the composer renders but every write degrades to the honest connected-app
toast; a signed-out variant is a known gap, not a promise.) Journeys: J8.

- `#jIntro` — the privacy statement (never public). (signed-in)
- Composer — `#jText` + `#jMap` map select (also filters the list and
  updates the hash) + `#jSave`. (signed-in)
- `#jStreaks` opt-in streak chip · `#jCopyAll` 📋 Copy as text (markdown
  export). (signed-in)
- Entries — grouped by day, map-labeled, ✕ delete with confirm (tombstoned
  so deletion syncs). (signed-in)

## 9 · Account — `#/account`

Purpose: identity, data rights, contributions, and — for role-holders —
the governance controls. Reached: user chip. Journeys: J9, J20.

- Signed-out variant — one line + sign-in button. (signed-out, URL only)
- Profile — avatar, name, email, role chips (👑/🛡️/🧑‍🌾/🪴/🧭/Contributor),
  uid + Copy (roles bind to it). (signed-in)
- `🛡️ Review queue` (moderator or steward) · `📓 Journal` · `📦 Download
  my data` (full JSON export) · `Sign out` · privacy link. (signed-in)
- "Your contributions" — status per suggestion/proposal (⏳/🌟/📥/✅/✕ with
  the written rejection reason) + Withdraw while pending. (author,
  connected)
- "Your personal versions" — Open / 🔗 Copy link / 🗑 Delete per fork.
  (owner, connected)
- `🗑 Delete my account and data…` — double-confirmed; removes identity,
  progress, notes, journal (cascade), forks, shelves, pending
  contributions; merged contributions remain in the public record (CC
  BY-SA). (signed-in)

Governance panels (inside the account page):
- Maintainers editor — bind uid+name per map. (admin)
- `PLANNED` Institutional co-maintainership — a map's maintainer binding
  becomes one-or-many ({uid,name} → members map, like stewards), so a team
  (e.g. an institution's staff) can hold a map jointly with one named lead;
  requires schema change in meta/roles + rules + every maintains() call
  site. Decision 2026-08-09. (admin binds)
- `PLANNED` Stewardship-review controls — open a review (with the
  documented trigger evidence), confirm or overrule its nomination (written
  public reasons required to overrule), close with the binding change; at
  most one review per map per year, failed challenge doubles the wait.
  Decision 2026-08-09. (admin; superadmin backstop)
- Admins editor — uid list. (superadmin; `superadmins` itself is
  console-only — no UI writes it, by design)
- Stewards editor — up to 10 per map, own maps. (maintainer; admin: all)
- Successor editor — designated successor per own map (public record;
  admins confirm the handover) + map lifecycle orphan toggles (admin).
- Guilds editor — id/title/blurb/maps/guides rows. (admin)

## 10 · Review queue — no route (shield buttons only)

Purpose: the moderation desk — proposals, suggestions, reports, flags;
scoped per role, tabs hidden rather than shown empty. Journeys: J17, J18,
J19.

- `#reviewSub` — per-tab explainer. (all queue viewers)
- **Proposed edits** — cards with kind, weight chip, age chip (amber ≥7d /
  red ≥14d), 🤖 agent badge, declared-trivial-looks-substantive warning,
  stale-base warning, field-level diff, public 💬 thread. `✅ Merge &
  publish` (blocked by the 7-day countdown on structural kinds) ·
  `✕ Reject` (written reason required). (maintainers: their maps; admin:
  all; stewards: trivial edits only)
- **Suggestions** — 🌟 Publish as tip · 📥 Accept for curation · ✕ Reject
  (reason). Adopt-type cards become "🙋 adoption application" with
  bind-a-maintainer instructions and ✓ Mark handled / ✕ Decline.
  (maintainer/admin; hidden for stewards)
- **Accepted for curation** — 📋 Copy all as JSON + per-item "✏️ Edit this
  node now". (maintainer/admin; hidden for stewards)
- **⚑ Reports** — safety-first ordering, 48h badge, Open it / ✓ Resolve… /
  Dismiss / 🗑 (admin). (admin + map maintainers for kind:map; hidden for
  stewards)
- **🔗 Flags** — aggregated per resource with reason breakdown; Open node ·
  ✓ Clear flags (fixed). (admin/maintainer; hidden for stewards)

## 11 · Guild hall — `#/guild/<id>`

Purpose: community without authority — talk and endorsements around a
subject area; guides are janitors, never editors. Reached: 🏛 door on
member maps. Journeys: J26 (dormant until a guild is seeded).

- Head — title, blurb, 🧭 guides list. Member-map rows → pickers.
  (everyone)
- Endorsements — signed, dated, criteria-backed cards; `🏅 Endorse` form
  (map select + audience + criteria) and ✕ withdraw. (create/withdraw:
  guides of this guild + admins)
- `PLANNED` Fork endorsements — the endorse form's target accepts public
  branches of guild maps, not just trunks, so the system's one comparative
  judgment can say "this branch is the stronger curriculum"; displays on
  the branch's picker row + fork banner. Feeds the stewardship-review
  evidence base. Decision 2026-08-09. (guides + admins)
- Talk — public thread, readable by everyone on a configured app (a public
  read needs no sign-in); post (signed-in + connected, `canSync`); ✕ remove
  (guides of this guild + admins).

## 12 · Vital signs — `#/health`

Purpose: the numbers the project holds itself to — repo-derived only,
walker behavior counted nowhere. Reached: About page footer. Journeys: —
(read-only stats; local data may be stale — expected).

- Boundary statement, stat tiles (maps/steps/resources/% verified/named
  maintainers/archived/landed contributions), per-map freshness bars with
  domain-concentration note (Wikipedia excluded from the alarm),
  contributor roll, anti-metric statement. Honest fallback line when the
  deploy-time data is absent. (everyone)

## 13 · About — `#/about`

Purpose: the manifesto — ALL explanatory/mission copy lives here and only
here (golden rule 6). Reached: ⓘ button, home hero link.

- The manifesto prose; footer sig links: 🩺 Vital signs · Privacy.
  (everyone)

## 14 · Privacy — `#/privacy`

Purpose: the complete inventory of what exists about a person and how to
erase it. Reached: About footer, auth modal, account page. Journeys: J9.

- Prose sections: if you never sign in (reading is anonymous; nothing is
  stored about you — data exists once signed in, in your own server
  record) · if you sign in · what becomes public (contributions are public speech, CC BY-SA) · what we
  don't do (no ads/analytics/selling) · your controls (export, delete).
  (everyone)

## 15 · Modals & the node editor

- **Auth** `#authModal` — Google/Apple SSO buttons, demo-mode note when
  unconfigured, privacy link, Not now. Openers: sign-in button, drawer 🔑,
  and every gated affordance when signed out.
- **Suggest** `#suggestModal` — three modes, no type chips: node mode is
  TIP-ONLY ("Share a field-tested tip" — fixes, better resources, and
  missing subtopics belong to the ✏️ editor, one door per intent; the
  context line is just the node's name, no process explanation), plus
  roadmap and adopt modes. `#sgText`, `#sgUrl`
  (affiliate params auto-stripped on blur), `#sgVerified` personally-
  verified check, `#sgFree` one-hard-rule check, `#sgAffiliated` +
  description (disclosure is the deal), CC BY-SA notice. (signed-in;
  submit needs connected)
- **Node editor** `#editorBody` (in-drawer) — Title, Tier, position select
  (new topics), Summary, links editor (label/kind/url + ⋯ metadata:
  minutes, lang, ✓ verify-today stamp, succession list), do-actions,
  reflect prompts, child tools (two side lists ◀/▶ — ↑↓ within a side,
  ⇄ across, ✎ edit, move-to-topic, add beneath, delete subtopic;
  fork: reset-to-standard), proposal note + substantive + affiliation
  fields (propose mode), validation errors, mode-aware Save: dev-write /
  merge / propose / fork / export — `#edMode` explains which. (canEdit;
  destination decided by editorMode())
- **Reorganize** `#reorgModal` — spine rows ↑↓, mode explainer, save = one
  spine op. (owner)
- **About editor** `#aboutModal` — textarea (4000), note-to-maintainer
  (propose mode), mode explainer, mode-aware save. (owner via [ edit ];
  propose branch reachable if re-surfaced later)
- **Discussion** `#discussModal` — the map's pending proposals + public
  comment threads; post (signed-in), remove (moderators). (connected)
- **What's-new** `#whatsNewModal` — plain-language changelog entries since
  your last visit (clickable → that topic), "Got it" marks seen; honest
  fallback when details weren't recorded; never shows version numbers.
- **Collection** `#collModal` — title, blurb, map checkbox picker with
  search (checked survive filtering), delete (edit mode). (owner;
  connected)

## 16 · System states

- **Signed-out** — reading everywhere, plus session-memory progress marks
  (steps/reflect/status only — nothing persists, one quiet keep-it nudge,
  adopted into the account on sign-in) + one 🔑 invite (J1). Contribution
  and creation affordances stay sign-in gated.
- **Demo / unconfigured** (`FIREBASE_CONFIG: null`) — read + demo sign-in
  (google:demo-user renders superadmin surfaces); NOTHING persists: every
  write — progress and notes included — degrades to one honest toast
  ("… need the connected app"); the editor falls to export mode. No shadow
  implementations. (J10)
- **Dev mode** (tools/dev.py) — full authoring for the author's machine:
  ✏️ everywhere without sign-in, saves write real files through the shared
  op engine, version+changelog ride along, invalid ops roll back
  byte-identical. (J22)
- **Connected** — the full commons: contribution, review, forks,
  collections, reports, flags, and all walker persistence — progress,
  notes, journal, seen-records save to the account's server store.
  (Group II–V journeys)

---

*Maintenance: this file obeys the same-commit rule (see the CLAUDE.md
Engineering-hygiene bullets). `PLANNED` lines are welcome — they are the
spec-down half of the contract; stale lines are bugs.*
