// Firestore security-rules tests — the server-side boundary's test suite.
// CI runs: npx firebase emulators:exec --only firestore --project demo-hkr \
//            "node --test tests/rules.test.mjs"
// (Requires the emulator; skipped by plain `node --test` when absent.)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

let testEnv, rut;
const EMULATED = !!process.env.FIRESTORE_EMULATOR_HOST;

before(async () => {
  if (!EMULATED) return;
  rut = await import("@firebase/rules-unit-testing");
  const { readFileSync } = await import("node:fs");
  testEnv = await rut.initializeTestEnvironment({
    projectId: "demo-hkr",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  // seed roles with the admin backdoor
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("meta/roles").set({
      superadmins: ["super-uid"],
      admins: ["admin-uid"],
      maintainers: { astro: { uid: "maintainer-uid", name: "Stella" } },
    });
  });
});
after(async () => { if (testEnv) await testEnv.cleanup(); });

const db = (uid) => (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).firestore();
function sgTs() {   // serverTimestamp sentinel — satisfies `createdAt == request.time`
  // newer @firebase/rules-unit-testing versions dropped the re-export; go
  // through the compat SDK the test contexts are built on
  if (rut.serverTimestamp) return rut.serverTimestamp();
  return firebaseCompat.firestore.FieldValue.serverTimestamp();
}
let firebaseCompat;
before(async () => {
  if (!EMULATED) return;
  firebaseCompat = (await import("firebase/compat/app")).default;
  await import("firebase/compat/firestore");
});
const suggestion = (over = {}) => ({
  roadmap: "astro", node: "n1", nodeTitle: "Node", type: "tip",
  text: "Twenty characters of genuinely useful field-tested advice.",
  url: "", verified: true, by: { uid: "user-uid", name: "U" },
  createdAt: sgTs(), status: "pending", ...over,
});

const guard = (name, fn) => test(name, { skip: !EMULATED && "no emulator" }, fn);

guard("stranger cannot read another user's progress", async () => {
  await rut.assertFails(db("someone").doc("users/other").get());
  await rut.assertFails(db(null).doc("users/other").get());
});

guard("owner can read/write own progress", async () => {
  await rut.assertSucceeds(db("me").doc("users/me").set({ v: 1, progress: {} }));
  await rut.assertSucceeds(db("me").doc("users/me").get());
});

guard("journal: owner-only entries with shape caps; tombstones allowed; strangers blind", async () => {
  const entry = { rm: "meditation", node: "sitting-down", kind: "reflection",
    prompt: "What does your mind offer as a reason to skip sitting today?",
    date: "2026-08-07", text: "It offered email.", createdAt: 1, updatedAt: 1 };
  await rut.assertSucceeds(db("me").doc("users/me/journal/e1").set(entry));
  await rut.assertSucceeds(db("me").doc("users/me/journal/e1").get());
  await rut.assertSucceeds(db("me").doc("users/me/journal/e1")
    .set({ ...entry, text: "", deleted: true, updatedAt: 2 }));    // tombstone
  await rut.assertFails(db("stranger").doc("users/me/journal/e1").get());
  await rut.assertFails(db("stranger").doc("users/me/journal/e2").set(entry));
  await rut.assertFails(db(null).collection("users/me/journal").get());
  await rut.assertFails(db("me").doc("users/me/journal/e3")
    .set({ ...entry, kind: "poem" }));                             // not a kind
  await rut.assertFails(db("me").doc("users/me/journal/e3")
    .set({ ...entry, text: "x".repeat(10001) }));                  // over the cap
  await rut.assertFails(db("me").doc("users/me/journal/e3")
    .set({ ...entry, extra: true }));                              // stray key
  await rut.assertSucceeds(db("me").doc("users/me/journal/e1").delete());
});

guard("roles: public read; create/delete always denied", async () => {
  await rut.assertSucceeds(db(null).doc("meta/roles").get());
  await rut.assertFails(db("user-uid").doc("meta/roles")
    .update({ admins: ["user-uid"] }));
  await rut.assertFails(db("admin-uid").doc("meta/roles").delete());
});

guard("roles escalation ladder: admins bind maintainers only; superadmin binds admins; superadmins immutable", async () => {
  // admin may rebind maintainers…
  await rut.assertSucceeds(db("admin-uid").doc("meta/roles")
    .update({ maintainers: { astro: { uid: "new-maintainer", name: "Nova" } } }));
  // …but cannot change the admin bench or mint root
  await rut.assertFails(db("admin-uid").doc("meta/roles")
    .update({ admins: ["admin-uid", "friend-uid"] }));
  await rut.assertFails(db("admin-uid").doc("meta/roles")
    .update({ superadmins: ["admin-uid"] }));
  // superadmin appoints admins and maintainers…
  await rut.assertSucceeds(db("super-uid").doc("meta/roles")
    .update({ admins: ["admin-uid", "second-admin"],
              maintainers: { astro: { uid: "maintainer-uid", name: "Stella" } } }));
  // …but even the superadmin cannot grow the root list through the API
  await rut.assertFails(db("super-uid").doc("meta/roles")
    .update({ superadmins: ["super-uid", "evil-uid"] }));
  // superadmin implies admin powers elsewhere (moderates any map)
  await rut.assertSucceeds(db("super-uid").doc("tips/cooking").set({ n1: [] }));
  // restore seed state for later tests
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("meta/roles").set({
      superadmins: ["super-uid"],
      admins: ["admin-uid"],
      maintainers: { astro: { uid: "maintainer-uid", name: "Stella" } },
    });
  });
});

guard("suggestion create: signed-in with valid shape succeeds", async () => {
  await rut.assertSucceeds(db("user-uid").collection("suggestions")
    .add({ ...suggestion(), createdAt: sgTs() }));
});

