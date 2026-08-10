# Atlearn Governance — a commons with gardeners

This document is the constitution of Atlearn: who decides what, and why it is
built that way. The mission itself lives in the app's About page; this is the
machinery that protects it. ("A commons with gardeners" is the founding
metaphor — in these pages the people who tend maps are called **maintainers**
and the editorial board **admins**.)

## The core principle

Every large knowledge commons before this one picked a single governance
mechanism and applied it to everything — and each mechanism fails at a
specific kind of decision:

- **Consensus (Wikipedia) can't exclude.** Curriculum quality lives in what
  you leave out. Consensus is structurally biased toward inclusion; it sands
  opinionated paths down to mush.
- **Voting (Reddit) can't cohere.** Votes are per-item; a curriculum is
  holistic. A map of individually upvoted nodes can still be a bad map, and
  timing decides what gets seen.
- **A single maintainer (early roadmap.sh) can't scale breadth.** One person
  cannot competently rule on astronomy, finance, and first aid at once. The
  bottleneck isn't hours — it's expertise.

So this project assigns **each type of decision to the mechanism that is good
at it**. That's the whole model; everything below is detail.

## Roles

| Role | Who | Authority |
|---|---|---|
| **Walker** | Anyone | Walk any map. Progress, journal, and notes are theirs, always exportable. One-tap resource flags ("dead / stale / didn't help") feed the maintainer's queue. |
| **Contributor** | Any signed-in user | Suggest improvements, propose structured edits, propose new maps, curate **collections**, comment on any open proposal. Every contribution is attributed, discloses affiliation, and is CC BY-SA 4.0. |
| **Steward** | Trusted contributors, deputized by a maintainer for that maintainer's map | Merge **trivial** proposals only (link swaps, typos, metadata) — never structure. How maps survive vacations and how successors are grown. Up to 10 per map, listed publicly. |
| **Maintainer** | A named person per map | **Final say inside their map.** Reviews and merges proposals, keeps links alive, appoints stewards, names a designated successor, holds the map to the charter. |
| **Guide** | Subject-area coordinators, per guild | Janitorial and social authority, explicitly **not** editorial: moderate guild talk, flag orphaned maps, manage endorsements. Admin-appointed until guilds have electorates. Guides never merge content. |
| **Admin** | A small editorial board | Decides **which maps exist**: intake, promotion, retirement. Appoints and replaces maintainers and guides. Moderates any map and collection. |
| **Superadmin** | The project admin-in-chief | Appoints and removes admins and maintainers. Holds the infrastructure (repo, Firebase). Root role — granted only by hand in the Firebase console, never through the app or its API. |

**The AI agent corps — staff, never editors.** Automation (the nightly link
check, the Link Steward that pre-drafts succession swaps) holds no role above
Walker. Agents file under the reserved `agent:*` identity namespace — which no
client account can wear, by rule — and land in the same review queue as
everyone else, marked 🤖. The constitutional line, enforced in
`firestore.rules` and checked in tests: **no resource enters a published map
without a named human having clicked merge.**

Role bindings are public: maintainers/admins in the world-readable
`meta/roles` document, stewards in per-map `stewards/{map}` documents, guides
in their `guilds/{guild}` documents, designated successors in
`mapstates/{map}`. Anyone can see who tends what.

## Who decides what

