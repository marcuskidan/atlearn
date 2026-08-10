# Contributing

Thank you for helping tend the maps. This project is a commons with gardeners:
many walk the paths, some tend them, and each map has one named maintainer with
final say. You do **not** need a GitHub account, git, or any technical skill to
contribute — the app itself is the front door.

## The three ways in

**1. Propose an edit (in the app — no GitHub needed).**
Sign in, open any node, click ✏️. Edit the summary, links, actions, or
subtopics in the form and hit **Propose change** with a short note. The map's
maintainer reviews your change as a diff and merges it; your name goes on the
change in the map's public history. This is the main path, built for domain
experts and everyday learners.

**2. Suggest (in the app).**
Not ready to write the change yourself? Use 💡 *Suggest an improvement* on any
node — a fix, a better resource, a field-tested tip, or a missing subtopic —
or 🌱 *Propose a map for the library* from the home screen as a simple
outline. You can also build the whole thing first as a personal map
(🗺 *Start a personal map*, yours instantly, no review) and offer it from
its panel when it's ready — the admission questions are in
GOVERNANCE.md, "What the library shelves."

**3. Pull request (for the git-comfortable).**
Content lives as small JSON files: one core topic per file at
`roadmaps/<map>/topics/NN-slug.json`. Edit the file, run
`python3 tools/build.py` (it validates everything and regenerates the index),
and open a PR. Run `python3 -m unittest discover -s tests` before pushing.

## Content rules (enforced by the validator and by maintainers)

- **Every node needs a real-world action** — specific and doable this week
  ("Go outside at 9 PM and locate Polaris"), never "practice more".
- Summaries: 2–3 curated sentences, curriculum-grounded, zero filler.
- Links: 1–2 per node, https, stable reputable sources, **and — the one hard
  rule — freely and legally accessible to everyone.** No paywalls, sign-up
  walls, or region locks. Only link resources you have personally used or
  verified.
- Tiers: `essential` | `recommended` | `extra`. Subtopics nest exactly one
  level under a core topic.
- Sensitive maps have standing constraints (see CLAUDE.md): financial literacy
  stays strictly educational; first aid stays awareness-level and points to
  certified courses; mental health keeps professional-help pathways intact;
  fitness stays general conditioning education, never a prescription.
  These four (personal finance, first aid, mental health, fitness) are typed
  `gated` and carry a visible scope disclaimer.
- **No affiliate or tracking parameters** in any URL — the build rejects them
  and shows the clean URL. Disclose any affiliation you have with a resource
  you propose (author, employee, affiliate, sponsor); undisclosed affiliation
  is a conduct violation.
- Hand-committed content changes should bump the map's `version` in meta.json
  (patch for content edits, minor for structure) — the in-app pipeline does
  this automatically; PRs do it by hand. Never hand-edit `changelog.json`
  (generated, append-only).

## Licensing of contributions

By submitting a contribution through any of the three routes, you agree that:

- content contributions (text, structure, resource selections) are licensed
  under **CC BY-SA 4.0** (see LICENSE-CONTENT.md),
- code contributions are licensed under **MIT** (see LICENSE),
- and you affirm you have the right to license what you submit.

Attribution is preserved: merged edits carry your display name in the map's
public history and in the repository's change records.

## Governance

Each map's maintainer has final say on its content — good curriculum is
opinionated, and this is not a democracy of edits. The platform admins
appoints maintainers and moderates platform-wide. Rejections aren't personal;
maintainers curate for the learner walking the path. See the manifesto (the
app's About page) for why it works this way.