guard("suggestion create rejected: anonymous, short text, spoofed author, wrong status", async () => {
  await rut.assertFails(db(null).collection("suggestions")
    .add({ ...suggestion(), createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add({ ...suggestion({ text: "too short" }), createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add({ ...suggestion({ by: { uid: "other", name: "X" } }), createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add({ ...suggestion({ status: "published" }), createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add({ ...suggestion({ url: "http://insecure.example" }), createdAt: sgTs() }));
});

guard("suggestion moderation: scoped to the map's maintainer", async () => {
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("suggestions").add(suggestion({ createdAt: new Date() }));
  });
  const path = `suggestions/${ref.id}`;
  // the author may read their own (feedback loop); an unrelated user may not
  await rut.assertSucceeds(db("user-uid").doc(path).get());
  await rut.assertFails(db("stranger-uid").doc(path).get());
  await rut.assertSucceeds(db("maintainer-uid").doc(path).get());
  await rut.assertFails(db("user-uid").doc(path)
    .update({ status: "published", decidedAt: 1, decidedBy: { uid: "user-uid" } }));
  await rut.assertFails(db("maintainer-uid").doc(path)
    .update({ status: "published", text: "tampered with the text" }));
  await rut.assertSucceeds(db("maintainer-uid").doc(path)
    .update({ status: "published", decidedAt: 1, decidedBy: { uid: "maintainer-uid", name: "Stella" } }));
});

guard("contributor feedback loop: author reads own, deletes own pending only; decisions carry a reason", async () => {
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("suggestions").add(suggestion({ createdAt: new Date() }));
  });
  const path = `suggestions/${ref.id}`;
  // author sees their own submission; a stranger still cannot
  await rut.assertSucceeds(db("user-uid").doc(path).get());
  await rut.assertFails(db("someone").doc(path).get());
  // decision may carry a reason the author will read
  await rut.assertSucceeds(db("maintainer-uid").doc(path)
    .update({ status: "rejected", decidedAt: 1, reason: "Charter rule 1: the link is paywalled",
              decidedBy: { uid: "maintainer-uid", name: "Stella" } }));
  // once decided, the author can no longer withdraw it
  await rut.assertFails(db("user-uid").doc(path).delete());
  // …but a pending one they can
  let ref2;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref2 = await ctx.firestore().collection("suggestions").add(suggestion({ createdAt: new Date() }));
  });
  await rut.assertFails(db("someone").doc(`suggestions/${ref2.id}`).delete());
  await rut.assertSucceeds(db("user-uid").doc(`suggestions/${ref2.id}`).delete());
});

guard("reports: signed-in create with shape caps; admin-only read/delete on UGC kinds; text immutable", async () => {
  const report = { kind: "collection", target: { id: "coll-1", title: "Spam shelf" },
    text: "This collection is advertising a paid course.", severity: "normal",
    status: "open", by: { uid: "user-uid", name: "U" }, createdAt: sgTs() };
  await rut.assertSucceeds(db("user-uid").collection("reports").add(report));
  await rut.assertFails(db(null).collection("reports").add(report));
  await rut.assertFails(db("user-uid").collection("reports")
    .add({ ...report, by: { uid: "other", name: "X" } }));
  await rut.assertFails(db("user-uid").collection("reports")
    .add({ ...report, severity: "urgent" }));       // not a severity
  await rut.assertFails(db("user-uid").collection("reports")
    .add({ ...report, status: "resolved" }));       // born open, always
  await rut.assertFails(db("user-uid").collection("reports")
    .add({ ...report, text: "spam" }));   // under the 5-char floor
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("reports").add({ ...report, createdAt: new Date() });
  });
  await rut.assertFails(db("user-uid").doc(`reports/${ref.id}`).get());
  await rut.assertFails(db("maintainer-uid").doc(`reports/${ref.id}`).get()); // UGC kind: admin-only
  await rut.assertSucceeds(db("admin-uid").doc(`reports/${ref.id}`).get());
  await rut.assertFails(db("user-uid").doc(`reports/${ref.id}`).delete());
  await rut.assertFails(db("admin-uid").doc(`reports/${ref.id}`)
    .update({ text: "edited" }));
  await rut.assertSucceeds(db("admin-uid").doc(`reports/${ref.id}`)
    .update({ status: "resolved", resolvedAt: 1,
              resolvedBy: { uid: "admin-uid", name: "A" }, resolution: "hidden it" }));
  await rut.assertSucceeds(db("admin-uid").doc(`reports/${ref.id}`).delete());
});

guard("safety queue: map-content reports reach that map's maintainer; resolution is status-only", async () => {
  const report = { kind: "map",
    target: { roadmap: "astro", node: "n1", resource: "https://x.example/dead" },
    text: "This step tells beginners to look at the sun through the finder scope.",
    severity: "safety", status: "open",
    by: { uid: "user-uid", name: "U" }, createdAt: sgTs() };
  await rut.assertSucceeds(db("user-uid").collection("reports").add(report));
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("reports").add({ ...report, createdAt: new Date() });
  });
  await rut.assertSucceeds(db("maintainer-uid").doc(`reports/${ref.id}`).get());
  await rut.assertFails(db("user-uid").doc(`reports/${ref.id}`).get());
  await rut.assertSucceeds(db("maintainer-uid").doc(`reports/${ref.id}`)
    .update({ status: "resolved", resolvedAt: 1,
              resolvedBy: { uid: "maintainer-uid", name: "Stella" },
              resolution: "step suppressed, resource swapped" }));
  await rut.assertFails(db("maintainer-uid").doc(`reports/${ref.id}`)
    .update({ severity: "normal" }));               // can't downgrade the flag
  await rut.assertFails(db("maintainer-uid").doc(`reports/${ref.id}`).delete());
  // cooking's reports are not astro's maintainer's business
  let other;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    other = await ctx.firestore().collection("reports").add(
      { ...report, target: { roadmap: "cooking" }, createdAt: new Date() });
  });
  await rut.assertFails(db("maintainer-uid").doc(`reports/${other.id}`).get());
});