| Decision | Mechanism |
|---|---|
| Content and structure *within* a map | The map's maintainer — one accountable voice. Coherence requires singular judgment. |
| Trivial fixes (link swaps, typos) | The maintainer **or their stewards**, on sight. |
| Structural changes (reorder, add/remove topics) | The maintainer alone — after a **7-day open comment period** on the proposal, enforced by the rules. They still decide alone; the waiting period exists so they decide informed. Rejecting never waits: a fast no beats a slow one. |
| Which maps exist; promotion to the canonical library | Admins, deliberately conservative. The intake question is always: *why isn't this a topic in an existing map?* |
| Maintainer appointment and succession | Admins (and superadmin), based on demonstrated contribution. The recorded designated successor has right of first refusal. |
| Endorsement (a guild's per-audience quality mark) | Guides, on published criteria, signed and dated, revocable. The **only** place comparative judgment between maps enters the system. |
| Safety red flags (dangerous instructions, medical misinformation) | The red-flag queue: maintainer + admins, 48-hour response norm. The one case where content may be suppressed pending review without the maintainer's advance consent. |
| Admin appointment | Superadmin. |
| What's popular | **Nobody.** Usage signals (saves, paths started) are telemetry shown *to* maintainers and admins as evidence — never a mechanism that directly decides anything. |
| Disagreement with a maintainer's call | The fork valve (below), not a vote. |

### Proposal weight classes

Every proposed change declares its weight, and the review rules enforce it:
**trivial** (link swap from a succession list, typo, metadata — steward-mergeable),
**substantive** (new or changed resource, edited step text — maintainer only),
**structural** (reorder, add/remove topics, moved subtopics — maintainer only,
after the 7-day comment period). The review card recomputes the class from the
diff and flags a mismatch; the reviewing human is the honesty backstop.
"Doesn't fit my approach" is a fully valid rejection — but it must be written
down, because rejection reasons are the map's public pedagogical record.

### Resource integrity

The commons will attract link-spam, affiliate laundering, and self-promotion
dressed as contribution. Standing defenses: resources may not carry affiliate
or tracking parameters (the build rejects them; the editor strips them);
every contribution declares whether its author has an **affiliation** with
the resource — undisclosed affiliation discovered later is a conduct
violation; and every map's **resource-domain concentration** is computed at
build time into the public index and published on the vital-signs page — a
map quietly funneling to one channel is visible to anyone who checks, without
cluttering the walking surfaces (walkers came to learn, not to audit).

## The editorial charter

Maintainer authority is legitimate because it is bounded by public, checkable
rules. A maintainer enforces the charter; they don't override it:

1. **Free means free.** Every resource must be freely and legally accessible
   to everyone — no paywalls, sign-up walls, or region locks. (The one hard
   rule; the build enforces known violations.)
2. **A map orients; resources teach.** Every node must help someone navigate
   the territory, not try to be the territory. Awareness-level depth;
   the linked resources go deeper.
3. **Every node earns its place on a path.** If removing it wouldn't break
   the progression, it doesn't belong. Paths, not piles.
4. **Every node has a real-world action** doable this week — never
   "practice more."
5. **Ordered, one level deep.** Core topics form the spine; subtopics branch
   once. Sequence is the product.
6. **Sensitive domains stay educational.** Finance: concepts only, no advice.
   First aid: awareness only, point to certified courses. Mental health:
   self-care framing with professional pathways intact.
7. **Attribution always.** Every merged change carries its contributor's name
   into the public record.

Rejected contributors should be able to see *which rule* they hit. A
rejection that can't name its rule escalates to the admins.

**Seven rules is the ceiling.** A proposed eighth must retire one of the
seven. Wikipedia's editor decline teaches that policy thickets, not vandals,
are what drive contributors away.

## How the library grows

**No maintainer, no map.** A map enters the canonical library only when a
credible person commits to tending it. Expansion is rate-limited by
stewardship capacity, not by ambition or a central bottleneck — breadth
scales with how many trustworthy maintainers the community produces, while
every map keeps one accountable voice.

### The life of a map

A map's lifecycle is public. **Proposed** is not a folder — it's an outline
suggestion from the home screen plus the admins' **wanted list**
(`roadmaps/wanted.json`), the standing invitation that steers coverage toward
the library's gaps. From there, states live in two places by how they change:

- `meta.json` carries the commit-borne states — **draft** (visible and
  forkable, excluded from search and the shelf), **published** (the default),
  and **archived** (nothing is ever deleted from the commons except legal
  takedowns; archived maps stay readable and forkable forever, and stay on
  the shelf of anyone with progress on them).
- The public `mapstates/{map}` document carries the states that must change
  *without* a commit: **orphaned** ("seeking maintainer" — the map stays
  live, banner-marked, with an in-app adopt button) and the maintainer's
  **designated successor**.

**Orphaning and adoption:** a maintainer who goes dark past the escalation
norm (or departs without a successor) gets their map flagged by an admin or
the guild's guide. Candidates apply in-app with their contribution record;
the designated successor has right of first refusal; the admins confirm the
strongest candidate and rebind. Removal-for-cause takes the *index slot*,
never the work — the removed maintainer's version remains forkable.

**Versioning:** maps carry semantic versions, bumped automatically as merges
land (patch for edits, minor for structure; major is a deliberate hand
declaration). Every map keeps an append-only `changelog.json`, and a walker
mid-path sees "changed since your last visit" with the diff — never a silent
yank forward. A walker who wants to freeze a topic entirely can make a
personal version; forks are the "stay" mechanism.

New maps start as proposals (an outline from the home screen), and an admin
may land one as **draft** with its proposer as founding maintainer.
Promotion to the main library happens when it meets the charter, not when
it's popular.

## Disagreement: the fork valve

Scoped authority is tolerable in open source because you can always fork.
Here, in ascending order of effort:

1. **Collections** — anyone can group and sequence existing maps their own
   way and share it. "The maintainer organized this wrong" has a productive
   answer that isn't a governance fight.
2. **Proposals** — every rejection is recorded; a pattern of good rejected
   ideas is evidence admins can act on.
3. **Personal versions** (the category page's "start your own branch" row) —
   anyone signed in can make an editable copy of any map: reorder it,
   rewrite it, add to it, and share the link. A personal version is stored
   as *changes over the living base*, so everything its owner hasn't touched
   keeps improving with the canonical map, and any topic can be reset to
   standard at any time. It is deliberately quiet in the interface:
   suggesting an improvement to the shared map is always the preferred act;
   a personal branch is the escape hatch.
   **And the listed branches are public**: every map's page lists its
   community versions under the official trunk — named, attributed, dated,
   ordered by recency of tending (never by engagement). Divergence happens
   in the open, the way a public fork network keeps an open-source project
   honest; a branch that walkers keep choosing is the succession signal
   below. A branch is **born unlisted** — shareable by link from day one,
   but reaching the public list is its owner's deliberate act (the publish
   switch on the branch panel). The commons cannot be filled by accident,
   and the listing stays a shelf of versions someone chose to offer.
4. **The full fork** — the content is CC BY-SA 4.0 and the code is MIT.
   Anyone can take the entire commons and grow it elsewhere. That this is
   possible is precisely what keeps the roles honest.

**Below the commons: personal maps.** Anyone signed in can also make a
map *from scratch* — free, uncapped, owned outright, shareable by link,
and absent from every library surface. Existence needs no one's approval;
the shelf does. The library remains the true commons — what is listed is
what landed in the repository, worked on by the world and admitted
through the existing proposal path, with admission criteria in the
spirit of wiki notability rules. A personal map that deserves the shelf
travels the same road as any proposed map: its owner offers it, the
admins review it against the charter, and a human imports it.

**When a personal version outgrows the trunk:** a personal version that
draws more walkers than the canonical map is not a crisis — it is the
succession signal working. Because personal versions are stored as changes,
they are reviewable proposals in waiting: the admins' expected response is
to invite the merge, and where the author has shown sustained judgment, to
offer them the maintainership. Write-ups of taste belong in maps; popularity
of a version is evidence, never a coup. When the incumbent is active but
the merge is refused without good reasons, the stewardship review below is
the formal resolution.

## The stewardship review

The one case the norms above don't close: a maintainer who is present and
responsive, but whose map the community of contributors has outgrown. For
that case — and only that case — there is a formal process. It is an
election in the narrow sense, and deliberately nothing like one in spirit:
**triggered, earned, positive, and dual-keyed.**

**Never scheduled, only triggered.** There are no standing elections;
holding a map is not a campaign. A review opens only when an admin finds a
documented threshold met: a sustained pattern of sound proposals rejected
(the public rejection record is the evidence), or a public branch that has
out-tended the trunk for months — and, in either case, a challenger with a
contribution record of their own. Absence never needs a review: orphaning
and first-refusal succession already cover it.

**The franchise is earned, not registered.** Voting is open to contributors
with at least one merged contribution anywhere in the commons, at least
thirty days old. A vote costs real work that survived review — which is why
brigades and sockpuppets cannot buy in. The franchise is commons-wide on
purpose: scoping it to the contested map would let the incumbent gate their
own electorate. Walkers do not vote; their preference already speaks
through the tending evidence, which remains telemetry, never a mechanism.

**Ballots are positive, signed, and reasoned.** A voter endorses a
candidate — signed, dated, with a reason — in the same vocabulary as every
other endorsement in the commons. There is no "oppose" ballot and no
pile-on thread; a candidacy's weaknesses are argued in the open comment
record, not tallied. The real ballot material is the candidates' public
records: contribution history, review latency, rejection reasons, branch
stewardship.

**Confirmation is dual-keyed.** The community's endorsement nominates; the
admins confirm against the charter — subject competence, conduct, and any
claimed credentials or affiliations verified through the standing
disclosure machinery. Neither key alone can crown: no mob can elect past
accreditation review, and admins who overrule a nomination must publish
written reasons, exactly as a rejected proposal carries them. The
superadmin remains the backstop against capture in either direction.

**Reviews move bindings, never content.** The outcome is a one-line change
in the public roles document. Content still flows only through proposals,
review, and the landing pipeline — a captured review could at worst install
a maintainer whose every subsequent merge is public and reversible.

**Siege protection.** A map faces at most one review per year; a failed
challenge doubles the wait. Losing is not exile: the challenger keeps their
branch, and their record keeps compounding.

**Worked example.** A beloved map is held by passionate hobbyists. A
university team forks it, and their branch — public, attributed, tended —
begins to draw the walkers. The right ending, in order of preference: the
hobbyists merge the team's proposals and the trunk absorbs the work (no
crown moves); or the hobbyists decline with reasons the record can defend
(the branch remains, walkable by all); or the rejection record and the
branch's tending history meet the threshold, a review opens, the
contributors endorse, the admins verify the team's standing and confirm —
and the map changes hands with its history intact, its former maintainers
thanked in the record, and not one node altered by the election itself.

