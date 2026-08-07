# Waihona Governance — a commons with gardeners

This document is the constitution of Waihona: who decides what, and why it is
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
| **Walker** | Anyone | Walk any map. Progress and notes are theirs, always exportable. |
| **Contributor** | Any signed-in user | Suggest improvements, propose structured edits, propose new maps, curate **collections**. Every contribution is attributed and CC BY-SA 4.0. |
| **Maintainer** | A named person per map | **Final say inside their map.** Reviews and merges proposals, keeps links alive, holds the map to the charter. |
| **Admin** | A small editorial board | Decides **which maps exist**: intake, promotion, retirement. Appoints and replaces maintainers. Moderates any map and collection. |
| **Superadmin** | The project admin-in-chief | Appoints and removes admins and maintainers. Holds the infrastructure (repo, Firebase). Root role — granted only by hand in the Firebase console, never through the app or its API. |

Role bindings are public: they live in the world-readable `meta/roles`
document (`maintainers`, `admins`, `superadmins`). Anyone can see who tends
what.

## Who decides what

| Decision | Mechanism |
|---|---|
| Content and structure *within* a map | The map's maintainer — one accountable voice. Coherence requires singular judgment. |
| Which maps exist; promotion to the canonical library | Admins, deliberately conservative. The intake question is always: *why isn't this a topic in an existing map?* |
| Maintainer appointment and succession | Admins (and superadmin), based on demonstrated contribution. |
| Admin appointment | Superadmin. |
| What's popular | **Nobody.** Usage signals (saves, paths started) are telemetry shown *to* maintainers and admins as evidence — never a mechanism that directly decides anything. |
| Disagreement with a maintainer's call | The fork valve (below), not a vote. |

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

New maps start as proposals (an outline from the home screen), and an admin
may land one as **incubating** with its proposer as founding maintainer.
Promotion to the main library happens when it meets the charter, not when
it's popular.

Admins also keep a public **wanted list** (`roadmaps/wanted.json`, shown on
the home screen) — a standing invitation to propose the maps the library is
missing, and the tool for steering coverage toward its gaps rather than
toward what early contributors happen to know.

## Disagreement: the fork valve

Scoped authority is tolerable in open source because you can always fork.
Here, in ascending order of effort:

1. **Collections** — anyone can group and sequence existing maps their own
   way and share it. "The maintainer organized this wrong" has a productive
   answer that isn't a governance fight.
2. **Proposals** — every rejection is recorded; a pattern of good rejected
   ideas is evidence admins can act on.
3. **The full fork** — the content is CC BY-SA 4.0 and the code is MIT.
   Anyone can take the entire commons and grow it elsewhere. That this is
   possible is precisely what keeps the roles honest.

## Stewardship, not ownership

- **The commons lives or dies on review latency.** Contributors don't leave
  because they were rejected; they leave because nothing happened. Proposals
  deserve an answer in days; one that has waited two weeks escalates to the
  admins.
- A maintainer holds a map in trust. Going dark for ~90 days with proposals
  waiting is a graceful handoff, not a scandal: admins appoint a successor
  and the record thanks the departing maintainer.
- Admins and the superadmin can replace any role binding at any time;
  because bindings live in one public document, succession is a one-line
  change, never a fight over accounts.
- Nobody, in any role, owns contributed content. The license guarantees it.

## Amending this document

Changes to governance are changes to the project's promises. They land like
any other change — a public commit, attributed — but only the superadmin
merges them, after the admins have seen them.