guard("resource flags: one idempotent flag per user per resource; moderator-scoped read/clear", async () => {
  const flag = { key: "astro_n1_abc123", roadmap: "astro", node: "n1",
    url: "https://x.example/dead", reason: "dead", by: "user-uid", createdAt: sgTs() };
  await rut.assertSucceeds(db("user-uid").doc("flags/user-uid_astro_n1_abc123").set(flag));
  // duplicate tap = update = denied (create-only semantics ARE the rate limit)
  await rut.assertFails(db("user-uid").doc("flags/user-uid_astro_n1_abc123")
    .set({ ...flag, reason: "stale" }));
  // id must be uid_key — no flooding other ids or spoofing by
  await rut.assertFails(db("user-uid").doc("flags/user-uid_other_key").set(flag));
  await rut.assertFails(db("user-uid").doc("flags/other-uid_astro_n1_abc123")
    .set({ ...flag, by: "other-uid" }));
  await rut.assertFails(db(null).doc("flags/anon_astro_n1_abc123").set(flag));
  await rut.assertFails(db("user-uid").doc("flags/user-uid_k2")
    .set({ ...flag, key: "k2", reason: "boring" }));   // not a reason
  // reads: that map's maintainer and admins; not the public, not other maintainers
  await rut.assertSucceeds(db("maintainer-uid")
    .doc("flags/user-uid_astro_n1_abc123").get());
  await rut.assertSucceeds(db("admin-uid").doc("flags/user-uid_astro_n1_abc123").get());
  await rut.assertFails(db("someone").doc("flags/user-uid_astro_n1_abc123").get());
  // clearing after a fix
  await rut.assertSucceeds(db("maintainer-uid")
    .doc("flags/user-uid_astro_n1_abc123").delete());
});

guard("maintainer of astro cannot moderate another map", async () => {
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("suggestions")
      .add(suggestion({ roadmap: "cooking", createdAt: new Date() }));
  });
  await rut.assertFails(db("maintainer-uid").doc(`suggestions/${ref.id}`).get());
  await rut.assertFails(db("maintainer-uid").doc(`suggestions/${ref.id}`)
    .update({ status: "rejected", decidedAt: 1, decidedBy: { uid: "maintainer-uid" } }));
  await rut.assertSucceeds(db("admin-uid").doc(`suggestions/${ref.id}`)
    .update({ status: "rejected", decidedAt: 1, decidedBy: { uid: "admin-uid", name: "O" } }));
});

guard("tips: public read; only that map's moderator writes", async () => {
  await rut.assertSucceeds(db(null).doc("tips/astro").get());
  await rut.assertFails(db("user-uid").doc("tips/astro").set({ n1: [] }));
  await rut.assertSucceeds(db("maintainer-uid").doc("tips/astro").set({ n1: [] }));
  await rut.assertFails(db("maintainer-uid").doc("tips/cooking").set({ n1: [] }));
});

guard("tips: doc-wide size cap bounds a moderator's blast radius", async () => {
  const over = {}; for (let i = 0; i < 301; i++) over["n" + i] = [];
  await rut.assertFails(db("maintainer-uid").doc("tips/astro").set(over));
  const within = {}; for (let i = 0; i < 300; i++) within["n" + i] = [];
  await rut.assertSucceeds(db("maintainer-uid").doc("tips/astro").set(within));
});

guard("merged overlay: public read; moderator-only create; immutable to clients", async () => {
  const doc = { roadmap: "astro", file: "01-start.json",
    topic: { id: "s", title: "S", tier: "essential", learn: { summary: "x", links: [] }, do: ["a"] },
    by: { uid: "user-uid", name: "U" }, mergedBy: { uid: "maintainer-uid", name: "Stella" }, note: "", at: 1 };
  await rut.assertFails(db("user-uid").collection("merged")
    .add({ ...doc, mergedBy: { uid: "user-uid", name: "U" } }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged").add(doc));
  await rut.assertSucceeds(db(null).collection("merged").get());
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("merged").add(doc);
  });
  await rut.assertFails(db("maintainer-uid").doc(`merged/${ref.id}`).delete());
  await rut.assertFails(db("admin-uid").doc(`merged/${ref.id}`)
    .update({ topic: { id: "evil" } }));
});

guard("merged: attribution (by + mergedBy names) is required", async () => {
  // tools/land.mjs writes both names into the public commit message — a doc
  // without them must never reach the landing queue
  const doc = { roadmap: "astro", file: "01-start.json",
    topic: { id: "s", title: "S", tier: "essential", learn: { summary: "x", links: [] }, do: ["a"] },
    by: { uid: "user-uid", name: "U" }, mergedBy: { uid: "maintainer-uid", name: "Stella" }, note: "", at: 1 };
  const add = (d) => db("maintainer-uid").collection("merged").add(d);
  const { by, ...noBy } = doc;
  await rut.assertFails(add(noBy));
  await rut.assertFails(add({ ...doc, by: { uid: "user-uid" } }));
  await rut.assertFails(add({ ...doc, by: { uid: "user-uid", name: "x".repeat(81) } }));
  await rut.assertFails(add({ ...doc, mergedBy: { uid: "maintainer-uid" } }));
  await rut.assertSucceeds(add(doc));
});

const TOPIC = { id: "t", title: "T", tier: "essential",
  learn: { summary: "s", links: [] }, do: ["a"] };

guard("structural kinds: valid add/remove/spine/move accepted for merged", async () => {
  const base = { roadmap: "astro", by: { uid: "u", name: "U" },
    mergedBy: { uid: "maintainer-uid", name: "Stella" }, note: "", at: 1 };
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC, after: "" }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC, after: "02-old.json" }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "remove", file: "03-old.json" }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "spine", spine: ["02-b.json", "01-a.json"] }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "move", file: "01-a.json", topic: TOPIC,
           file2: "02-b.json", topic2: { ...TOPIC, id: "t2" } }));
});