## The paid tier, when it exists

Payments (a hosted no-code stack — e.g. Stripe's Firebase integration) may
eventually fund the project through conveniences. Three invariants outrank
any pricing decision:

- **Viewing is always free.** Every map, every collection, every shared
  personal version, for everyone, forever. A shared link must never rot
  behind a paywall.
- **Contributing to the commons is never paywalled.** Suggestions,
  proposals, and public personal versions stay free — a pressure valve with
  a tollbooth doesn't release pressure, and taxing the passionate is how a
  commons starves.
- **Lapsing freezes, never deletes.** If a subscription ends, the person's
  paid-tier creations become read-only — still public if they were public,
  still walkable, always exportable — and editable again on return. Payment
  gates creation and editing, never existence or access.

## Guilds: community without authority

A guild is the community around a subject area — a grouping of maps, a public
talk space, endorsements, and the pool future maintainers and stewards grow
from. Guilds **advise** maintainers; they cannot overrule them. Guides run the
talk space and the housekeeping; pedagogy stays with the named maintainer of
each map. Guide appointment is by the admins until a guild has enough active
maintainers and contributors to elect its own — the endorsement machinery
already records *how* each mark was made (`method`), so the switch to
elections changes who signs, not what the record looks like.

## Stewardship, not ownership

- **The commons lives or dies on review latency.** Contributors don't leave
  because they were rejected; they leave because nothing happened. Proposals
  deserve an answer in days; every queue shows each item's age, and one that
  has waited two weeks escalates to the admins.
- A maintainer holds a map in trust. Going dark for ~90 days with proposals
  waiting is a graceful handoff, not a scandal: the map is flagged as seeking
  a maintainer, the designated successor gets first refusal, and the record
  thanks the departing maintainer.
- Stewards are the graceful degradation: with stewards appointed, a
  maintainer's vacation doesn't stall trivial fixes, and the strongest
  steward is usually the successor already in training.
- Admins and the superadmin can replace any role binding at any time;
  because bindings live in one public document, succession is a one-line
  change, never a fight over accounts.
- Nobody, in any role, owns contributed content. The license guarantees it.

## Amending this document

Changes to governance are changes to the project's promises. They land like
any other change — a public commit, attributed — but only the superadmin
merges them, after the admins have seen them.
