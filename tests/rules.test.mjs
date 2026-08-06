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
      overseers: ["overseer-uid"],
      maintainers: { astro: { uid: "gardener-uid", name: "Stella" } },
    });
  });
});
after(async () => { if (testEnv) await testEnv.cleanup(); });

const db = (uid) => (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).firestore();
const suggestion = (over = {}) => ({
  roadmap: "astro", node: "n1", nodeTitle: "Node", type: "tip",
  text: "Twenty characters of genuinely useful field-tested advice.",
  url: "", verified: true, by: { uid: "user-uid", name: "U" },
  createdAt: rut.serverTimestamp ? rut.serverTimestamp() : null, status: "pending", ...over,
});
function sgTs() {   // serverTimestamp sentinel via the rules-unit-testing bundle
  return rut.serverTimestamp();
}

const guard = (name, fn) => test(name, { skip: !EMULATED && "no emulator" }, fn);

guard("stranger cannot read another user's progress", async () => {
  await rut.assertFails(db("someone").doc("users/other").get());
  await rut.assertFails(db(null).doc("users/other").get());
});

guard("owner can read/write own progress", async () => {
  await rut.assertSucceeds(db("me").doc("users/me").set({ v: 1, progress: {} }));
  await rut.assertSucceeds(db("me").doc("users/me").get());
});

guard("roles: public read, overseer-only update, create/delete denied", async () => {
  await rut.assertSucceeds(db(null).doc("meta/roles").get());
  await rut.assertFails(db("user-uid").doc("meta/roles")
    .update({ overseers: ["user-uid"] }));
  await rut.assertSucceeds(db("overseer-uid").doc("meta/roles")
    .update({ overseers: ["overseer-uid"], maintainers: { astro: { uid: "gardener-uid", name: "Stella" } } }));
  await rut.assertFails(db("overseer-uid").doc("meta/roles").delete());
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
  await rut.assertFails(db("user-uid").doc(path).get());
  await rut.assertSucceeds(db("gardener-uid").doc(path).get());
  await rut.assertFails(db("user-uid").doc(path)
    .update({ status: "published", decidedAt: 1, decidedBy: { uid: "user-uid" } }));
  await rut.assertFails(db("gardener-uid").doc(path)
    .update({ status: "published", text: "tampered with the text" }));
  await rut.assertSucceeds(db("gardener-uid").doc(path)
    .update({ status: "published", decidedAt: 1, decidedBy: { uid: "gardener-uid", name: "Stella" } }));
});

guard("maintainer of astro cannot moderate another map", async () => {
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("suggestions")
      .add(suggestion({ roadmap: "cooking", createdAt: new Date() }));
  });
  await rut.assertFails(db("gardener-uid").doc(`suggestions/${ref.id}`).get());
  await rut.assertFails(db("gardener-uid").doc(`suggestions/${ref.id}`)
    .update({ status: "rejected", decidedAt: 1, decidedBy: { uid: "gardener-uid" } }));
  await rut.assertSucceeds(db("overseer-uid").doc(`suggestions/${ref.id}`)
    .update({ status: "rejected", decidedAt: 1, decidedBy: { uid: "overseer-uid", name: "O" } }));
});

guard("tips: public read; only that map's moderator writes", async () => {
  await rut.assertSucceeds(db(null).doc("tips/astro").get());
  await rut.assertFails(db("user-uid").doc("tips/astro").set({ n1: [] }));
  await rut.assertSucceeds(db("gardener-uid").doc("tips/astro").set({ n1: [] }));
  await rut.assertFails(db("gardener-uid").doc("tips/cooking").set({ n1: [] }));
});

guard("merged overlay: public read; moderator-only create; immutable to clients", async () => {
  const doc = { roadmap: "astro", file: "01-start.json",
    topic: { id: "s", title: "S", tier: "essential", learn: { summary: "x", links: [] }, do: ["a"] },
    by: { uid: "user-uid", name: "U" }, mergedBy: { uid: "gardener-uid", name: "Stella" }, note: "", at: 1 };
  await rut.assertFails(db("user-uid").collection("merged")
    .add({ ...doc, mergedBy: { uid: "user-uid", name: "U" } }));
  await rut.assertSucceeds(db("gardener-uid").collection("merged").add(doc));
  await rut.assertSucceeds(db(null).collection("merged").get());
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("merged").add(doc);
  });
  await rut.assertFails(db("gardener-uid").doc(`merged/${ref.id}`).delete());
  await rut.assertFails(db("overseer-uid").doc(`merged/${ref.id}`)
    .update({ topic: { id: "evil" } }));
});

const TOPIC = { id: "t", title: "T", tier: "essential",
  learn: { summary: "s", links: [] }, do: ["a"] };

guard("structural kinds: valid add/remove/spine/move accepted for merged", async () => {
  const base = { roadmap: "astro", by: { uid: "u", name: "U" },
    mergedBy: { uid: "gardener-uid", name: "Stella" }, note: "", at: 1 };
  await rut.assertSucceeds(db("gardener-uid").collection("merged")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC, after: "" }));
  await rut.assertSucceeds(db("gardener-uid").collection("merged")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC, after: "02-old.json" }));
  await rut.assertSucceeds(db("gardener-uid").collection("merged")
    .add({ ...base, kind: "remove", file: "03-old.json" }));
  await rut.assertSucceeds(db("gardener-uid").collection("merged")
    .add({ ...base, kind: "spine", spine: ["02-b.json", "01-a.json"] }));
  await rut.assertSucceeds(db("gardener-uid").collection("merged")
    .add({ ...base, kind: "move", file: "01-a.json", topic: TOPIC,
           file2: "02-b.json", topic2: { ...TOPIC, id: "t2" } }));
});

guard("structural kinds: malformed docs rejected", async () => {
  const base = { roadmap: "astro", by: { uid: "u", name: "U" },
    mergedBy: { uid: "gardener-uid", name: "Stella" }, note: "", at: 1 };
  // unknown kind
  await rut.assertFails(db("gardener-uid").collection("merged")
    .add({ ...base, kind: "rename", file: "01-a.json", topic: TOPIC }));
  // add without a position
  await rut.assertFails(db("gardener-uid").collection("merged")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC }));
  // remove with a path-traversal file name
  await rut.assertFails(db("gardener-uid").collection("merged")
    .add({ ...base, kind: "remove", file: "../meta.json" }));
  // spine that isn't a list
  await rut.assertFails(db("gardener-uid").collection("merged")
    .add({ ...base, kind: "spine", spine: "01-a.json" }));
  // move onto itself
  await rut.assertFails(db("gardener-uid").collection("merged")
    .add({ ...base, kind: "move", file: "01-a.json", topic: TOPIC,
           file2: "01-a.json", topic2: TOPIC }));
  // non-moderator can never create merged docs, structural or not
  await rut.assertFails(db("user-uid").collection("merged")
    .add({ ...base, mergedBy: { uid: "user-uid", name: "U" },
           kind: "remove", file: "03-old.json" }));
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
  await rut.assertFails(db("gardener-uid").doc(`proposals/${ref.id}`)
    .update({ status: "merged", topic: { id: "swapped" } }));
  await rut.assertSucceeds(db("gardener-uid").doc(`proposals/${ref.id}`)
    .update({ status: "merged", decidedAt: 2, decidedBy: { uid: "gardener-uid", name: "Stella" } }));
});