guard("structural kinds: malformed docs rejected", async () => {
  const base = { roadmap: "astro", by: { uid: "u", name: "U" },
    mergedBy: { uid: "maintainer-uid", name: "Stella" }, note: "", at: 1 };
  // unknown kind
  await rut.assertFails(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "rename", file: "01-a.json", topic: TOPIC }));
  // add without a position
  await rut.assertFails(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC }));
  // remove with a path-traversal file name
  await rut.assertFails(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "remove", file: "../meta.json" }));
  // spine that isn't a list
  await rut.assertFails(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "spine", spine: "01-a.json" }));
  // move onto itself
  await rut.assertFails(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "move", file: "01-a.json", topic: TOPIC,
           file2: "01-a.json", topic2: TOPIC }));
  // non-moderator can never create merged docs, structural or not
  await rut.assertFails(db("user-uid").collection("merged")
    .add({ ...base, mergedBy: { uid: "user-uid", name: "U" },
           kind: "remove", file: "03-old.json" }));
});

guard("topic payloads may carry resource metadata and reflect prompts (validTopic is hasAll, not hasOnly)", async () => {
  // Documents the guarantee Stage-1 schema fields rely on: new optional node
  // and link fields ride through ops with no rules change; build.py is the
  // authority on their shape at landing time.
  const rich = { ...TOPIC,
    reflect: ["What surprised you?"],
    learn: { summary: "s", links: [{ label: "L", url: "https://x.example/a",
      kind: "article", lang: "pt-BR", minutes: 12, verified: "2026-08-01",
      succession: ["https://x.example/b"] }] } };
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ roadmap: "astro", file: "02-topic.json", baseHash: "h", topic: rich,
           note: "", by: { uid: "user-uid", name: "U" }, status: "pending",
           createdAt: sgTs() }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ roadmap: "astro", file: "02-topic.json", topic: rich,
           by: { uid: "user-uid", name: "U" },
           mergedBy: { uid: "maintainer-uid", name: "Stella" }, note: "", at: 1 }));
});

guard("about op: proposable by anyone, mergeable by moderators, size-capped; stewards can't decide it", async () => {
  await seedStewards();
  const ABOUT = "Observational astronomy is the practice of reading the night sky with your own eyes.";
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ roadmap: "astro", kind: "about", about: ABOUT, note: "clearer lead",
           by: { uid: "user-uid", name: "U" }, status: "pending", createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("proposals")
    .add({ roadmap: "astro", kind: "about", about: "too short", note: "",
           by: { uid: "user-uid", name: "U" }, status: "pending", createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("proposals")
    .add({ roadmap: "astro", kind: "about", about: "x".repeat(4001), note: "",
           by: { uid: "user-uid", name: "U" }, status: "pending", createdAt: sgTs() }));
  // maintainer publishes the overlay directly
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ roadmap: "astro", kind: "about", about: ABOUT,
           by: { uid: "maintainer-uid", name: "Stella" },
           mergedBy: { uid: "maintainer-uid", name: "Stella" }, note: "", at: 1 }));
  // about is prose judgment: not a trivial edit — steward decisions bounce
  const prop = await seedProposal({ kind: "about", topic: null, file: null,
    baseHash: null, about: ABOUT });
  await rut.assertFails(db("steward-uid").doc(`proposals/${prop.id}`)
    .update({ status: "merged", decidedAt: 2,
              decidedBy: { uid: "steward-uid", name: "Sam" } }));
  await rut.assertSucceeds(db("maintainer-uid").doc(`proposals/${prop.id}`)
    .update({ status: "merged", decidedAt: 2,
              decidedBy: { uid: "maintainer-uid", name: "Stella" } }));
});

guard("structural proposals: contributors can propose add/remove/spine/move", async () => {
  const base = { roadmap: "astro", note: "why this helps",
    by: { uid: "user-uid", name: "U" }, status: "pending" };
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC, after: "",
           createdAt: sgTs() }));
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...base, kind: "remove", file: "03-old.json", baseHash: "h",
           createdAt: sgTs() }));
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...base, kind: "spine", spine: ["02-b.json", "01-a.json"], baseHash: "h",
           createdAt: sgTs() }));
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...base, kind: "move", file: "01-a.json", topic: TOPIC, baseHash: "h",
           file2: "02-b.json", topic2: { ...TOPIC, id: "t2" }, baseHash2: "h2",
           createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("proposals")
    .add({ ...base, kind: "spine", spine: [], createdAt: sgTs() }));
});

guard("proposal lifecycle: create shape enforced; decision status-only", async () => {
  const prop = { roadmap: "astro", file: "02-topic.json", baseHash: "h",
    topic: { id: "t", title: "T", tier: "essential", learn: { summary: "s", links: [] }, do: ["a"] },
    note: "", by: { uid: "user-uid", name: "U" }, status: "pending" };
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...prop, createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("proposals")
    .add({ ...prop, file: "../../etc/passwd", createdAt: sgTs() }));
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("proposals").add({ ...prop, createdAt: new Date() });
  });
  await rut.assertFails(db("maintainer-uid").doc(`proposals/${ref.id}`)
    .update({ status: "merged", topic: { id: "swapped" } }));
  await rut.assertSucceeds(db("maintainer-uid").doc(`proposals/${ref.id}`)
    .update({ status: "merged", decidedAt: 2, decidedBy: { uid: "maintainer-uid", name: "Stella" } }));
});

guard("steward scope: stewards cannot read others' suggestions (why their queue hides those tabs)", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("stewards/astro")
      .set({ members: { "steward2-uid": "Sam" }, updatedAt: 1 });
    await ctx.firestore().collection("suggestions")
      .add(suggestion({ createdAt: new Date() }));
  });
  await rut.assertFails(db("steward2-uid").collection("suggestions")
    .where("roadmap", "==", "astro").where("status", "==", "pending").get());
});

/* ---- stewards: per-map trivial-merge deputies (Part II/IV) ---- */

guard("stewards: maintainer binds on own map only; bindings public; caps enforced", async () => {
  await rut.assertSucceeds(db("maintainer-uid").doc("stewards/astro")
    .set({ members: { "steward-uid": "Sam" }, updatedAt: 1 }));
  await rut.assertSucceeds(db(null).doc("stewards/astro").get());       // public read
  await rut.assertFails(db("maintainer-uid").doc("stewards/cooking")   // not their map
    .set({ members: { "steward-uid": "Sam" }, updatedAt: 1 }));
  await rut.assertFails(db("steward-uid").doc("stewards/astro")        // no self-appoint
    .set({ members: { "steward-uid": "Sam", "friend-uid": "F" }, updatedAt: 1 }));
  await rut.assertFails(db("someone").doc("stewards/astro")
    .set({ members: { someone: "S" }, updatedAt: 1 }));
  const crowd = {}; for (let i = 0; i < 11; i++) crowd["uid" + i] = "U" + i;
  await rut.assertFails(db("admin-uid").doc("stewards/astro")
    .set({ members: crowd, updatedAt: 1 }));                            // >10 members
  await rut.assertFails(db("admin-uid").doc("stewards/astro")
    .set({ members: {}, updatedAt: 1, extra: true }));                  // stray key
  await rut.assertSucceeds(db("admin-uid").doc("stewards/astro")       // admins may bind
    .set({ members: { "steward-uid": "Sam" }, updatedAt: 2 }));
});

const seedProposal = async (over = {}) => {
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("proposals").add({
      roadmap: "astro", kind: "edit", file: "02-topic.json", baseHash: "h",
      topic: TOPIC, note: "", by: { uid: "user-uid", name: "U" },
      status: "pending", createdAt: new Date(), ...over,
    });
  });
  return ref;
};

guard("proposals are public-read (the open comment period needs them)", async () => {
  const ref = await seedProposal();
  await rut.assertSucceeds(db(null).doc(`proposals/${ref.id}`).get());
  await rut.assertSucceeds(db("stranger").collection("proposals").get());
});

guard("weight field: validated on create, optional", async () => {
  const base = { roadmap: "astro", kind: "edit", file: "02-topic.json", baseHash: "h",
    topic: TOPIC, note: "", by: { uid: "user-uid", name: "U" }, status: "pending" };
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...base, weight: "trivial", createdAt: sgTs() }));
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...base, weight: "substantive", createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("proposals")
    .add({ ...base, weight: "structural", createdAt: sgTs() }));   // not a declared class
});

const seedStewards = async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("stewards/astro")
      .set({ members: { "steward-uid": "Sam" }, updatedAt: 1 });
  });
};

guard("steward merges a trivial edit via the linked batch; nothing heavier", async () => {
  await seedStewards();
  const trivial = await seedProposal({ weight: "trivial" });
  const fs = db("steward-uid");
  const b = fs.batch();
  b.update(fs.doc(`proposals/${trivial.id}`),
    { status: "merged", decidedAt: 2, decidedBy: { uid: "steward-uid", name: "Sam" } });
  b.set(fs.collection("merged").doc(), {
    roadmap: "astro", kind: "edit", file: "02-topic.json", topic: TOPIC,
    proposal: trivial.id, weight: "trivial",
    by: { uid: "user-uid", name: "U" },
    mergedBy: { uid: "steward-uid", name: "Sam" }, note: "", at: 2 });
  await rut.assertSucceeds(b.commit());

  // substantive edit: steward may not decide
  const subst = await seedProposal({ weight: "substantive" });
  await rut.assertFails(db("steward-uid").doc(`proposals/${subst.id}`)
    .update({ status: "merged", decidedAt: 2,
              decidedBy: { uid: "steward-uid", name: "Sam" } }));
  // absent weight = substantive: also blocked
  const legacy = await seedProposal({});
  await rut.assertFails(db("steward-uid").doc(`proposals/${legacy.id}`)
    .update({ status: "merged", decidedAt: 2,
              decidedBy: { uid: "steward-uid", name: "Sam" } }));
  // structural kind: blocked for stewards regardless of any weight claim
  const structural = await seedProposal({ kind: "remove", topic: null, weight: "trivial" });
  await rut.assertFails(db("steward-uid").doc(`proposals/${structural.id}`)
    .update({ status: "merged", decidedAt: 2,
              decidedBy: { uid: "steward-uid", name: "Sam" } }));
  // steward reject of a trivial edit is fine (with a reason)
  const trivial2 = await seedProposal({ weight: "trivial" });
  await rut.assertSucceeds(db("steward-uid").doc(`proposals/${trivial2.id}`)
    .update({ status: "rejected", decidedAt: 2, reason: "dup",
              decidedBy: { uid: "steward-uid", name: "Sam" } }));
});

guard("steward cannot mint merged docs without a matching trivial proposal", async () => {
  await seedStewards();
  const doc = { roadmap: "astro", kind: "edit", file: "02-topic.json", topic: TOPIC,
    by: { uid: "user-uid", name: "U" },
    mergedBy: { uid: "steward-uid", name: "Sam" }, note: "", at: 3 };
  await rut.assertFails(db("steward-uid").collection("merged").add(doc)); // no proposal link
  const subst = await seedProposal({ weight: "substantive" });
  await rut.assertFails(db("steward-uid").collection("merged")
    .add({ ...doc, proposal: subst.id, weight: "trivial" }));             // linked doc isn't trivial
  const otherMap = await seedProposal({ roadmap: "cooking", weight: "trivial" });
  await rut.assertFails(db("steward-uid").collection("merged")
    .add({ ...doc, proposal: otherMap.id }));                             // map mismatch
});

guard("7-day comment period: structural merges wait; rejection is immediate", async () => {
  const fresh = await seedProposal({ kind: "spine", topic: null, file: null, baseHash: null,
    spine: ["02-b.json", "01-a.json"] });
  await rut.assertFails(db("maintainer-uid").doc(`proposals/${fresh.id}`)
    .update({ status: "merged", decidedAt: 2,
              decidedBy: { uid: "maintainer-uid", name: "Stella" } }));
  await rut.assertSucceeds(db("maintainer-uid").doc(`proposals/${fresh.id}`)
    .update({ status: "rejected", decidedAt: 2, reason: "not this shape",
              decidedBy: { uid: "maintainer-uid", name: "Stella" } }));
  const aged = await seedProposal({ kind: "spine", topic: null, file: null, baseHash: null,
    spine: ["02-b.json", "01-a.json"], createdAt: new Date(Date.now() - 8 * 864e5) });
  await rut.assertSucceeds(db("maintainer-uid").doc(`proposals/${aged.id}`)
    .update({ status: "merged", decidedAt: 2,
              decidedBy: { uid: "maintainer-uid", name: "Stella" } }));
  // trivial/substantive edits merge without waiting
  const edit = await seedProposal({ weight: "substantive" });
  await rut.assertSucceeds(db("maintainer-uid").doc(`proposals/${edit.id}`)
    .update({ status: "merged", decidedAt: 2,
              decidedBy: { uid: "maintainer-uid", name: "Stella" } }));
});

guard("proposal comments: public read; signed-in immutable posts; moderator delete", async () => {
  const prop = await seedProposal({});
  const path = `proposals/${prop.id}/comments`;
  await rut.assertSucceeds(db("someone").collection(path)
    .add({ text: "Melody-first worked for me.", by: { uid: "someone", name: "S" },
           createdAt: sgTs() }));
  await rut.assertFails(db(null).collection(path)
    .add({ text: "anon", by: { uid: "x", name: "X" }, createdAt: sgTs() }));
  await rut.assertFails(db("someone").collection(path)
    .add({ text: "spoof", by: { uid: "other", name: "O" }, createdAt: sgTs() }));
  await rut.assertFails(db("someone").collection(path)
    .add({ text: "x".repeat(2001), by: { uid: "someone", name: "S" }, createdAt: sgTs() }));
  let cref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    cref = await ctx.firestore().collection(path)
      .add({ text: "seed", by: { uid: "someone", name: "S" }, createdAt: new Date() });
  });
  await rut.assertSucceeds(db(null).doc(`${path}/${cref.id}`).get());
  await rut.assertFails(db("someone").doc(`${path}/${cref.id}`)
    .update({ text: "edited" }));                                   // immutable
  await rut.assertFails(db("someone").doc(`${path}/${cref.id}`).delete());
  await rut.assertSucceeds(db("maintainer-uid").doc(`${path}/${cref.id}`).delete());
});

/* ---- map lifecycle overlay: orphan flag + designated successor ---- */

guard("mapstates: admin flags orphans; maintainer names successor on own map only; public read", async () => {
  await rut.assertSucceeds(db("admin-uid").doc("mapstates/astro")
    .set({ state: "orphaned", note: "maintainer went dark",
           by: { uid: "admin-uid", name: "A" }, at: 1 }));
  await rut.assertSucceeds(db(null).doc("mapstates/astro").get());
  // maintainer: successor only, own map only
  await rut.assertSucceeds(db("maintainer-uid").doc("mapstates/astro")
    .set({ successor: { uid: "heir-uid", name: "H" } }, { merge: true }));
  await rut.assertFails(db("maintainer-uid").doc("mapstates/astro")
    .set({ state: "" }, { merge: true }));                       // not their key
  await rut.assertFails(db("maintainer-uid").doc("mapstates/cooking")
    .set({ successor: { uid: "heir-uid", name: "H" } }, { merge: true }));
  await rut.assertFails(db("maintainer-uid").doc("mapstates/astro")
    .set({ successor: { uid: "heir-uid", name: "H", extra: 1 } }, { merge: true }));
  // strangers: nothing
  await rut.assertFails(db("someone").doc("mapstates/astro")
    .set({ state: "orphaned" }, { merge: true }));
  // bad state value
  await rut.assertFails(db("admin-uid").doc("mapstates/astro")
    .set({ state: "cursed" }, { merge: true }));
  // clearing the orphan flag
  await rut.assertSucceeds(db("admin-uid").doc("mapstates/astro")
    .set({ state: "", by: { uid: "admin-uid", name: "A" }, at: 2 }, { merge: true }));
  await rut.assertSucceeds(db("admin-uid").doc("mapstates/astro").delete());
});

guard("integrity: affiliate-tainted suggestion urls bounce; disclosure shape enforced", async () => {
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add(suggestion({ type: "link", url: "https://x.example/a?utm_source=news" })));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add(suggestion({ url: "https://x.example/a?fbclid=abc" })));
  await rut.assertSucceeds(db("user-uid").collection("suggestions")
    .add(suggestion({ url: "https://x.example/a?id=7" })));
  // disclosure: both fields or neither; text only when affiliated
  await rut.assertSucceeds(db("user-uid").collection("suggestions")
    .add(suggestion({ affiliated: false, affiliation: "" })));
  await rut.assertSucceeds(db("user-uid").collection("suggestions")
    .add(suggestion({ affiliated: true, affiliation: "I wrote this guide" })));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add(suggestion({ affiliated: false, affiliation: "sneaky text" })));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add(suggestion({ affiliated: "yes", affiliation: "" })));
  // proposals carry the same fields
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ roadmap: "astro", kind: "edit", file: "02-topic.json", baseHash: "h",
           topic: TOPIC, note: "", by: { uid: "user-uid", name: "U" },
           status: "pending", affiliated: true, affiliation: "my channel",
           createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("proposals")
    .add({ roadmap: "astro", kind: "edit", file: "02-topic.json", baseHash: "h",
           topic: TOPIC, note: "", by: { uid: "user-uid", name: "U" },
           status: "pending", affiliated: false, affiliation: "x",
           createdAt: sgTs() }));
});

guard("adoption: the 'adopt' suggestion type is a valid candidacy pitch", async () => {
  const by = { uid: "someone", name: "S" };
  await rut.assertSucceeds(db("someone").collection("suggestions")
    .add(suggestion({ type: "adopt", by,
      text: "I have walked this map twice and filed six accepted proposals; happy to tend it." })));
  await rut.assertFails(db("someone").collection("suggestions")
    .add(suggestion({ type: "inherit", by })));
});

/* ---- the AI line: agents file via Admin SDK only; clients can't wear the badge ---- */

guard("no client can write under an agent: identity — even its 'own'", async () => {
  // a hostile client authenticating as a uid that looks agent-ish still can't
  // file with an agent by-line; the namespace belongs to trusted infrastructure
  await rut.assertFails(db("agent:link-steward").collection("proposals")
    .add({ roadmap: "astro", kind: "edit", file: "02-topic.json", baseHash: "h",
           topic: TOPIC, note: "", status: "pending",
           by: { uid: "agent:link-steward", name: "Fake Steward" },
           createdAt: sgTs() }));
  await rut.assertFails(db("agent:link-steward").collection("suggestions")
    .add(suggestion({ by: { uid: "agent:link-steward", name: "Fake" } })));
});

/* ---- guilds, guides, endorsements (Part I/II/VI) ---- */

const seedGuild = async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("guilds/night-sky").set({
      title: "The Night Sky Guild", blurb: "Astronomy and its neighbors.",
      maps: ["astro"], guides: { "guide-uid": "Vega" },
      createdAt: 1, updatedAt: 1 });
  });
};

guard("guilds: public read; admin-only shape-capped writes", async () => {
  const guild = { title: "The Night Sky Guild", blurb: "", maps: ["astro"],
    guides: { "guide-uid": "Vega" }, createdAt: 1, updatedAt: 1 };
  await rut.assertSucceeds(db("admin-uid").doc("guilds/night-sky").set(guild));
  await rut.assertSucceeds(db(null).doc("guilds/night-sky").get());
  await rut.assertFails(db("guide-uid").doc("guilds/night-sky")
    .set({ ...guild, guides: { "guide-uid": "Vega", "friend": "F" } }));  // no self-service
  await rut.assertFails(db("someone").doc("guilds/other").set(guild));
  await rut.assertFails(db("admin-uid").doc("guilds/BAD_ID").set(guild));
  await rut.assertFails(db("admin-uid").doc("guilds/night-sky")
    .set({ ...guild, title: "ab" }));                                     // under floor
  const crowd = {}; for (let i = 0; i < 11; i++) crowd["g" + i] = "G";
  await rut.assertFails(db("admin-uid").doc("guilds/night-sky")
    .set({ ...guild, guides: crowd }));                                   // >10 guides
});

guard("guild talk: signed-in immutable posts; guide/admin moderation, own guild only", async () => {
  await seedGuild();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("guilds/kitchen").set({
      title: "Kitchen Guild", blurb: "", maps: ["cooking"], guides: {},
      createdAt: 1, updatedAt: 1 });
  });
  const path = "guilds/night-sky/talk";
  await rut.assertSucceeds(db("someone").collection(path)
    .add({ text: "Found a great open-access star atlas.",
           by: { uid: "someone", name: "S" }, createdAt: sgTs() }));
  await rut.assertFails(db(null).collection(path)
    .add({ text: "anon", by: { uid: "x", name: "X" }, createdAt: sgTs() }));
  let tref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    tref = await ctx.firestore().collection(path)
      .add({ text: "seed", by: { uid: "someone", name: "S" }, createdAt: new Date() });
  });
  await rut.assertSucceeds(db(null).doc(`${path}/${tref.id}`).get());
  await rut.assertFails(db("someone").doc(`${path}/${tref.id}`).update({ text: "x" }));
  await rut.assertFails(db("someone").doc(`${path}/${tref.id}`).delete());
  await rut.assertSucceeds(db("guide-uid").doc(`${path}/${tref.id}`).delete());
  // a night-sky guide has no power in the kitchen
  let kref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    kref = await ctx.firestore().collection("guilds/kitchen/talk")
      .add({ text: "seed", by: { uid: "someone", name: "S" }, createdAt: new Date() });
  });
  await rut.assertFails(db("guide-uid").doc(`guilds/kitchen/talk/${kref.id}`).delete());
  await rut.assertSucceeds(db("admin-uid").doc(`guilds/kitchen/talk/${kref.id}`).delete());
});

guard("endorsements: guide marks maps inside their guild; immutable; withdrawable", async () => {
  await seedGuild();
  const mark = { guild: "night-sky", roadmap: "astro", audience: "absolute beginners",
    criteria: "Highest completion depth of the guild's maps; every resource verified this quarter.",
    method: "guide", by: { uid: "guide-uid", name: "Vega" }, at: sgTs() };
  await rut.assertSucceeds(db("guide-uid").collection("endorsements").add(mark));
  await rut.assertSucceeds(db(null).collection("endorsements").get());
  await rut.assertFails(db("guide-uid").collection("endorsements")
    .add({ ...mark, roadmap: "cooking" }));            // not in the guild's maps
  await rut.assertFails(db("someone").collection("endorsements")
    .add({ ...mark, by: { uid: "someone", name: "S" } }));  // not a guide
  await rut.assertFails(db("guide-uid").collection("endorsements")
    .add({ ...mark, method: "election" }));            // vote-ready, not vote-now
  await rut.assertFails(db("guide-uid").collection("endorsements")
    .add({ ...mark, criteria: "trust me" }));          // criteria under the floor
  let eref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    eref = await ctx.firestore().collection("endorsements").add({ ...mark, at: new Date() });
  });
  await rut.assertFails(db("guide-uid").doc(`endorsements/${eref.id}`)
    .update({ audience: "everyone" }));                // immutable
  await rut.assertSucceeds(db("guide-uid").doc(`endorsements/${eref.id}`).delete());
});

guard("guides flag orphans for their guild's maps only", async () => {
  await seedGuild();
  await rut.assertSucceeds(db("guide-uid").doc("mapstates/astro")
    .set({ state: "orphaned", guild: "night-sky", note: "maintainer dark 6 weeks",
           by: { uid: "guide-uid", name: "Vega" }, at: 1 }, { merge: true }));
  await rut.assertSucceeds(db("guide-uid").doc("mapstates/astro")
    .set({ state: "", guild: "night-sky",
           by: { uid: "guide-uid", name: "Vega" }, at: 2 }, { merge: true }));
  await rut.assertFails(db("guide-uid").doc("mapstates/cooking")
    .set({ state: "orphaned", guild: "night-sky",
           by: { uid: "guide-uid", name: "Vega" }, at: 1 }, { merge: true }));
  await rut.assertFails(db("guide-uid").doc("mapstates/astro")
    .set({ successor: { uid: "x", name: "X" }, guild: "night-sky" }, { merge: true }));
});

/* ---- forks: personal versions of maps (Personalize) ---- */
const fork = (over = {}) => ({
  base: "astro", title: "Astronomy, Nova's way",
  ops: [{ kind: "edit", file: "01-start.json", at: 1,
          topic: { id: "s", title: "S", tier: "essential",
                   learn: { summary: "x", links: [] }, do: ["a"] } }],
  owner: { uid: "user-uid", name: "U" }, hidden: false,
  createdAt: sgTs(), updatedAt: sgTs(), ...over,
});

guard("forks: signed-in owner creates; public read", async () => {
  await rut.assertSucceeds(db("user-uid").collection("forks").add(fork()));
  await rut.assertSucceeds(db(null).collection("forks").get());
});

guard("forks create rejected: anonymous, spoofed owner, self-hidden, bad shape", async () => {
  await rut.assertFails(db(null).collection("forks").add(fork()));
  await rut.assertFails(db("user-uid").collection("forks")
    .add(fork({ owner: { uid: "other-uid", name: "X" } })));
  await rut.assertFails(db("user-uid").collection("forks")
    .add(fork({ hidden: true })));
  await rut.assertFails(db("user-uid").collection("forks")
    .add(fork({ base: "../escape" })));
  await rut.assertFails(db("user-uid").collection("forks")
    .add(fork({ ops: "not-a-list" })));
  await rut.assertFails(db("user-uid").collection("forks")
    .add(fork({ extra: "field" })));
});

guard("forks update/delete: owner edits, admin hides, strangers do neither", async () => {
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("forks")
      .add(fork({ createdAt: new Date(), updatedAt: new Date() }));
  });
  const path = `forks/${ref.id}`;
  await rut.assertSucceeds(db("user-uid").doc(path)
    .update({ title: "Astronomy, revised", ops: [], updatedAt: new Date() }));
  await rut.assertFails(db("user-uid").doc(path).update({ hidden: true }));
  await rut.assertFails(db("user-uid").doc(path)
    .update({ owner: { uid: "user-uid", name: "Renamed" } }));
  await rut.assertFails(db("someone").doc(path).update({ title: "Hijacked!" }));
  await rut.assertFails(db("someone").doc(path).delete());
  await rut.assertSucceeds(db("admin-uid").doc(path).update({ hidden: true }));
  await rut.assertFails(db("admin-uid").doc(path).update({ title: "Admin rewrite" }));
  await rut.assertSucceeds(db("user-uid").doc(path).delete());
});

/* ---- collections: owner-curated shelves of maps ---- */
const collection = (over = {}) => ({
  title: "Learning the Natural World", blurb: "Sky, garden, weather.",
  maps: ["astro", "gardening"], owner: { uid: "user-uid", name: "U" },
  featured: false, hidden: false,
  createdAt: sgTs(), updatedAt: sgTs(), ...over,
});

guard("collections: signed-in owner creates with valid shape; public read", async () => {
  await rut.assertSucceeds(db("user-uid").collection("collections").add(collection()));
  await rut.assertSucceeds(db(null).collection("collections").get());
});

guard("collections create rejected: anonymous, spoofed owner, self-feature, bad shape", async () => {
  await rut.assertFails(db(null).collection("collections").add(collection()));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ owner: { uid: "other-uid", name: "X" } })));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ featured: true })));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ hidden: true })));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ title: "ab" })));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ maps: [] })));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ extra: "field" })));
});

guard("collections update/delete: owner curates, admin moderates, strangers do neither", async () => {
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("collections")
      .add(collection({ createdAt: new Date(), updatedAt: new Date() }));
  });
  const path = `collections/${ref.id}`;
  // owner: content yes, moderation switches no
  await rut.assertSucceeds(db("user-uid").doc(path)
    .update({ title: "Natural World, v2", maps: ["astro"], updatedAt: new Date() }));
  await rut.assertFails(db("user-uid").doc(path).update({ featured: true }));
  await rut.assertFails(db("user-uid").doc(path)
    .update({ owner: { uid: "user-uid", name: "New Name" } }));
  // stranger: nothing
  await rut.assertFails(db("someone").doc(path).update({ title: "Hijacked!!" }));
  await rut.assertFails(db("someone").doc(path).delete());
  // admin: moderation switches yes, content no
  await rut.assertSucceeds(db("admin-uid").doc(path)
    .update({ featured: true }));
  await rut.assertSucceeds(db("super-uid").doc(path)
    .update({ hidden: true }));
  await rut.assertFails(db("admin-uid").doc(path)
    .update({ title: "Admin rewrite" }));
  // owner may delete their own
  await rut.assertSucceeds(db("user-uid").doc(path).delete());
});
